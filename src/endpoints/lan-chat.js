import crypto from 'node:crypto';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';

import express from 'express';

import { getUserDirectories } from '../users.js';

export const router = express.Router();

/**
 * @typedef {object} LanClient
 * @property {string} userId
 * @property {string} name
 * @property {string} roomId
 */

/**
 * @typedef {object} LanRoom
 * @property {string} id Room ID (same as group ID)
 * @property {string} groupGroupId The SillyTavern group ID
 * @property {string} chatId The group chat file ID
 * @property {string} token Room join token
 * @property {string} hostUserId Host user ID
 * @property {Map<object, LanClient>} clients WebSocket → client info
 */

/** @type {Map<string, LanRoom>} */
const rooms = new Map();

/** @type {WebSocketServer | null} */
let wsServer = null;

const HEARTBEAT_INTERVAL_MS = 30_000;

function generateToken() {
    return crypto.randomBytes(12).toString('hex');
}

function generateUserId() {
    return crypto.randomUUID().slice(0, 8);
}

/**
 * Broadcasts a message to all clients in a room.
 * @param {LanRoom} room
 * @param {object} message
 * @param {object} [exclude]
 */
function broadcast(room, message, exclude) {
    const data = JSON.stringify(message);
    for (const [ws] of room.clients) {
        if (ws !== exclude && ws.readyState === 1) {
            ws.send(data);
        }
    }
}

function send(ws, message) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(message));
    }
}

/**
 * Gets the file path for a group chat.
 * @param {string} chatId
 * @returns {string}
 */
function getGroupChatFilePath(chatId) {
    const dirs = getUserDirectories('default-user');
    return path.join(dirs.groupChats, `${chatId}.jsonl`);
}

/**
 * Appends a chat message to the group chat JSONL file.
 * @param {string} chatId
 * @param {object} message The ChatMessage object
 */
async function appendChatMessage(chatId, message) {
    const filePath = getGroupChatFilePath(chatId);
    await fsPromises.appendFile(filePath, JSON.stringify(message) + '\n');
}

/**
 * Re-reads the entire group chat file and sends it as a sync payload.
 * @param {LanRoom} room
 * @param {object} ws Target client
 */
async function sendFullSync(room, ws) {
    try {
        const filePath = getGroupChatFilePath(room.chatId);
        const raw = await fsPromises.readFile(filePath, 'utf8');
        const messages = raw.split('\n').filter(Boolean).map(line => {
            try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
        send(ws, {
            type: 'room-sync',
            groupId: room.id,
            messages,
            onlineUsers: getOnlineUsers(room),
        });
    } catch {
        send(ws, {
            type: 'room-sync',
            groupId: room.id,
            messages: [],
            onlineUsers: getOnlineUsers(room),
        });
    }
}

function getOnlineUsers(room) {
    return Array.from(room.clients.values()).map(c => ({
        userId: c.userId,
        name: c.name,
        isHost: c.isHost,
    }));
}

function parseConnectParams(req) {
    const url = new URL(req.url || '', 'http://localhost');
    return {
        roomId: url.searchParams.get('roomId') || '',
        token: url.searchParams.get('token') || '',
        name: url.searchParams.get('name') || 'Anonymous',
    };
}

function handleConnection(ws, req) {
    const { roomId, token, name } = parseConnectParams(req);

    const room = rooms.get(roomId);
    if (!room) {
        send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: '房间不存在' });
        ws.close(4004, 'Room not found');
        return;
    }

    if (room.token !== token) {
        send(ws, { type: 'error', code: 'INVALID_TOKEN', message: '令牌无效' });
        ws.close(4003, 'Invalid token');
        return;
    }

    // The first client to connect after room creation is the host.
    // (The host connects immediately after calling /create.)
    const isHost = room.clients.size === 0;
    const userId = isHost ? room.hostUserId : generateUserId();
    room.clients.set(ws, { userId, name, roomId, isHost });

    send(ws, {
        type: 'room-info',
        roomId: room.id,
        token: room.token,
        hostUserId: room.hostUserId,
        isHost,
    });

    sendFullSync(room, ws);

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
            return;
        }

        const clientInfo = room.clients.get(ws);
        if (!clientInfo) return;

        switch (msg.type) {
            case 'chat-message': {
                let chatMessage;

                if (msg.message && typeof msg.message === 'object' && typeof msg.message.mes === 'string') {
                    // Host relay: full ChatMessage object (preserves send_date for dedup)
                    chatMessage = msg.message;
                } else if (typeof msg.content === 'string' && msg.content.trim()) {
                    // Client send: raw content string
                    chatMessage = {
                        name: name,
                        is_user: true,
                        is_system: false,
                        send_date: new Date().toISOString(),
                        mes: msg.content.slice(0, 4000),
                        extra: { gen_id: Date.now() * Math.random() * 1000000 },
                    };
                } else {
                    return;
                }

                appendChatMessage(room.chatId, chatMessage).catch(err => {
                    console.warn('Failed to append chat message:', err.message);
                });

                broadcast(room, {
                    type: 'chat-message',
                    message: chatMessage,
                });
                break;
            }

            case 'ai-message': {
                if (!clientInfo.isHost) return;

                let chatMessage;

                if (msg.message && typeof msg.message === 'object' && typeof msg.message.mes === 'string') {
                    // Host relay: full AI ChatMessage object
                    chatMessage = msg.message;
                } else if (typeof msg.content === 'string' && msg.content.trim()) {
                    // Host relay: content + senderName
                    chatMessage = {
                        name: msg.senderName || 'AI',
                        is_user: false,
                        is_system: false,
                        send_date: new Date().toISOString(),
                        mes: msg.content.slice(0, 8000),
                        original_avatar: msg.avatar || undefined,
                        extra: { gen_id: Date.now() * Math.random() * 1000000 },
                    };
                } else {
                    return;
                }

                appendChatMessage(room.chatId, chatMessage).catch(err => {
                    console.warn('Failed to append AI message:', err.message);
                });

                broadcast(room, {
                    type: 'ai-message',
                    message: chatMessage,
                });
                break;
            }

            case 'typing': {
                broadcast(room, {
                    type: 'typing',
                    userId: clientInfo.userId,
                    name,
                    isTyping: !!msg.isTyping,
                }, ws);
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
        const info = room.clients.get(ws);
        if (info) {
            room.clients.delete(ws);
            broadcast(room, {
                type: 'user-leave',
                userId: info.userId,
                name: info.name,
                timestamp: Date.now(),
            });
        }
    });

    ws.on('error', () => ws.close());
    ws.__isAlive = true;
}

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

    const interval = setInterval(() => {
        if (!wsServer) return;
        for (const ws of wsServer.clients) {
            if (ws.__isAlive === false) {
                ws.terminate();
                continue;
            }
            ws.__isAlive = false;
            try { ws.ping(); } catch { /* ignore */ }
        }
    }, HEARTBEAT_INTERVAL_MS);

    wsServer.on('close', () => clearInterval(interval));
}

// --- REST API ---

/**
 * Creates a LAN room bound to a group chat.
 * Only the host (who has the group) calls this.
 */
router.post('/create', async (req, res) => {
    const groupId = String(req.body?.groupId || '');
    const chatId = String(req.body?.chatId || '');

    if (!groupId || !chatId) {
        return res.status(400).json({ error: 'groupId 和 chatId 不能为空' });
    }

    // Verify the group chat file exists
    const filePath = getGroupChatFilePath(chatId);
    try {
        await fsPromises.access(filePath);
    } catch {
        return res.status(404).json({ error: '群聊文件不存在' });
    }

    const token = generateToken();
    const hostUserId = generateUserId();

    /** @type {LanRoom} */
    const room = {
        id: groupId,
        groupGroupId: groupId,
        chatId,
        token,
        hostUserId,
        clients: new Map(),
    };

    rooms.set(groupId, room);

    res.json({
        roomId: groupId,
        token,
        hostUserId,
    });
    return;
});

/**
 * Verifies a room join request and returns room info.
 */
router.post('/join', (req, res) => {
    const roomId = String(req.body?.roomId || '');
    const token = String(req.body?.token || '');

    const room = rooms.get(roomId);
    if (!room) {
        return res.status(404).json({ error: '房间不存在' });
    }

    if (room.token !== token) {
        return res.status(403).json({ error: '令牌无效' });
    }

    res.json({
        roomId: room.id,
        hostUserId: room.hostUserId,
        onlineCount: room.clients.size,
    });
    return;
});

/**
 * Gets connection info for a room (used by clients to fetch token from host).
 */
router.get('/info/:roomId', (req, res) => {
    const roomId = String(req.params.roomId || '');
    const room = rooms.get(roomId);
    if (!room) {
        return res.status(404).json({ error: '房间不存在' });
    }

    res.json({
        roomId: room.id,
        hostUserId: room.hostUserId,
        onlineCount: room.clients.size,
        onlineUsers: getOnlineUsers(room),
    });
    return;
});

/**
 * Destroys a room (host only).
 */
router.post('/destroy', (req, res) => {
    const roomId = String(req.body?.roomId || '');
    const token = String(req.body?.token || '');

    const room = rooms.get(roomId);
    if (!room) {
        return res.status(404).json({ error: '房间不存在' });
    }

    if (room.token !== token) {
        return res.status(403).json({ error: '令牌无效' });
    }

    broadcast(room, { type: 'room-closed', message: '房主已关闭房间' });
    for (const [ws] of room.clients) {
        try { ws.close(4000, 'Room closed'); } catch { /* ignore */ }
    }

    rooms.delete(roomId);
    res.json({ ok: true });
    return;
});

/**
 * Host submits an AI-generated message to broadcast.
 */
router.post('/ai-generate', (req, res) => {
    const roomId = String(req.body?.roomId || '');
    const token = String(req.body?.token || '');
    const content = String(req.body?.content || '');
    const senderName = String(req.body?.senderName || 'AI').slice(0, 100);
    const avatar = String(req.body?.avatar || '');

    const room = rooms.get(roomId);
    if (!room) {
        return res.status(404).json({ error: '房间不存在' });
    }
    if (room.token !== token) {
        return res.status(403).json({ error: '令牌无效' });
    }
    if (!content.trim()) {
        return res.status(400).json({ error: '内容不能为空' });
    }

    const chatMessage = {
        name: senderName,
        is_user: false,
        is_system: false,
        send_date: new Date().toISOString(),
        mes: content.slice(0, 8000),
        original_avatar: avatar || undefined,
        extra: { gen_id: Date.now() * Math.random() * 1000000 },
    };

    appendChatMessage(room.chatId, chatMessage).catch(err => {
        console.warn('Failed to append AI message:', err.message);
    });

    broadcast(room, { type: 'ai-message', message: chatMessage });
    res.json({ ok: true });
    return;
});
