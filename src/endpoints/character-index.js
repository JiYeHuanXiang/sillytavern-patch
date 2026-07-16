import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

/**
 * @typedef {Object} ShallowCharacter
 * @property {boolean} [shallow] Marker for shallow character data.
 * @property {string} [name]
 * @property {string} [avatar]
 * @property {string} [chat]
 * @property {*} [fav]
 * @property {number} [date_added]
 * @property {string} [create_date]
 * @property {number} [date_last_chat]
 * @property {number} [chat_size]
 * @property {number} [data_size]
 * @property {string[]} [tags]
 * @property {object} [data]
 */

/**
 * Cached entry for a single character file.
 * @typedef {Object} CharacterIndexEntry
 * @property {string} rel Relative path of the png (forward slashes), used as the key.
 * @property {number} mtimeMs File mtime in ms (fingerprint for the png itself).
 * @property {number} size File size in bytes.
 * @property {number} ctimeMs File ctime in ms (used as date_added when absent).
 * @property {number} chatDirMtime The mtime of the character's chat directory (0 if none), used as an incremental fingerprint for chat_size/date_last_chat.
 * @property {ShallowCharacter} shallow The cached shallow character payload served to the list.
 */

/**
 * In-memory + on-disk index of shallow character data, keyed by user handle.
 *
 * The index lives at `<DATA_ROOT>/_cache/characters-index/<handle>.json` and maps
 * relative png paths -> {@link CharacterIndexEntry}. It allows `/api/characters/all`
 * to skip reading/parsing the PNG entirely when the file's (mtimeMs, size) fingerprint
 * and the chat-directory mtime are unchanged.
 *
 * Mutations (create/rename/edit/delete/import/duplicate) call {@link CharacterIndexStore#markDirty}
 * for the affected handle; the index is flushed either eagerly (synchronous flush) by
 * mutating endpoints, or periodically by the server, so a crash never loses more than
 * the latest in-flight edits.
 */
class CharacterIndexStore {
    constructor() {
        /** @type {Map<string, Map<string, CharacterIndexEntry>>} handle -> (relPath -> entry) */
        this.stores = new Map();
        /** @type {Set<string>} Handles whose index has unsaved changes. */
        this.dirty = new Set();
    }

    static DIRECTORY = 'characters-index';
    static FLUSH_DELAY = 2000; // debounce flush 2s after the last mutation
    static FLUSH_INTERVAL = 60 * 1000; // safety-net periodic flush

    /** @type {NodeJS.Timeout | null} */
    #flushTimer = null;
    /** @type {boolean} Whether the safety-net periodic flush loop is scheduled. */
    #periodicScheduled = false;

    /**
     * Path to the index file for a given user handle.
     * @param {string} handle User handle
     * @returns {string}
     */
    #indexPath(handle) {
        return path.join(globalThis.DATA_ROOT, '_cache', CharacterIndexStore.DIRECTORY, `${handle}.json`);
    }

    /**
     * Lazily loads the index for a handle from disk (once) and returns the live map.
     * Missing/corrupt files are treated as an empty index.
     * @param {string} handle User handle
     * @returns {Map<string, CharacterIndexEntry>}
     */
    getStore(handle) {
        let store = this.stores.get(handle);
        if (store) {
            return store;
        }

        store = new Map();
        this.stores.set(handle, store);
        try {
            const indexPath = this.#indexPath(handle);
            if (fs.existsSync(indexPath)) {
                const raw = fs.readFileSync(indexPath, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) {
                    for (const entry of parsed.entries) {
                        if (entry && typeof entry.rel === 'string') {
                            store.set(entry.rel, entry);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`CharacterIndex: failed to load index for ${handle}, starting fresh`, error);
        }
        return store;
    }

    /**
     * Looks up a cached entry by relative path and validates it against the PNG fingerprint.
     *
     * Only the PNG file's (mtimeMs, size, ctimeMs) are used as the validity fingerprint, because
     * chat-directory mtime is NOT a reliable proxy for chat *content* changes (appending a message
     * does not change the directory mtime). chat_size / date_last_chat in the returned payload may
     * therefore be stale; callers that need fresh chat stats must recompute and overwrite them (see
     * {@link CharacterIndexStore#set} / the caller in processCharacterList).
     *
     * @param {string} handle User handle
     * @param {string} relPath Relative png path (forward slashes)
     * @param {{mtimeMs: number, size: number, ctimeMs: number}} pngStat File stat for the png
     * @returns {CharacterIndexEntry | null} The cached entry if the PNG fingerprint is unchanged, else null
     */
    get(handle, relPath, pngStat) {
        const store = this.getStore(handle);
        const entry = store.get(relPath);
        if (!entry) {
            return null;
        }
        if (
            entry.mtimeMs === pngStat.mtimeMs &&
            entry.size === pngStat.size &&
            entry.ctimeMs === pngStat.ctimeMs &&
            entry.shallow
        ) {
            return { ...entry, shallow: { ...entry.shallow } };
        }
        return null;
    }

    /**
     * Stores/updates a shallow character payload under its fingerprint and marks the index dirty.
     * @param {string} handle User handle
     * @param {string} relPath Relative png path (forward slashes)
     * @param {{mtimeMs: number, size: number, ctimeMs: number}} pngStat File stat for the png
     * @param {number} chatDirMtime Current mtime of the character's chat directory (0 if none)
     * @param {ShallowCharacter} shallow The shallow character payload to cache
     */
    set(handle, relPath, pngStat, chatDirMtime, shallow) {
        const store = this.getStore(handle);
        store.set(relPath, {
            rel: relPath,
            mtimeMs: pngStat.mtimeMs,
            size: pngStat.size,
            ctimeMs: pngStat.ctimeMs,
            chatDirMtime,
            shallow,
        });
        this.markDirty(handle);
    }

    /**
     * Removes a single entry (e.g. on delete) and marks the index dirty.
     * @param {string} handle User handle
     * @param {string} relPath Relative png path (forward slashes)
     */
    delete(handle, relPath) {
        const store = this.getStore(handle);
        if (store.delete(relPath)) {
            this.markDirty(handle);
        }
    }

    /**
     * Marks a handle's index as having unsaved changes and schedules a debounced flush.
     * @param {string} handle User handle
     */
    markDirty(handle) {
        this.dirty.add(handle);
        this.#scheduleFlush();
    }

    /**
     * Schedules a debounced background flush. Idempotent.
     * @returns {void}
     */
    #scheduleFlush() {
        if (this.#flushTimer) {
            clearTimeout(this.#flushTimer);
        }
        this.#flushTimer = setTimeout(() => this.flush().catch(() => { }), CharacterIndexStore.FLUSH_DELAY);
        if (!this.#periodicScheduled) {
            this.#periodicScheduled = true;
            setInterval(() => this.flush().catch(() => { }), CharacterIndexStore.FLUSH_INTERVAL).unref?.();
        }
    }

    /**
     * Persists all dirty handles' indices to disk. Safe to call concurrently.
     * @returns {Promise<void>}
     */
    async flush() {
        const handles = [...this.dirty];
        this.dirty.clear();
        if (this.#flushTimer) {
            clearTimeout(this.#flushTimer);
            this.#flushTimer = null;
        }
        for (const handle of handles) {
            const store = this.stores.get(handle);
            if (!store) {
                continue;
            }
            const indexPath = this.#indexPath(handle);
            const dir = path.dirname(indexPath);
            try {
                await fsPromises.mkdir(dir, { recursive: true });
                const payload = JSON.stringify({ version: 1, entries: [...store.values()] });
                await fsPromises.writeFile(indexPath, payload, 'utf8');
            } catch (error) {
                console.error(`CharacterIndex: failed to flush index for ${handle}`, error);
                // Re-mark dirty so the next flush retries.
                this.dirty.add(handle);
            }
        }
    }

    /**
     * Synchronously flushes all dirty indices. Used by mutating endpoints that need the
     * on-disk index to be consistent before responding (e.g. delete/rename/import).
     * @returns {void}
     */
    flushSync() {
        const handles = [...this.dirty];
        this.dirty.clear();
        if (this.#flushTimer) {
            clearTimeout(this.#flushTimer);
            this.#flushTimer = null;
        }
        for (const handle of handles) {
            const store = this.stores.get(handle);
            if (!store) {
                continue;
            }
            const indexPath = this.#indexPath(handle);
            const dir = path.dirname(indexPath);
            try {
                fs.mkdirSync(dir, { recursive: true });
                const payload = JSON.stringify({ version: 1, entries: [...store.values()] });
                writeFileAtomicSync(indexPath, payload, 'utf8');
            } catch (error) {
                console.error(`CharacterIndex: failed to flushSync index for ${handle}`, error);
                this.dirty.add(handle);
            }
        }
    }

    /**
     * Prunes index entries that no longer correspond to any png on disk. Called during
     * `/api/characters/all` after the file list is known, so stale entries (deleted files)
     * don't accumulate.
     * @param {string} handle User handle
     * @param {Set<string>} validRelPaths Relative png paths that currently exist
     */
    prune(handle, validRelPaths) {
        const store = this.getStore(handle);
        let changed = false;
        for (const rel of [...store.keys()]) {
            if (!validRelPaths.has(rel)) {
                store.delete(rel);
                changed = true;
            }
        }
        if (changed) {
            this.markDirty(handle);
        }
    }
}

export const characterIndex = new CharacterIndexStore();
