/**
 * @typedef {object} CacheUsage
 * @property {number} hit_tokens Number of prompt tokens served from cache.
 * @property {number} miss_tokens Number of prompt tokens not served from cache.
 * @property {number} total_tokens Total prompt tokens considered for the rate.
 * @property {number} hit_rate Cache hit rate as an integer percentage (0-100).
 * @property {'deepseek'|'openai'|'anthropic'|'gemini'} source Provider usage format.
 */

/**
 * Extracts and normalizes prompt cache usage from a provider payload.
 * Supports DeepSeek, OpenAI-compatible, Anthropic and Gemini response shapes.
 * @param {any} payload API response or streaming chunk.
 * @returns {CacheUsage|null} Normalized cache usage, or null if the payload has none.
 */
export function extractCacheUsage(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const candidates = [
        payload.usage,
        payload.message?.usage,
        payload.usageMetadata,
        payload.usage_metadata,
        payload.response?.usage,
        payload.response?.usageMetadata,
        payload.response?.usage_metadata,
    ];

    for (const usage of candidates) {
        if (!usage || typeof usage !== 'object') {
            continue;
        }

        const cacheUsage = extractFromUsage(usage);
        if (cacheUsage) {
            return cacheUsage;
        }
    }

    return null;
}

/**
 * Tries each supported provider usage shape in order.
 * @param {Record<string, any>} usage
 * @returns {CacheUsage|null}
 */
function extractFromUsage(usage) {
    return extractDeepSeekUsage(usage)
        ?? extractAnthropicUsage(usage)
        ?? extractOpenAIUsage(usage)
        ?? extractGeminiUsage(usage);
}

/**
 * DeepSeek reports cache hits and misses directly.
 * @param {Record<string, any>} usage
 * @returns {CacheUsage|null}
 */
function extractDeepSeekUsage(usage) {
    const hitValue = toFiniteNumber(usage.prompt_cache_hit_tokens);
    const missValue = toFiniteNumber(usage.prompt_cache_miss_tokens);

    if (hitValue === null && missValue === null) {
        return null;
    }

    const promptTokens = toFiniteNumber(usage.prompt_tokens);
    const hitTokens = hitValue ?? 0;
    let missTokens = missValue;

    if (missTokens === null) {
        missTokens = promptTokens !== null ? Math.max(0, promptTokens - hitTokens) : 0;
    }

    if (hitTokens + missTokens === 0 && promptTokens !== null) {
        missTokens = promptTokens;
    }

    return buildCacheUsage(hitTokens, missTokens, 'deepseek');
}

/**
 * Anthropic separates cache reads, cache writes and regular input tokens.
 * @param {Record<string, any>} usage
 * @returns {CacheUsage|null}
 */
function extractAnthropicUsage(usage) {
    const readTokens = toFiniteNumber(usage.cache_read_input_tokens);
    const creationTokens = toFiniteNumber(usage.cache_creation_input_tokens);

    if (readTokens === null && creationTokens === null) {
        return null;
    }

    const inputTokens = toFiniteNumber(usage.input_tokens) ?? 0;

    return buildCacheUsage(readTokens ?? 0, inputTokens + (creationTokens ?? 0), 'anthropic');
}

/**
 * OpenAI-compatible APIs report cached prompt tokens inside prompt_tokens.
 * @param {Record<string, any>} usage
 * @returns {CacheUsage|null}
 */
function extractOpenAIUsage(usage) {
    const cachedTokens = toFiniteNumber(usage.prompt_tokens_details?.cached_tokens)
        ?? toFiniteNumber(usage.input_tokens_details?.cached_tokens);

    if (cachedTokens === null) {
        return null;
    }

    const promptTokens = toFiniteNumber(usage.prompt_tokens)
        ?? toFiniteNumber(usage.input_tokens);

    if (promptTokens === null || promptTokens <= 0) {
        return null;
    }

    const hitTokens = Math.min(Math.max(0, cachedTokens), promptTokens);

    return buildCacheUsage(hitTokens, promptTokens - hitTokens, 'openai');
}

/**
 * Gemini reports cached prompt tokens inside promptTokenCount.
 * @param {Record<string, any>} usage
 * @returns {CacheUsage|null}
 */
function extractGeminiUsage(usage) {
    const cachedTokens = toFiniteNumber(usage.cachedContentTokenCount)
        ?? toFiniteNumber(usage.cached_content_token_count);

    if (cachedTokens === null) {
        return null;
    }

    const promptTokens = toFiniteNumber(usage.promptTokenCount)
        ?? toFiniteNumber(usage.prompt_token_count);

    if (promptTokens === null || promptTokens <= 0) {
        return null;
    }

    const hitTokens = Math.min(Math.max(0, cachedTokens), promptTokens);

    return buildCacheUsage(hitTokens, promptTokens - hitTokens, 'gemini');
}

/**
 * Normalizes token counts and computes a whole-number percentage.
 * @param {number} hitTokens
 * @param {number} missTokens
 * @param {CacheUsage['source']} source
 * @returns {CacheUsage|null}
 */
function buildCacheUsage(hitTokens, missTokens, source) {
    const hit = Math.max(0, Math.trunc(hitTokens));
    const miss = Math.max(0, Math.trunc(missTokens));
    const total = hit + miss;

    if (total <= 0) {
        return null;
    }

    return {
        hit_tokens: hit,
        miss_tokens: miss,
        total_tokens: total,
        hit_rate: Math.min(100, Math.max(0, Math.round((hit / total) * 100))),
        source,
    };
}

/**
 * Parses a numeric token count, accepting numeric strings from proxies.
 * @param {any} value
 * @returns {number|null}
 */
function toFiniteNumber(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}
