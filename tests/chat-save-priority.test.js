import { beforeAll, beforeEach, afterEach, describe, test, expect } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.SILLYTAVERN_BACKUPS_CHAT_ENABLED = 'false';
process.env.SILLYTAVERN_BACKUPS_CHAT_MAXTOTALBACKUPS = '-1';
process.env.SILLYTAVERN_BACKUPS_CHAT_THROTTLEINTERVAL = '0';
process.env.SILLYTAVERN_BACKUPS_CHAT_CHECKINTEGRITY = 'true';
process.env.SILLYTAVERN_MULTIWINDOW_ENABLED = 'true';

/** @type {import('../src/endpoints/chats.js')} */
let chats;

beforeAll(async () => {
    chats = await import('../src/endpoints/chats.js');
});

const SLUG = '1e6905db-bab6-4901-913b-06d18cab5a8f';
const OTHER_SLUG = 'f1c1d103-464a-418a-a643-f9dab81589b9';

function makeChat(slug, rev) {
    return [
        { user_name: 'User', chat_metadata: { integrity: slug, rev } },
        { name: 'Char', mes: 'Hello' },
    ];
}

function toJsonl(chatData) {
    return chatData.map(message => JSON.stringify(message)).join('\n');
}

describe('chat save error priority', () => {
    let tmpDir;
    let chatFile;
    let backupDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-chat-priority-'));
        chatFile = path.join(tmpDir, 'chat.jsonl');
        backupDir = path.join(tmpDir, 'backups');
        fs.mkdirSync(backupDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('reports a stale multi-window revision before an integrity mismatch', async () => {
        fs.writeFileSync(chatFile, toJsonl(makeChat(SLUG, 5)));

        await expect(chats.trySaveChat(makeChat(OTHER_SLUG, 3), chatFile, false, 'default-user', 'Char', backupDir, 3))
            .rejects.toThrow(/revision conflict/i);
    });

    test('reports an integrity mismatch when the revision matches', async () => {
        fs.writeFileSync(chatFile, toJsonl(makeChat(SLUG, 5)));

        await expect(chats.trySaveChat(makeChat(OTHER_SLUG, 5), chatFile, false, 'default-user', 'Char', backupDir, 5))
            .rejects.toThrow(/integrity check failed/i);
    });
});
