import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import ipMatch from 'ip-matching';
import { getConfigValue } from './util.js';

/**
 * SSRF protection for outbound fetches.
 *
 * Two layers cooperate:
 *  - this module validates a URL's scheme and resolves its hostname to
 *    classify the IP (blocks non-http(s), cloud-metadata, and—when
 *    allowPrivate is false—loopback/RFC1918/link-local/ULA/CGNAT);
 *  - the optional PrivateRequestAgent (private-request-filter.js) re-checks on
 *    every connection, covering redirects.
 *
 * Why allowPrivate: the CORS proxy has no legitimate local target, so it runs
 * strict (allowPrivate=false). The LLM API path legitimately points at local
 * inference backends (Ollama/llamacpp/KoboldCpp/text-gen-webui on 127.0.0.1/
 * RFC1918), so it runs permissive (allowPrivate=true) and only blocks
 * non-http(s) schemes and cloud-metadata endpoints.
 */

// Always blocked even when allowPrivate=true: cloud metadata + 0.0.0.0/8
// (the latter is "this host" on some stacks and has no legitimate fetch target).
const ALWAYS_BLOCK_RANGES = [
    ipMatch.getMatch('169.254.169.254/32'), // AWS/GCP/Azure IPv4 metadata
    ipMatch.getMatch('fd00:ec2::253/128'),  // AWS IPv6 metadata
    ipMatch.getMatch('0.0.0.0/8'),
];

// ipaddr.js range() values treated as "private" when allowPrivate is false.
// Includes loopback, RFC1918, link-local (covers 169.254.0.0/16), ULA, CGNAT,
// and unspecified. Using the library's own classification is more complete and
// less error-prone than maintaining a manual CIDR list.
const PRIVATE_RANGES = new Set([
    'private', 'loopback', 'linkLocal', 'uniqueLocal', 'carrierGradeNat', 'unspecified',
]);

/**
 * Classify a single IP literal. Throws on a blocked address.
 * @param {string} ipStr IP literal (v4 or v6, never a hostname)
 * @param {boolean} allowPrivate when false, loopback/RFC1918/link-local/ULA/CGNAT are blocked
 */
function classifyIp(ipStr, allowPrivate) {
    let addr = ipaddr.parse(ipStr);
    // Unwrap IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) so it can't bypass the
    // private-range check dressed as an IPv6 address.
    if (addr instanceof ipaddr.IPv6 && addr.isIPv4MappedAddress()) {
        addr = ipaddr.parse(addr.toIPv4Address().toString());
    }
    const literal = addr.toString();
    if (ALWAYS_BLOCK_RANGES.some(range => range.matches(literal))) {
        throw new Error('blocked cloud-metadata / 0.0.0.0 address');
    }
    if (!allowPrivate && PRIVATE_RANGES.has(addr.range())) {
        throw new Error(`blocked ${addr.range()} address`);
    }
}

/**
 * Validate a fetch target URL for SSRF safety.
 *
 * - scheme must be http or https (blocks file:, gopher:, data:, ftp:, ws: ...)
 * - hostname is resolved via DNS and every resolved IP is classified,
 *   guarding against DNS rebinding at call time
 * - allowPrivate=false (CORS proxy) blocks loopback/RFC1918/link-local/ULA/CGNAT
 * - allowPrivate=true (LLM API path) allows local inference backends but
 *   still blocks non-http(s) schemes and cloud-metadata endpoints
 *
 * Honors the `ssrfProtection` config switch (default true) as an escape hatch:
 * when false, validation is skipped entirely (pre-protection behavior).
 *
 * Note: node-fetch follows redirects by default; this helper only validates the
 * initial URL. Redirect-target IPs are re-checked by PrivateRequestAgent when it
 * is enabled, so the two layers are complementary.
 * @param {string} url The URL about to be fetched
 * @param {{allowPrivate?: boolean}} [opts] allowPrivate defaults to false (strict)
 * @returns {Promise<void>} resolves if safe; throws Error with a reason if not
 */
export async function assertSafeFetchUrl(url, { allowPrivate = false } = {}) {
    if (!getConfigValue('ssrfProtection', true, 'boolean')) {
        return;
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('invalid URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`non-http(s) scheme "${parsed.protocol}"`);
    }

    const host = parsed.hostname;
    // Literal IP (covers bare IPv4 and bracketed IPv6 like [::1]).
    if (ipaddr.isValid(host)) {
        classifyIp(host, allowPrivate);
        return;
    }

    // Hostname: resolve and classify every returned address.
    let addrs;
    try {
        addrs = await dns.lookup(host, { all: true });
    } catch {
        throw new Error(`cannot resolve host: ${host}`);
    }
    if (addrs.length === 0) {
        throw new Error(`unresolved host: ${host}`);
    }
    for (const a of addrs) {
        classifyIp(a.address, allowPrivate);
    }
}
