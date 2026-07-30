import crypto from 'node:crypto';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';

import express from 'express';
import sanitize from 'sanitize-filename';

import { tryParse, getConfigValue } from '../util.js';

export const router = express.Router();

/**
 * @typedef {object} LanChatMessage
 * @property {string} id Unique message ID
 * @property {'human' | 'ai'} senderType Sender type
 * @property {string} senderName Sender display name
 * @property {string} content Message text content
 * @property {number} timestamp Unix timestamp (ms)
 * @property {number} seq Monotonic sequence number within the room
 */

/**
 * @typedef {object} LanChatRoom
 * @property {string} id Room ID
 * @property {string} name Room display name
 * @property {string} token Room join token
 * @property {string} hostUserId Host user ID
 * @property {Set<object>} clients Connected WebSocket clients
 * @property {LanChatMessage[]} messages Message history (in-memory buffer)
 * @property {number} nextSeq Next sequence number
 * @property {string[]} aiCharacterIds Invited AI character IDs
 */

/** @type {Map<string, LanChatRoom>} */
const rooms = new Map();

/** @type {Map<object, {roomId: string, userId: string, name: string}>} */
const clientInfo = new Map();

/** @type {WebSocketServer | null} */
let wsServer = null;

const MAX_HISTORY = 200;
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;

/**
 * Gets the directory for LAN chat persistence.
 * @returns {string}
 */
function getLanChatsDir() {
    const dir = path.join(globalThis.DATA_ROOT, 'default-user', 'lan-chats');
    return dir;
}

/**
 * Ensures the LAN chats directory exists.
 * @returns {Promise<void>}
 */
async function ensureLanChatsDir() {
    const dir = getLanChatsDir();
    await fsPromises.mkdir(dir, { recursive: true });
}

/**
 * Appends a message to the room's JSONL file (async, fire-and-forget).
 * @param {string} roomId
 * @param {object} message
 */
function appendMessageToFile(roomId, message) {
    const enabled = getConfigValue('lanDiscovery.persistHistory', false, 'boolean');
    if (!enabled) return;

    ensureLanChatsDir().then(() => {
        const filePath = path.join(getLanChatsDir(), `${sanitize(roomId)}.jsonl`);
        fsPromises.appendFile(filePath, JSON.stringify(message) + '\n').catch(() => { /* ignore */ });
    }).catch(() => { /* ignore */ });
}

/**
 * Generates a random room ID.
 * @returns {string}
 */
function generateRoomId() {
    return crypto.randomUUID().slice(0, 8);
}

/**
 * Generates a random room token.
 * @returns {string}
 */
function generateToken() {
    return crypto.randomBytes(12).toString('hex');
}

/**
 * Generates a unique user ID.
 * @returns {string}
 */
function generateUserId() {
    return crypto.randomUUID().slice(0, 8);
}

/**
 * Parses the URL search params from a WebSocket upgrade request to extract room/token/name.
 * @param {import('http').IncomingMessage} req The upgrade request
 * @returns {{roomId: string, token: string, name: string}}
 */
function parseConnectParams(req) {
    const url = new URL(req.url || '', 'http://localhost');
    const roomId = url.searchParams.get('roomId') || '';
    const token = url.searchParams.get('token') || '';
    const name = url.searchParams.get('name') || 'Anonymous';
    return { roomId, token, name };
}

/**
 * Broadcasts a message to all clients in a room.
 * @param {LanChatRoom} room The room to broadcast to
 * @param {object} message The message object to send
 * @param {object} [exclude] Optional client to exclude
 */
function broadcast(room, message, exclude) {
    const data = JSON.stringify(message);
    for (const client of room.clients) {
        if (client !== exclude && client.readyState === 1) { // WebSocket.OPEN
            client.send(data);
        }
    }
}

/**
 * Sends a message to a single client.
 * @param {object} ws The WebSocket client
 * @param {object} message The message object to send
 */
function send(ws, message) {
    if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify(message));
    }
}

/**
 * Handles a new WebSocket connection.
 * @param {object} ws The WebSocket client
 * @param {import('http').IncomingMessage} req The upgrade request
 */
function handleConnection(ws, req) {
    const { roomId, token, name } = parseConnectParams(req);

    const room = rooms.get(roomId);
    if (!room) {
        send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Room does not exist' });
        ws.close(4004, 'Room not found');
        return;
    }

    if (room.token !== token) {
        send(ws, { type: 'error', code: 'INVALID_TOKEN', message: 'Invalid room token' });
        ws.close(4003, 'Invalid token');
        return;
    }

    const userId = generateUserId();
    clientInfo.set(ws, { roomId, userId, name });

    room.clients.add(ws);

    // Send room-sync to the new client
    send(ws, {
        type: 'room-sync',
        roomId: room.id,
        roomName: room.name,
        messages: room.messages.slice(-MAX_HISTORY),
        onlineUsers: Array.from(room.clients).map(c => {
            const info = clientInfo.get(c);
            return info ? { userId: info.userId, name: info.name } : null;
        }).filter(Boolean),
        aiCharacterIds: room.aiCharacterIds,
    });

    // Notify others
    broadcast(room, {
        type: 'user-join',
        userId,
        name,
        timestamp: Date.now(),
    }, ws);

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            send(ws, { type: 'error', code: 'INVALID_JSON', message: 'Invalid JSON' });
            return;
        }

        switch (msg.type) {
            case 'chat-message': {
                if (typeof msg.content !== 'string' || msg.content.trim().length === 0) return;
                const seq = room.nextSeq++;
                const message = {
                    type: 'chat-message',
                    id: crypto.randomUUID(),
                    senderType: 'human',
                    senderName: name,
                    userId,
                    content: msg.content.slice(0, 4000),
                    timestamp: Date.now(),
                    seq,
                };
                room.messages.push(message);
                if (room.messages.length > MAX_HISTORY * 2) {
                    room.messages = room.messages.slice(-MAX_HISTORY);
                }
                broadcast(room, message);
                appendMessageToFile(room.id, message);
                break;
            }

            case 'ai-message': {
                // Only host can emit AI messages
                const info = clientInfo.get(ws);
                if (!info || info.userId !== room.hostUserId) return;
                if (typeof msg.content !== 'string' || msg.content.trim().length === 0) return;
                const seq = room.nextSeq++;
                const message = {
                    type: 'ai-message',
                    id: crypto.randomUUID(),
                    senderType: 'ai',
                    senderName: msg.senderName || 'AI',
                    content: msg.content.slice(0, 8000),
                    timestamp: Date.now(),
                    seq,
                };
                room.messages.push(message);
                if (room.messages.length > MAX_HISTORY * 2) {
                    room.messages = room.messages.slice(-MAX_HISTORY);
                }
                broadcast(room, message);
                appendMessageToFile(room.id, message);
                break;
            }

            case 'typing': {
                broadcast(room, {
                    type: 'typing',
                    userId,
                    name,
                    isTyping: !!msg.isTyping,
                }, ws);
                break;
            }

            case 'room-sync-request': {
                const sinceSeq = typeof msg.sinceSeq === 'number' ? msg.sinceSeq : 0;
                const missed = room.messages.filter(m => m.seq > sinceSeq);
                send(ws, {
                    type: 'room-sync',
                    roomId: room.id,
                    roomName: room.name,
                    messages: missed,
                    onlineUsers: Array.from(room.clients).map(c => {
                        const info = clientInfo.get(c);
                        return info ? { userId: info.userId, name: info.name } : null;
                    }).filter(Boolean),
                    aiCharacterIds: room.aiCharacterIds,
                });
                break;
            }

            case 'pong': {
                ws.__isAlive = true;
                break;
            }

            default:
                break;
        }
    });

    ws.on('close', () => {
        const info = clientInfo.get(ws);
        if (info) {
            const r = rooms.get(info.roomId);
            if (r) {
                r.clients.delete(ws);
                broadcast(r, {
                    type: 'user-leave',
                    userId: info.userId,
                    name: info.name,
                    timestamp: Date.now(),
                });
            }
        }
        clientInfo.delete(ws);
    });

    ws.on('error', () => {
        ws.close();
    });

    ws.__isAlive = true;
}

/**
 * Starts the WebSocket server attached to the given HTTP server.
 * @param {import('http').Server | import('https').Server} server The HTTP/HTTPS server to attach to
 */
export function initLanChatWebSocket(server) {
    wsServer = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url || '', 'http://localhost');
        if (url.pathname !== '/api/lan-chat/ws') return;

        wsServer.handleUpgrade(req, socket, head, (ws) => {
            wsServer.emit('connection', ws, req);
        });
    });

    wsServer.on('connection', handleConnection);

    // Heartbeat
    const interval = setInterval(() => {
        if (!wsServer) return;
        for (const ws of wsServer.clients) {
            if (ws.__isAlive === false) {
                ws.terminate();
                continue;
            }
            ws.__isAlive = false;
            try {
                ws.ping();
            } catch {
                // ignore
            }
        }
    }, HEARTBEAT_INTERVAL_MS);

    wsServer.on('close', () => {
        clearInterval(interval);
    });
}

// --- REST API (host-side room management) ---

router.post('/create', (req, res) => {
    const name = String(req.body?.name || 'Untitled Room').slice(0, 100);
    const aiCharacterIds = Array.isArray(req.body?.aiCharacterIds)
        ? req.body.aiCharacterIds.map(String).slice(0, 50)
        : [];

    const roomId = generateRoomId();
    const token = generateToken();
    const hostUserId = generateUserId();

    /** @type {LanChatRoom} */
    const room = {
        id: roomId,
        name,
        token,
        hostUserId,
        clients: new Set(),
        messages: [],
        nextSeq: 0,
        aiCharacterIds,
    };

    rooms.set(roomId, room);

    res.json({
        roomId,
        token,
        hostUserId,
        name,
    });
});

router.post('/join', (req, res) => {
    const roomId = String(req.body?.roomId || '');
    const token = String(req.body?.token || '');

    const room = rooms.get(roomId);
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }

    if (room.token !== token) {
        return res.status(403).json({ error: 'Invalid token' });
    }

    res.json({
        roomId: room.id,
        name: room.name,
        hostUserId: room.hostUserId,
        aiCharacterIds: room.aiCharacterIds,
        onlineCount: room.clients.size,
    });
    return;
});

router.post('/leave', (req, res) => {
    const roomId = String(req.body?.roomId || '');
    const room = rooms.get(roomId);
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }

    // The WebSocket close handler does the actual cleanup;
    // this endpoint is mainly for API completeness.
    res.json({ ok: true });
    return;
});

router.get('/rooms', (_req, res) => {
    const list = Array.from(rooms.values()).map(r => ({
        roomId: r.id,
        name: r.name,
        onlineCount: r.clients.size,
        aiCharacterIds: r.aiCharacterIds,
        // Deliberately omit token — only host gets it at creation time
    }));
    res.json({ rooms: list });
    return;
});

router.get('/history/:roomId', async (req, res) => {
    const roomId = sanitize(String(req.params.roomId || ''));
    const filePath = path.join(getLanChatsDir(), `${roomId}.jsonl`);
    try {
        const data = await fsPromises.readFile(filePath, 'utf8');
        const messages = data.split('\n').filter(Boolean).map(line => {
            try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
        res.json({ messages });
    } catch {
        res.json({ messages: [] });
    }
    return;
});

router.post('/destroy', (req, res) => {
    const roomId = String(req.body?.roomId || '');
    const token = String(req.body?.token || '');

    const room = rooms.get(roomId);
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }

    if (room.token !== token) {
        return res.status(403).json({ error: 'Invalid token' });
    }

    // Notify all clients
    broadcast(room, { type: 'room-closed', message: 'Room has been closed by the host' });
    for (const client of room.clients) {
        try { client.close(4000, 'Room closed'); } catch { /* ignore */ }
    }

    rooms.delete(roomId);
    res.json({ ok: true });
    return;
});

/**
 * Endpoint for host to submit an AI-generated message to the room.
 * The actual AI generation happens on the host's frontend (reusing the existing
 * Generate pipeline). This endpoint just broadcasts the result to all clients.
 */
router.post('/ai-generate', (req, res) => {
    const roomId = String(req.body?.roomId || '');
    const token = String(req.body?.token || '');
    const senderName = String(req.body?.senderName || 'AI').slice(0, 100);
    const content = String(req.body?.content || '');

    const room = rooms.get(roomId);
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }

    if (room.token !== token) {
        return res.status(403).json({ error: 'Invalid token' });
    }

    if (!content.trim()) {
        return res.status(400).json({ error: 'Content is required' });
    }

    broadcastAiMessage(roomId, senderName, content);
    res.json({ ok: true });
    return;
});

/**
 * Gets a room by ID (for internal use by AI generation pipeline).
 * @param {string} roomId
 * @returns {LanChatRoom | undefined}
 */
export function getRoom(roomId) {
    return rooms.get(roomId);
}

/**
 * Broadcasts an AI-generated message to a room (for internal use).
 * @param {string} roomId
 * @param {string} senderName
 * @param {string} content
 */
export function broadcastAiMessage(roomId, senderName, content) {
    const room = rooms.get(roomId);
    if (!room) return;

    const seq = room.nextSeq++;
    const message = {
        type: 'ai-message',
        id: crypto.randomUUID(),
        senderType: 'ai',
        senderName,
        content,
        timestamp: Date.now(),
        seq,
    };

    room.messages.push(message);
    if (room.messages.length > MAX_HISTORY * 2) {
        room.messages = room.messages.slice(-MAX_HISTORY);
    }

    broadcast(room, message);
    appendMessageToFile(roomId, message);
}
