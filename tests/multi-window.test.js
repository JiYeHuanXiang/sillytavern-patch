import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    CHAT_REV_FIELD,
    SETTINGS_REV_FIELD,
    checkChatRevision,
    checkSettingsRevision,
    nextChatRevision,
    readChatRevisionFromFirstLine,
} from '../src/multi-window.js';

// The pure decision functions take an `enabled` flag so we can exercise the
// conflict path without the process-wide config flag being on. These tests
// pass it explicitly; the module-level flag (false by default) is asserted
// separately at the bottom.

describe('readChatRevisionFromFirstLine', () => {
    test('returns null for empty/non-JSON input', () => {
        expect(readChatRevisionFromFirstLine('')).toBeNull();
        expect(readChatRevisionFromFirstLine(null)).toBeNull();
        expect(readChatRevisionFromFirstLine('not json')).toBeNull();
    });

    test('returns null when chat_metadata has no rev', () => {
        const line = JSON.stringify({ chat_metadata: { integrity: 'abc' } });
        expect(readChatRevisionFromFirstLine(line)).toBeNull();
    });

    test('returns the integer rev when present', () => {
        const line = JSON.stringify({ chat_metadata: { [CHAT_REV_FIELD]: 7 } });
        expect(readChatRevisionFromFirstLine(line)).toBe(7);
    });

    test('returns null for non-integer/negative rev', () => {
        const line = JSON.stringify({ chat_metadata: { [CHAT_REV_FIELD]: 'oops' } });
        expect(readChatRevisionFromFirstLine(line)).toBeNull();
        const neg = JSON.stringify({ chat_metadata: { [CHAT_REV_FIELD]: -1 } });
        expect(readChatRevisionFromFirstLine(neg)).toBeNull();
    });
});

describe('checkChatRevision', () => {
    const makeLine = (rev) => JSON.stringify({ chat_metadata: rev === null || rev === undefined ? {} : { [CHAT_REV_FIELD]: rev } });

    test('disabled flag = never a conflict', () => {
        const line = makeLine(5);
        expect(checkChatRevision(line, 4, false, false)).toEqual({ conflict: false, serverRev: null });
    });

    test('force=true bypasses the check even when enabled', () => {
        const line = makeLine(5);
        expect(checkChatRevision(line, 4, true, true)).toEqual({ conflict: false, serverRev: null });
    });

    test('no on-disk rev (new/legacy chat) = allowed', () => {
        expect(checkChatRevision(makeLine(undefined), 0, false, true)).toEqual({ conflict: false, serverRev: null });
        expect(checkChatRevision('', 0, false, true)).toEqual({ conflict: false, serverRev: null });
    });

    test('client sent no rev (legacy client) = allowed', () => {
        expect(checkChatRevision(makeLine(5), undefined, false, true)).toEqual({ conflict: false, serverRev: 5 });
        expect(checkChatRevision(makeLine(5), NaN, false, true)).toEqual({ conflict: false, serverRev: 5 });
        expect(checkChatRevision(makeLine(5), -1, false, true)).toEqual({ conflict: false, serverRev: 5 });
    });

    test('matching rev = no conflict', () => {
        expect(checkChatRevision(makeLine(5), 5, false, true)).toEqual({ conflict: false, serverRev: 5 });
    });

    test('stale rev = conflict (the core lost-update guard)', () => {
        // Client loaded rev 3, but disk is now 4 (another window saved first).
        const result = checkChatRevision(makeLine(4), 3, false, true);
        expect(result.conflict).toBe(true);
        expect(result.serverRev).toBe(4);
    });
});

describe('nextChatRevision', () => {
    const makeLine = (rev) => JSON.stringify({ chat_metadata: rev === null || rev === undefined ? {} : { [CHAT_REV_FIELD]: rev } });

    test('disabled flag = null (no rev field written, byte-identical to legacy)', () => {
        expect(nextChatRevision(makeLine(5), false, false)).toBeNull();
        expect(nextChatRevision('', false, false)).toBeNull();
    });

    test('enabled, existing rev = bump', () => {
        expect(nextChatRevision(makeLine(5), false, true)).toBe(6);
    });

    test('enabled, no on-disk rev (new chat) = start at 1', () => {
        expect(nextChatRevision('', false, true)).toBe(1);
        expect(nextChatRevision(makeLine(undefined), false, true)).toBe(1);
    });

    test('forced overwrite still bumps from the on-disk rev', () => {
        // The loser of the race becomes the new latest.
        expect(nextChatRevision(makeLine(4), true, true)).toBe(5);
    });
});

describe('checkSettingsRevision', () => {
    let tmpFile;

    beforeEach(() => {
        tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'st-mw-')), 'settings.json');
    });

    afterEach(() => {
        fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
    });

    const writeSettings = (obj) => fs.writeFileSync(tmpFile, JSON.stringify(obj), 'utf8');

    test('disabled flag = passthrough, no _mw_rev injected', () => {
        const payload = { main_api: 'openai' };
        const result = checkSettingsRevision(tmpFile, payload, false);
        expect(result.conflict).toBe(false);
        expect(result.nextRev).toBe(0);
        // body is the original payload untouched (no _mw_rev key added).
        expect(result.body).not.toHaveProperty(SETTINGS_REV_FIELD);
        expect(result.body.main_api).toBe('openai');
    });

    test('enabled, no file yet = first save accepted, rev 1', () => {
        const result = checkSettingsRevision(tmpFile, { main_api: 'openai' }, true);
        expect(result.conflict).toBe(false);
        expect(result.nextRev).toBe(1);
        expect(result.body[SETTINGS_REV_FIELD]).toBe(1);
    });

    test('enabled, file present but no _mw_rev (legacy) = accepted, rev 1', () => {
        writeSettings({ main_api: 'openai' });
        const result = checkSettingsRevision(tmpFile, { main_api: 'openai' }, true);
        expect(result.conflict).toBe(false);
        expect(result.nextRev).toBe(1);
    });

    test('enabled, client rev matches disk = accepted, bumped', () => {
        writeSettings({ main_api: 'openai', [SETTINGS_REV_FIELD]: 4 });
        const result = checkSettingsRevision(tmpFile, { main_api: 'openai', [SETTINGS_REV_FIELD]: 4 }, true);
        expect(result.conflict).toBe(false);
        expect(result.nextRev).toBe(5);
        expect(result.body[SETTINGS_REV_FIELD]).toBe(5);
    });

    test('enabled, client rev stale (another window saved) = conflict', () => {
        // Disk is at rev 5; client still thinks it's at 4.
        writeSettings({ main_api: 'openai', [SETTINGS_REV_FIELD]: 5 });
        const result = checkSettingsRevision(tmpFile, { main_api: 'openai', [SETTINGS_REV_FIELD]: 4 }, true);
        expect(result.conflict).toBe(true);
        expect(result.serverRev).toBe(5);
    });

    test('enabled, first save from client (no token sent) = accepted', () => {
        writeSettings({ main_api: 'openai', [SETTINGS_REV_FIELD]: 3 });
        const result = checkSettingsRevision(tmpFile, { main_api: 'openai' }, true);
        expect(result.conflict).toBe(false);
        expect(result.nextRev).toBe(4);
    });

    test('the ping-pong race is prevented', () => {
        // Two windows A and B both load settings at rev 2.
        writeSettings({ [SETTINGS_REV_FIELD]: 2 });
        const payloadA = { [SETTINGS_REV_FIELD]: 2, api: 'A' };
        const payloadB = { [SETTINGS_REV_FIELD]: 2, api: 'B' };

        // A saves first: accepted, disk becomes rev 3.
        const a = checkSettingsRevision(tmpFile, payloadA, true);
        expect(a.conflict).toBe(false);
        fs.writeFileSync(tmpFile, JSON.stringify(a.body), 'utf8');

        // B now saves with the stale rev 2: must be rejected (no silent overwrite).
        const b = checkSettingsRevision(tmpFile, payloadB, true);
        expect(b.conflict).toBe(true);
        expect(b.serverRev).toBe(3);
    });
});
