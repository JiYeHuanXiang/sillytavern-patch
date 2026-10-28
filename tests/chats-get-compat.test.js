import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setConfigFilePath } from '../src/util.js';

process.env.SILLYTAVERN_BACKUPS_CHAT_ENABLED = 'false';
process.env.SILLYTAVERN_BACKUPS_CHAT_MAXTOTALBACKUPS = '-1';
process.env.SILLYTAVERN_BACKUPS_CHAT_THROTTLEINTERVAL = '0';
process.env.SILLYTAVERN_MULTIWINDOW_ENABLED = 'false';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-chat-get-compat-'));
const configPath = path.join(tmpDir, 'config.yaml');
fs.writeFileSync(configPath, [
    'backups:',
    '  chat:',
    '    enabled: false',
    '    checkIntegrity: true',
    'multiWindow:',
    '  enabled: false',
].join('\n'));
setConfigFilePath(configPath);
const chatsDir = path.join(tmpDir, 'chats');
const characterDir = path.join(chatsDir, 'Char');
fs.mkdirSync(characterDir, { recursive: true });
fs.writeFileSync(path.join(characterDir, 'valid.jsonl'), [
    JSON.stringify({ user_name: 'User', chat_metadata: { integrity: 'slug' } }),
    JSON.stringify({ name: 'Char', mes: 'Hi' }),
].join('\n'));
fs.writeFileSync(path.join(characterDir, 'broken.jsonl'), [
    JSON.stringify({ user_name: 'User' }),
    'not json',
    JSON.stringify({ name: 'Char', mes: 'Hi' }),
].join('\n'));

let server;
let baseUrl;

beforeAll(async () => {
    const { router } = await import('../src/endpoints/chats.js');
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.user = {
            profile: { handle: 'test-user' },
            directories: { chats: chatsDir },
        };
        next();
    });
    app.use('/api/chats', router);

    await new Promise(resolve => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function requestGet(body, strict) {
    return fetch(`${baseUrl}/api/chats/get`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(strict ? { 'X-Require-Chat-Array': '1' } : {}),
        },
        body: JSON.stringify(body),
    });
}

const baseBody = {
    ch_name: 'Char',
    avatar_url: 'Char.png',
    file_name: 'valid',
};

describe('GET /api/chats/get compatibility', () => {
    test('returns an array to the strict core client', async () => {
        const response = await requestGet(baseBody, true);
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data).toHaveLength(2);
    });

    test('keeps the legacy 200 + {} contract for missing file_name', async () => {
        const body = { ch_name: 'Char', avatar_url: 'Char.png' };

        const strict = await requestGet(body, true);
        expect(strict.status).toBe(400);

        const legacy = await requestGet(body, false);
        expect(legacy.status).toBe(200);
        expect(await legacy.json()).toEqual({});
    });

    test('rejects middle corruption for the strict client and keeps legacy {} shape', async () => {
        const body = { ...baseBody, file_name: 'broken' };

        const strict = await requestGet(body, true);
        expect(strict.status).toBe(500);

        const legacy = await requestGet(body, false);
        expect(legacy.status).toBe(200);
        expect(await legacy.json()).toEqual({});
    });
});
