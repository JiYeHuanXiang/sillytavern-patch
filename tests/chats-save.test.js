import { afterAll, afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setConfigFilePath } from '../src/util.js';

// chats.js reads backup settings via getConfigValue at module scope, which
// requires a config file path. Point the loader at a throwaway config (all
// keys fall back to their defaults; chat backups are disabled so the throttled
// backup writer stays silent) before dynamically importing chats.js —
// a static import would hoist above this setup.
const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-chats-cfg-'));
fs.writeFileSync(path.join(configDir, 'config.yaml'), 'backups:\n  chat:\n    enabled: false\n    throttleInterval: 1\n', 'utf8');
setConfigFilePath(path.join(configDir, 'config.yaml'));

const { trySaveChat } = await import('../src/endpoints/chats.js');

afterAll(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
});

// Regression tests for the multi-window pre-save read in trySaveChat.
//
// The pre-read used to call readFirstLine on the target path unconditionally,
// which rejects with ENOENT when the chat file doesn't exist yet — 500ing the
// first save of every brand-new chat (client-side "Chat could not be saved"
// toast; most visible when messaging the neutral Assistant on a fresh page,
// which materialises a new chat file on first send).

describe('trySaveChat', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-chats-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // Backups are disabled via the temp config; the path only satisfies the signature.
    const backupDir = path.join(os.tmpdir(), 'st-chats-backup-unused');

    const chatData = () => [
        { chat_metadata: { integrity: 'test-slug' }, user_name: 'unused', character_name: 'unused' },
        { name: 'User', is_user: true, mes: 'hi', send_date: new Date().toISOString() },
    ];

    test('first save of a brand-new chat file succeeds instead of rejecting with ENOENT', async () => {
        const file = path.join(tmpDir, 'Assistant - 2026-08-22@22h31m57s311ms.jsonl');

        await trySaveChat(chatData(), file, false, 'test', 'card', backupDir);

        expect(fs.existsSync(file)).toBe(true);
        const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
        expect(lines).toHaveLength(2);
    });

    test('subsequent save to the now-existing file succeeds and keeps the rev-less format with the flag off', async () => {
        const file = path.join(tmpDir, 'chat.jsonl');

        // Distinct handles map to distinct throttled backup functions, so no
        // trailing-edge timer is scheduled to keep Jest's event loop alive.
        const rev1 = await trySaveChat(chatData(), file, false, 'test-first-save', 'card', backupDir);
        const rev2 = await trySaveChat(chatData(), file, false, 'test-second-save', 'card', backupDir);

        // multiWindow disabled (module default): no rev stamped, byte-identical legacy behaviour.
        expect(rev1).toBeNull();
        expect(rev2).toBeNull();
        const header = JSON.parse(fs.readFileSync(file, 'utf8').split('\n')[0]);
        expect(header.chat_metadata).not.toHaveProperty('rev');
    });
});
