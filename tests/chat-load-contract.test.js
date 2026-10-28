import { beforeAll, beforeEach, afterEach, describe, test, expect } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// chats.js reads backup settings at module load; keep the environment self-contained.
process.env.SILLYTAVERN_BACKUPS_CHAT_ENABLED = 'false';
process.env.SILLYTAVERN_BACKUPS_CHAT_MAXTOTALBACKUPS = '-1';
process.env.SILLYTAVERN_BACKUPS_CHAT_THROTTLEINTERVAL = '0';
process.env.SILLYTAVERN_BACKUPS_CHAT_CHECKINTEGRITY = 'true';
process.env.SILLYTAVERN_MULTIWINDOW_ENABLED = 'false';

/** @type {import('../src/endpoints/chats.js')} */
let chats;

beforeAll(async () => {
    chats = await import('../src/endpoints/chats.js');
});

const BOM = String.fromCharCode(0xFEFF);

describe('getChatData contract', () => {
    let tmpDir;
    let chatDir;
    let chatFile;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-chat-load-'));
        chatDir = path.join(tmpDir, 'chats', 'Char');
        fs.mkdirSync(chatDir, { recursive: true });
        chatFile = path.join(chatDir, 'chat.jsonl');
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('returns an empty array for a missing file', () => {
        expect(chats.getChatData(chatFile, chatDir)).toEqual([]);
    });

    test('returns an empty array for an empty or whitespace-only file', () => {
        fs.writeFileSync(chatFile, ' \n\n');
        expect(chats.getChatData(chatFile, chatDir)).toEqual([]);
    });

    test('parses a valid JSONL file and ignores blank lines and a header BOM', () => {
        const header = { user_name: 'User', chat_metadata: { integrity: 'slug' } };
        fs.writeFileSync(chatFile, BOM + JSON.stringify(header) + '\n\n' + JSON.stringify({ name: 'Char', mes: 'Hi' }));
        expect(chats.getChatData(chatFile, chatDir)).toEqual([header, { name: 'Char', mes: 'Hi' }]);
    });

    test('keeps the readable prefix when only the trailing record is truncated', () => {
        const header = { user_name: 'User', chat_metadata: { integrity: 'slug' } };
        const message = { name: 'Char', mes: 'Hi' };
        fs.writeFileSync(chatFile, JSON.stringify(header) + '\n' + JSON.stringify(message) + '\n{"name":"Char","mes":"trunc');
        expect(chats.getChatData(chatFile, chatDir)).toEqual([header, message]);
    });

    test('throws for damage in the middle of the chat instead of dropping records', () => {
        fs.writeFileSync(chatFile, JSON.stringify({ user_name: 'User' }) + '\nnot json\n' + JSON.stringify({ name: 'Char', mes: 'Hi' }));
        expect(() => chats.getChatData(chatFile, chatDir)).toThrow(/parse/i);
    });

    test('throws when no record, including the header, is readable', () => {
        fs.writeFileSync(chatFile, 'not json\nalso not json\n');
        expect(() => chats.getChatData(chatFile, chatDir)).toThrow(/parse/i);
    });

    test('throws for a parsed line that is not an object', () => {
        fs.writeFileSync(chatFile, '42\n');
        expect(() => chats.getChatData(chatFile, chatDir)).toThrow(/parse/i);
    });

    test('refuses to read outside the allowed root', () => {
        const outsideFile = path.join(tmpDir, 'outside.jsonl');
        fs.writeFileSync(outsideFile, JSON.stringify({ name: 'Char' }));
        expect(() => chats.getChatData(outsideFile, chatDir)).toThrow(/outside/i);
    });
});
