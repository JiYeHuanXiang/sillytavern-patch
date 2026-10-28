import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setConfigFilePath } from '../src/util.js';

process.env.SILLYTAVERN_BACKUPS_CHAT_ENABLED = 'false';
process.env.SILLYTAVERN_BACKUPS_CHAT_MAXTOTALBACKUPS = '-1';
process.env.SILLYTAVERN_BACKUPS_CHAT_THROTTLEINTERVAL = '0';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-character-edit-'));
const charactersDir = path.join(tmpDir, 'characters');
fs.mkdirSync(charactersDir, { recursive: true });
global.DATA_ROOT = tmpDir;
setConfigFilePath(path.join(tmpDir, 'config.yaml'));
fs.writeFileSync(path.join(tmpDir, 'config.yaml'), [
    'backups:',
    '  chat:',
    '    enabled: false',
    'performance:',
    '  useDiskCache: false',
    '  lazyLoadCharacters: false',
].join('\n'));

let server;
let baseUrl;

beforeAll(async () => {
    const { router } = await import('../src/endpoints/characters.js');
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use((request, _response, next) => {
        request.user = {
            profile: { handle: 'test-user' },
            directories: {
                characters: charactersDir,
                thumbnails: path.join(tmpDir, 'thumbnails'),
                user: path.join(tmpDir, 'user'),
            },
        };
        next();
    });
    app.use('/api/characters', router);

    await new Promise(resolve => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function editBody(avatarUrl) {
    return {
        avatar_url: avatarUrl,
        ch_name: 'Test Character',
        description: 'A test',
        personality: '',
        scenario: '',
        first_mes: 'Hello',
        mes_example: '',
    };
}

describe('character edit guard', () => {
    test('does not recreate a character whose avatar file is gone', async () => {
        const response = await fetch(`${baseUrl}/api/characters/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(editBody('deleted-character.png')),
        });

        expect(response.status).toBe(404);
        expect(fs.readdirSync(charactersDir)).toEqual([]);
    });

    test('still allows editing an existing character', async () => {
        const avatarName = 'existing-character.png';
        const avatarPath = path.join(charactersDir, avatarName);
        fs.copyFileSync(new URL('../public/img/ai4.png', import.meta.url), avatarPath);

        const response = await fetch(`${baseUrl}/api/characters/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(editBody(avatarName)),
        });

        expect(response.status).toBe(200);
        expect(fs.existsSync(avatarPath)).toBe(true);
    });
});
