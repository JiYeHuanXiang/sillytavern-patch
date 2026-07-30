import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

// ─────────────────────────────────────────────────────────────────────────────
// OneBot Bridge 服务器端插件
// 在酒馆内部模拟 OneBot 11 协议环境，让骰子机器人作为群聊成员加入，
// 全程不接触真实 QQ，安全不封号。
//
// 支持三种连接方式（可在前端设置面板分别启停）：
//   1. 反向 WebSocket（核心）：酒馆开 WS 服务端，骰子 bot 主动连过来
//   2. 正向 WebSocket：酒馆作客户端连骰子的 WS 服务端
//   3. HTTP API：酒馆作 HTTP 客户端调用骰子；骰子通过 webhook 上报
// ─────────────────────────────────────────────────────────────────────────────

export const info = {
    id: 'onebot-bridge',
    name: 'OneBot Bridge',
    description: 'Bridge SillyTavern group chats to OneBot-protocol dice bots (safe, no real QQ).',
};

// 运行时状态
const runtime = {
    // 反向 WS 服务端（骰子连过来）
    wsServer: null,
    // 已连接的骰子客户端（反向 WS 模式下可能多个）
    reverseClients: new Set(),
    // 正向 WS 客户端实例
    forwardClient: null,
    // 前端扩展订阅事件用的 SSE 响应对象集合
    sseClients: new Set(),
    // 当前配置（由前端扩展通过 /config 接口下发）
    config: {
        enabled: false,
        mode: 'reverse',           // 'reverse' | 'forward' | 'http'
        reversePort: 8081,
        reversePath: '/onebot/v11/ws',
        reverseToken: '',
        forwardUrl: '',
        forwardToken: '',
        httpUrl: '',
        httpToken: '',
        selfId: 10001,             // 伪装的骰子自身 QQ 号
        groupId: 100000,           // 伪装的群号
    },
    // 递增的 echo / message_id 计数器
    seq: 0,
    nextMessageId: 1,
};

function nextSeq() {
    return ++runtime.seq;
}

function nextMsgId() {
    return runtime.nextMessageId++;
}

/** 把配置合并进 runtime.config */
function applyConfig(partial) {
    if (!partial || typeof partial !== 'object') return;
    for (const k of Object.keys(runtime.config)) {
        if (k in partial) {
            runtime.config[k] = partial[k];
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 前端 <-> 服务端通信
// ─────────────────────────────────────────────────────────────────────────────

function sendToSseClients(type, payload) {
    const data = JSON.stringify({ type, payload, ts: Date.now() });
    for (const res of runtime.sseClients) {
        try {
            res.write(`event: ${type}\n`);
            res.write(`data: ${data}\n\n`);
            // compression 中间件会缓冲写入，必须显式 flush 才能立即推给客户端
            if (typeof res.flush === 'function') res.flush();
        } catch {
            runtime.sseClients.delete(res);
        }
    }
}

/**
 * 把酒馆侧的一条群消息转换成 OneBot 11 message 事件，推送给已连接的骰子。
 * 由前端扩展通过 POST /event 调用。
 */
function pushMessageEventToDice({ senderName, senderId, text, isUser }) {
    const groupId = Number(runtime.config.groupId) || 100000;
    const userId = Number(senderId) || (Number(runtime.config.selfId) + nextSeq());
    const msgId = nextMsgId();

    const event = {
        post_type: 'message',
        message_type: 'group',
        sub_type: 'normal',
        message_id: msgId,
        user_id: userId,
        group_id: groupId,
        self_id: Number(runtime.config.selfId) || 10001,
        time: Math.floor(Date.now() / 1000),
        sender: {
            user_id: userId,
            nickname: String(senderName || 'User'),
            card: String(senderName || ''),
        },
        // OneBot 11 同时提供 message(段数组) 与 raw_message(纯文本)
        message: [{ type: 'text', data: { text: String(text || '') } }],
        raw_message: String(text || ''),
    };

    broadcastToDice(event);
    return msgId;
}

/**
 * 将一个事件/action 回执推送给所有已连接的骰子（反向 & 正向 WS）。
 */
function broadcastToDice(data) {
    const json = JSON.stringify(data);

    // 反向 WS：每个连上来的骰子客户端
    for (const client of runtime.reverseClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(json);
        }
    }

    // 正向 WS：单个客户端连接
    if (runtime.forwardClient && runtime.forwardClient.readyState === WebSocket.OPEN) {
        runtime.forwardClient.send(json);
    }

    // HTTP 模式：没有长连接，骰子通过 webhook 上报，无法主动推；
    // 这里不处理，事件由前端在需要时通过 /http-event 回调。
}

// ─────────────────────────────────────────────────────────────────────────────
// 反向 WebSocket 服务端（骰子 bot 主动连接酒馆）
// ─────────────────────────────────────────────────────────────────────────────

function startReverseWsServer() {
    if (runtime.wsServer) return;

    const port = Number(runtime.config.reversePort) || 8081;
    const server = http.createServer();
    const wss = new WebSocketServer({ server, path: runtime.config.reversePath || '/onebot/v11/ws' });

    wss.on('connection', (ws, req) => {
        // access_token 校验：支持 ?access_token=xxx 或 Authorization: Bearer xxx
        const token = runtime.config.reverseToken;
        if (token) {
            const q = new URL(req.url, 'http://localhost').searchParams.get('access_token');
            const auth = req.headers['authorization'];
            const bearer = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
            if (q !== token && bearer !== token) {
                console.warn('[onebot-bridge] WS rejected: bad access_token');
                ws.close(4001, 'unauthorized');
                return;
            }
        }

        console.log('[onebot-bridge] dice bot connected (reverse WS)');
        runtime.reverseClients.add(ws);

        ws.on('message', (raw) => handleDiceMessage(raw, (reply) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply));
        }));

        ws.on('close', () => {
            console.log('[onebot-bridge] dice bot disconnected (reverse WS)');
            runtime.reverseClients.delete(ws);
            sendToSseClients('connection', { connected: runtime.reverseClients.size > 0 || (runtime.forwardClient?.readyState === WebSocket.OPEN) });
        });

        sendToSseClients('connection', { connected: true });
    });

    server.listen(port, () => {
        console.log(`[onebot-bridge] reverse WS server listening on ws://0.0.0.0:${port}${runtime.config.reversePath || '/onebot/v11/ws'}`);
    });

    runtime.wsServer = server;
}

function stopReverseWsServer() {
    if (!runtime.wsServer) return;
    for (const c of runtime.reverseClients) {
        try { c.close(1001, 'server stopping'); } catch { /* noop */ }
    }
    runtime.reverseClients.clear();
    runtime.wsServer.close();
    runtime.wsServer = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 正向 WebSocket 客户端（酒馆连接骰子的 WS 服务端）
// ─────────────────────────────────────────────────────────────────────────────

function startForwardClient() {
    if (!runtime.config.forwardUrl) return;
    if (runtime.forwardClient) return;

    const url = new URL(runtime.config.forwardUrl);
    const headers = {};
    if (runtime.config.forwardToken) {
        headers['Authorization'] = `Bearer ${runtime.config.forwardToken}`;
    }

    const ws = new WebSocket(url.toString(), {
        headers,
        handshakeTimeout: 5000,
    });

    ws.on('open', () => {
        console.log('[onebot-bridge] connected to dice bot (forward WS)');
        sendToSseClients('connection', { connected: true });
    });

    ws.on('message', (raw) => handleDiceMessage(raw, (reply) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply));
    }));

    ws.on('close', () => {
        console.log('[onebot-bridge] forward WS closed');
        runtime.forwardClient = null;
        sendToSseClients('connection', { connected: runtime.reverseClients.size > 0 });
        // 自动重连（减速）
        if (runtime.config.enabled && runtime.config.mode === 'forward') {
            setTimeout(startForwardClient, 5000);
        }
    });

    ws.on('error', (e) => {
        console.error('[onebot-bridge] forward WS error:', e.message);
    });

    runtime.forwardClient = ws;
}

function stopForwardClient() {
    if (runtime.forwardClient) {
        try { runtime.forwardClient.close(); } catch { /* noop */ }
        runtime.forwardClient = null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 处理来自骰子 bot 的消息（API action 或上报）
// ─────────────────────────────────────────────────────────────────────────────

function handleDiceMessage(raw, reply) {
    let data;
    try {
        data = JSON.parse(raw.toString());
    } catch {
        return;
    }

    // OneBot 11 API 调用：骰子发来 { action, params, echo }
    if (data.action) {
        handleApiCall(data, reply);
        return;
    }

    // 上报事件：骰子发来 post_type 等（HTTP webhook 也会走这里）
    if (data.post_type) {
        handleReportedEvent(data);
        return;
    }
}

/**
 * 处理骰子发起的 OneBot API 调用。
 * 我们主要关心 send_group_msg / send_msg —— 骰子发言。
 */
function handleApiCall(data, reply) {
    const { action, params, echo } = data;
    let result = { ok: true };
    let status = 'ok';
    let retcode = 0;

    switch (action) {
        case 'send_group_msg':
        case 'send_msg': {
            const groupId = params?.group_id || runtime.config.groupId;
            // 解析消息内容
            let text = '';
            if (typeof params?.message === 'string') {
                text = params.message;
            } else if (Array.isArray(params?.message)) {
                text = params.message
                    .map(seg => seg?.type === 'text' ? seg.data?.text : '')
                    .join('');
            } else if (params?.message && typeof params.message === 'object') {
                text = params.message.data?.text || '';
            }

            if (text) {
                const msgId = nextMsgId();
                result = { message_id: msgId };
                // 推给前端扩展，由扩展注入到酒馆群聊
                sendToSseClients('dice_message', {
                    text,
                    groupId,
                    msgId,
                });
            } else {
                result = { message_id: 0 };
            }
            break;
        }
        case 'get_login_info':
            result = { user_id: Number(runtime.config.selfId) || 10001, nickname: 'Dice' };
            break;
        case 'get_group_list':
            result = [{ group_id: Number(runtime.config.groupId) || 100000, group_name: 'SillyTavern Group' }];
            break;
        case 'get_group_member_list': {
            result = [];
            break;
        }
        case 'get_friend_list':
            result = [];
            break;
        case 'set_group_name':
        case 'set_group_kick':
        case 'set_group_ban':
        case 'set_group_whole_ban':
            result = {};
            break;
        default:
            // 未知 API，返回 ok 让骰子不报错
            result = {};
            break;
    }

    if (echo !== undefined) {
        reply({
            status,
            retcode,
            data: result,
            echo,
        });
    }
}

/**
 * 处理骰子上报的事件（HTTP webhook / 正向 WS 上报）。
 * 我们只关心 message 事件——骰子自己的发言通常通过 send_msg action 而非上报。
 */
function handleReportedEvent(data) {
    if (data.post_type === 'message' && data.message_type === 'group') {
        // 这是骰子在群里的发言（某些实现用上报而非 api 调用）
        let text = '';
        if (typeof data.message === 'string') text = data.message;
        else if (Array.isArray(data.message)) text = data.message.map(s => s?.type === 'text' ? s.data?.text : '').join('');
        if (text) {
            sendToSseClients('dice_message', {
                text,
                groupId: data.group_id,
                msgId: data.message_id || nextMsgId(),
            });
        }
    }
    // 忽略 notice / request / meta_event
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP 模式：酒馆向骰子的 HTTP API 发请求
// ─────────────────────────────────────────────────────────────────────────────

async function httpCallDice(action, params) {
    if (!runtime.config.httpUrl) return null;
    const url = `${runtime.config.httpUrl.replace(/\/$/, '')}/${action}`;
    const headers = { 'Content-Type': 'application/json' };
    if (runtime.config.httpToken) headers['Authorization'] = `Bearer ${runtime.config.httpToken}`;
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(params || {}),
        });
        return await resp.json().catch(() => null);
    } catch (e) {
        console.error('[onebot-bridge] HTTP call failed:', e.message);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 根据配置启停连接
// ─────────────────────────────────────────────────────────────────────────────

function restartConnections() {
    if (!runtime.config.enabled) {
        stopReverseWsServer();
        stopForwardClient();
        return;
    }
    // 反向 WS
    if (runtime.config.mode === 'reverse') {
        stopForwardClient();
        startReverseWsServer();
    } else {
        stopReverseWsServer();
    }
    // 正向 WS
    if (runtime.config.mode === 'forward') {
        startForwardClient();
    } else {
        stopForwardClient();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Express 路由（挂载到 /api/plugins/onebot-bridge）
// ─────────────────────────────────────────────────────────────────────────────

export function init(router) {
    // 健康检查
    router.get('/status', (_req, res) => {
        res.json({
            enabled: runtime.config.enabled,
            mode: runtime.config.mode,
            connected: runtime.reverseClients.size > 0 || (runtime.forwardClient?.readyState === WebSocket.OPEN),
            config: { ...runtime.config },
        });
    });

    // 前端下发配置
    router.post('/config', (req, res) => {
        applyConfig(req.body);
        restartConnections();
        res.json({ ok: true, config: { ...runtime.config } });
    });

    // 前端通过 SSE 订阅骰子事件（dice_message / connection）
    router.get('/events', (req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        res.write('event: hello\ndata: {}\n\n');
        runtime.sseClients.add(res);
        req.on('close', () => runtime.sseClients.delete(res));
    });

    // 前端把酒馆侧群消息推过来 → 转成 OneBot event 推给骰子
    router.post('/event', (req, res) => {
        const { senderName, senderId, text, isUser } = req.body || {};
        const msgId = pushMessageEventToDice({ senderName, senderId, text, isUser });

        // HTTP 模式下无长连接，但骰子可能用轮询上报，无需额外动作
        // （仅当骰子主动 ws/webhook 上报时才会有回执）

        res.json({ ok: true, msgId });
    });

    // HTTP webhook 入口：骰子通过 HTTP 上报事件到这里（仅当 mode=http 且骰子配置了 http_post）
    router.post('/webhook', (req, res) => {
        handleReportedEvent(req.body || {});
        // 快速 ACK
        res.json({ status: 'ok', retcode: 0 });
    });

    // 前端通过 HTTP API 模式主动让骰子做某事（测试用）
    router.post('/http-call', async (req, res) => {
        const { action, params } = req.body || {};
        const r = await httpCallDice(action, params);
        res.json(r);
    });

    console.log('[onebot-bridge] server plugin initialized (routes under /api/plugins/onebot-bridge)');
}

export function exit() {
    console.log('[onebot-bridge] shutting down');
    stopReverseWsServer();
    stopForwardClient();
    for (const res of runtime.sseClients) {
        try { res.end(); } catch { /* noop */ }
    }
    runtime.sseClients.clear();
}
