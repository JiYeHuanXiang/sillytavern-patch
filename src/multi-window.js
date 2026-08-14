import fs from 'node:fs';
import { getConfigValue } from './util.js';

/**
 * Multi-window lost-update protection (see upstream issue #5864).
 *
 * When `multiWindow.enabled` is on, entities written by blind whole-file
 * overwrite (settings.json, chat JSONL) carry a monotonic revision token and
 * saves perform compare-and-swap: a mismatched revision means another window
 * wrote first → the save is rejected with HTTP 409 `{ error: 'conflict' }`
 * instead of silently clobbering the other window's data.
 *
 * With the flag off (default) every function here is a no-op / returns values
 * that leave behaviour byte-identical to the pre-multi-window code, so there is
 * no behaviour change for users who do not opt in. The flag is read lazily via
 * isMultiWindowEnabled() (not at module load) so importing this module in tests
 * does not require a configured server; restart the server to change it.
 */

/** HTTP header carrying the client-generated window/tab id (a uuid). */
export const WINDOW_ID_HEADER = 'x-window-id';

/** Revision field names persisted inside each protected entity's on-disk format. */
export const SETTINGS_REV_FIELD = '_mw_rev';
export const CHAT_REV_FIELD = 'rev';

/**
 * Whether multi-window protection is enabled. Reads the config flag lazily so
 * the module is import-safe without a configured server (tests import the pure
 * decision functions directly and pass `enabled` explicitly).
 * @returns {boolean}
 */
export function isMultiWindowEnabled() {
    return !!getConfigValue('multiWindow.enabled', false, 'boolean');
}

/**
 * Reads the requesting window's id from the request header, if present.
 * @param {import('express').Request} request
 * @returns {string | undefined}
 */
export function getWindowId(request) {
    const value = request?.headers?.[WINDOW_ID_HEADER];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Reads the current settings revision persisted on disk.
 * Returns 0 when the file is missing, unparseable, or has no revision field
 * (i.e. a pre-multi-window file or a brand-new user).
 * @param {string} pathToSettings Absolute path to settings.json
 * @returns {number}
 */
function readSettingsRevision(pathToSettings) {
    try {
        if (!fs.existsSync(pathToSettings)) {
            return 0;
        }
        const raw = fs.readFileSync(pathToSettings, 'utf8');
        const parsed = JSON.parse(raw);
        const rev = Number(parsed?.[SETTINGS_REV_FIELD]);
        return Number.isInteger(rev) && rev >= 0 ? rev : 0;
    } catch {
        return 0;
    }
}

/**
 * Compare-and-swap for the settings blob.
 *
 * @param {string} pathToSettings Absolute path to settings.json
 * @param {*} payload The incoming request body (will be persisted as-is if no conflict)
 * @param {boolean} [enabled] Whether multi-window protection is on; defaults to the module flag. Passed explicitly by tests, and by callers that already read the flag, so the decision is pure/testable.
 * @returns {{ conflict: true, serverRev: number } | { conflict: false, nextRev: number, body: object }}
 *   On conflict, `serverRev` is the revision currently on disk so the client
 *   can refresh. On success, `nextRev` is the revision to write and `body` is
 *   the (possibly augmented) object to serialise.
 */
export function checkSettingsRevision(pathToSettings, payload, enabled = false) {
    if (!enabled) {
        return { conflict: false, nextRev: 0, body: payload };
    }

    const serverRev = readSettingsRevision(pathToSettings);
    const clientRev = Number(payload?.[SETTINGS_REV_FIELD]);

    // First save (client has no token yet) or matching token → accept.
    const firstSave = !Number.isInteger(clientRev) || clientRev < 0;
    if (firstSave || clientRev === serverRev) {
        const body = { ...(payload || {}), [SETTINGS_REV_FIELD]: serverRev + 1 };
        return { conflict: false, nextRev: serverRev + 1, body };
    }

    return { conflict: true, serverRev };
}

/**
 * Reads a chat file's persisted revision from its first line's chat_metadata.
 * Returns null when the file is missing/empty/has no `rev` field (i.e. a
 * pre-multi-window chat or a new chat) — callers treat null as "no revision
 * to check yet".
 * @param {string} firstLine The first line of the chat JSONL (already read by the caller)
 * @returns {number | null}
 */
export function readChatRevisionFromFirstLine(firstLine) {
    if (!firstLine) {
        return null;
    }
    try {
        const parsed = JSON.parse(firstLine);
        const rev = Number(parsed?.chat_metadata?.[CHAT_REV_FIELD]);
        return Number.isInteger(rev) && rev >= 0 ? rev : null;
    } catch {
        return null;
    }
}

/**
 * Compare-and-swap for a chat save. Returns whether the save conflicts with a
 * newer on-disk revision.
 *
 * "No opinion" (returns false) when: the flag is off, the caller forces the
 * save, the on-disk chat has no `rev` field yet, or the incoming chat carries
 * no `rev` (first save of a chat). This mirrors the leniency of the existing
 * integrity check so enabling the flag never blocks a legitimate first save.
 *
 * @param {string} firstLine First line of the on-disk chat (null/empty if absent)
 * @param {number | undefined} clientRev The revision the client loaded with
 * @param {boolean} force Whether the client requested a forced overwrite
 * @param {boolean} [enabled] Whether multi-window protection is on; defaults to the module flag.
 * @returns {{ conflict: boolean, serverRev: number | null }}
 */
export function checkChatRevision(firstLine, clientRev, force, enabled = false) {
    if (!enabled || force) {
        return { conflict: false, serverRev: null };
    }

    const serverRev = readChatRevisionFromFirstLine(firstLine);

    // No on-disk revision yet → nothing to compare against, allow.
    if (serverRev === null) {
        return { conflict: false, serverRev: null };
    }

    const clientRevNum = Number(clientRev);
    // Client didn't send a revision (e.g. pre-multi-window client) → allow,
    // do not retroactively gate older clients.
    if (!Number.isInteger(clientRevNum) || clientRevNum < 0) {
        return { conflict: false, serverRev };
    }

    return { conflict: clientRevNum !== serverRev, serverRev };
}

/**
 * Computes the revision to persist when writing a chat.
 * Bumps from the on-disk value (or starts at 1 for a brand-new chat) when
 * multi-window is on; returns null (meaning "do not write a rev field") when
 * the flag is off, keeping the JSONL byte-identical to the pre-flag era.
 * @param {string | null} firstLine First line of the on-disk chat (null/empty if absent)
 * @param {boolean} force Whether the client requested a forced overwrite
 * @param {boolean} [enabled] Whether multi-window protection is on; defaults to the module flag.
 * @returns {number | null}
 */
export function nextChatRevision(firstLine, force, enabled = false) {
    if (!enabled) {
        return null;
    }

    const current = readChatRevisionFromFirstLine(firstLine);
    // A forced overwrite adopts the server's revision and still bumps it, so
    // the loser of the race becomes the new latest and subsequent saves
    // (including the other window's retry) compare against the bumped value.
    if (current !== null) {
        return current + 1;
    }
    return 1;
}
