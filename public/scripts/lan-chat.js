import { getRequestHeaders } from '../script.js';
import { groups, selected_group } from './group-chats.js';

// === State ===
let ws = null;
let currentRoom = null;       // { roomId, token, hostUserId, isHost }
let myName = 'Anonymous';
let reconnectAttempts = 0;
let reconnectTimer = null;
let onlineUsers = [];
let lastBroadcastSendDate = null;   // Host: last message send_date already relayed
let relayInterval = null;           // Host: polling interval
let sendInterceptorBound = false;   // Client: capture-phase interceptor installed

// === DOM helper ===
function $(sel) { return document.querySelector(sel); }

// === WebSocket URL ===
function getWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/api/lan-chat/ws`;
}

// === API ===
async function apiCall(url, method, body) {
    const res = await fetch(url, {
        method,
        headers: { ...getRequestHeaders(), 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

// === Connection ===
function connectWebSocket(roomId, token, name) {
    if (ws) {
        try { ws.close(); } catch { /* ignore */ }
    }

    const url = `${getWsUrl()}?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
        reconnectAttempts = 0;
        updateStatus('connected');
    };

    ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        handleMessage(msg);
    };

    ws.onclose = (event) => {
        updateStatus('disconnected');
        if (event.code === 4000) {
            toastr.info('房间已被关闭');
            disconnect();
        } else if (event.code === 4003) {
            toastr.error('令牌无效，连接被拒绝');
            disconnect();
        } else if (event.code === 4004) {
            toastr.error('房间不存在');
            disconnect();
        } else if (currentRoom) {
            scheduleReconnect();
        }
    };

    ws.onerror = () => { /* handled by onclose */ };
}

function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectAttempts++;
    if (reconnectAttempts > 10) {
        toastr.error('重连失败次数过多，请手动重连');
        return;
    }
    const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 15000);
    reconnectTimer = setTimeout(() => {
        if (currentRoom) {
            connectWebSocket(currentRoom.roomId, currentRoom.token, myName);
        }
    }, delay);
}

// === Message handling ===
function handleMessage(msg) {
    switch (msg.type) {
        case 'room-info':
            currentRoom = {
                roomId: msg.roomId,
                token: currentRoom?.token || '',
                hostUserId: msg.hostUserId,
                isHost: msg.isHost,
            };
            updateRoomUI();
            break;

        case 'room-sync':
            handleRoomSync(msg);
            break;

        case 'chat-message':
            appendRemoteMessage(msg.message);
            break;

        case 'ai-message':
            appendRemoteMessage(msg.message);
            break;
        case 'user-join':
            if (!onlineUsers.find(u => u.userId === msg.userId)) {
                onlineUsers.push({
                    userId: msg.userId,
                    name: msg.name,
                    isHost: currentRoom && msg.userId === currentRoom.hostUserId,
                });
            }
            updateOnlineUsers();
            break;

        case 'user-leave':
            onlineUsers = onlineUsers.filter(u => u.userId !== msg.userId);
            updateOnlineUsers();
            break;

        case 'typing':
            // Could show typing indicator in chat
            break;

        case 'room-closed':
            toastr.info(msg.message || '房间已关闭');
            disconnect();
            break;

        case 'error':
            console.warn('LAN chat error:', msg);
            break;
    }
}

function handleRoomSync(msg) {
    onlineUsers = msg.onlineUsers || [];
    updateOnlineUsers();

    // The host already has the messages in its chat array.
    // Clients need to merge remote messages into their local chat.
    if (currentRoom && !currentRoom.isHost && msg.messages) {
        mergeRemoteMessages(msg.messages);
    }
}

/**
 * Merges remote messages into the local chat array.
 * Works for both host and clients.
 * Uses send_date as a rough dedup key.
 * @param {object[]} messages
 */
function mergeRemoteMessages(messages) {
    // Lazy import to avoid circular dependency
    import('../script.js').then(script => {
        const existingDates = new Set(script.chat.map(m => m.send_date));
        let added = false;

        for (const m of messages) {
            if (m && m.mes !== undefined && !existingDates.has(m.send_date)) {
                script.chat.push(m);
                script.addOneMessage(m, { type: 'append' });
                existingDates.add(m.send_date);
                added = true;
            }
        }

        if (added) {
            // Scroll to bottom
            const chatEl = $('#chat');
            if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
        }
    }).catch(err => console.warn('mergeRemoteMessages failed:', err));
}

/**
 * Appends a single remote message to the chat.
 * Host: merges into local chat array (message already persisted by backend).
 * Client: merges into local chat array for display.
 * @param {object} message
 */
function appendRemoteMessage(message) {
    if (!message || message.mes === undefined) return;

    // Host: remember this send_date so the relay loop doesn't echo it back
    if (currentRoom?.isHost && message.send_date) {
        lastBroadcastSendDate = message.send_date;
    }

    import('../script.js').then(script => {
        // Dedup by send_date
        if (script.chat.some(m => m.send_date === message.send_date)) return;
        script.chat.push(message);
        script.addOneMessage(message, { type: 'append' });
        const chatEl = $('#chat');
        if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
    }).catch(err => console.warn('appendRemoteMessage failed:', err));
}

// === UI ===
function updateStatus(status) {
    const el = $('#lan_chat_status');
    if (!el) return;
    if (status === 'connected') {
        el.textContent = '● 已连接';
        el.style.color = '#4caf50';
    } else {
        el.textContent = '● 未连接';
        el.style.color = '#f44336';
    }
}

function updateOnlineUsers() {
    const el = $('#lan_chat_online_users');
    if (!el) return;
    el.innerHTML = '';
    onlineUsers.forEach(u => {
        const span = document.createElement('span');
        span.className = 'rm_tag';
        span.style.cssText = 'padding:2px 8px; border-radius:10px; font-size:11px;';
        if (u.isHost) {
            span.style.background = 'rgba(106,176,243,0.2)';
            span.style.color = '#6ab0f3';
            span.textContent = `👑 ${u.name}`;
        } else {
            span.style.background = 'rgba(255,255,255,0.08)';
            span.textContent = u.name;
        }
        el.appendChild(span);
    });
}

function updateRoomUI() {
    const info = $('#lan_chat_room_info');
    if (info && currentRoom) {
        info.style.display = '';
        const link = $('#lan_chat_share_link');
        if (link) {
            const url = `${location.origin}/#room=${currentRoom.roomId}&token=${currentRoom.token}`;
            link.value = url;
        }
        const dcBtn = $('#lan_chat_disconnect');
        if (dcBtn) dcBtn.style.display = '';
        const createBtn = $('#lan_chat_create_room');
        if (createBtn && currentRoom.isHost) createBtn.style.display = 'none';
    }
}

// === Host relay: broadcast new local messages to clients ===
function startRelay() {
    if (relayInterval) clearInterval(relayInterval);

    import('../script.js').then(script => {
        // Initialize with the last known message so history isn't re-broadcast
        const last = script.chat[script.chat.length - 1];
        lastBroadcastSendDate = last?.send_date || null;
    }).catch(() => { /* ignore */ });

    relayInterval = setInterval(() => {
        if (!currentRoom?.isHost || !ws || ws.readyState !== WebSocket.OPEN) return;

        import('../script.js').then(script => {
            const last = script.chat[script.chat.length - 1];
            if (!last || last.send_date === lastBroadcastSendDate) return;

            lastBroadcastSendDate = last.send_date;
            ws.send(JSON.stringify({
                type: last.is_user ? 'chat-message' : 'ai-message',
                message: last,
            }));
        }).catch(() => { /* ignore */ });
    }, 700);
}

function stopRelay() {
    if (relayInterval) {
        clearInterval(relayInterval);
        relayInterval = null;
    }
    lastBroadcastSendDate = null;
}

// === Client send: intercept the main input box ===
function bindSendInterceptor() {
    if (sendInterceptorBound) return;
    sendInterceptorBound = true;

    const textarea = document.getElementById('send_textarea');
    const sendBtn = document.getElementById('send_but');

    // Capture phase: runs before script.js's bubble-phase handlers
    const interceptSend = (e) => {
        if (!currentRoom || currentRoom.isHost) return;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const content = textarea?.value?.trim();
        if (!content) return;

        e.preventDefault();
        e.stopPropagation();

        ws.send(JSON.stringify({ type: 'chat-message', content }));
        if (textarea) textarea.value = '';
        textarea?.dispatchEvent(new Event('input', { bubbles: true }));
    };

    document.addEventListener('keydown', (e) => {
        if (e.target !== textarea) return;
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            interceptSend(e);
        }
    }, true);

    sendBtn?.addEventListener('click', interceptSend, true);
}

// === Room management ===
async function createRoom() {
    if (!selected_group) {
        toastr.warning('请先打开一个群聊');
        return;
    }

    myName = $('#lan_chat_nickname').value.trim() || 'Host';

    // Get current chat ID from the group
    const group = groups.find(g => g.id === selected_group);
    if (!group) {
        toastr.error('未找到群组');
        return;
    }

    const chatId = group.chat_id;
    if (!chatId) {
        toastr.error('未找到群聊会话');
        return;
    }

    try {
        const data = await apiCall('/api/lan-chat/create', 'POST', {
            groupId: selected_group,
            chatId,
        });

        if (data.error) {
            toastr.error(data.error);
            return;
        }

        currentRoom = {
            roomId: data.roomId,
            token: data.token,
            hostUserId: data.hostUserId,
            isHost: true,
        };

        connectWebSocket(data.roomId, data.token, myName);
        startRelay();
        updateRoomUI();
        toastr.success('局域网房间已创建');
    } catch (err) {
        toastr.error('创建房间失败: ' + err.message);
    }
}

async function joinRoom(roomId, token) {
    myName = $('#lan_chat_nickname').value.trim() || 'Guest';

    try {
        const data = await apiCall('/api/lan-chat/join', 'POST', { roomId, token });
        if (data.error) {
            toastr.error(data.error);
            return;
        }

        currentRoom = {
            roomId,
            token,
            hostUserId: data.hostUserId,
            isHost: false,
        };

        connectWebSocket(roomId, token, myName);
        bindSendInterceptor();
        updateRoomUI();
        toastr.success('已加入房间，可直接在输入框发送消息');
    } catch (err) {
        toastr.error('加入房间失败: ' + err.message);
    }
}

function disconnect() {
    if (ws) {
        try { ws.close(1000); } catch { /* ignore */ }
        ws = null;
    }
    currentRoom = null;
    onlineUsers = [];
    reconnectAttempts = 0;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    stopRelay();
    updateStatus('disconnected');
    updateOnlineUsers();
    const info = $('#lan_chat_room_info');
    if (info) info.style.display = 'none';
    const dcBtn = $('#lan_chat_disconnect');
    if (dcBtn) dcBtn.style.display = 'none';
    const createBtn = $('#lan_chat_create_room');
    if (createBtn) createBtn.style.display = '';
}

// === Settings ===
function loadNickname() {
    const saved = localStorage.getItem('lanChatNickname');
    if (saved) {
        myName = saved;
        const input = $('#lan_chat_nickname');
        if (input) input.value = saved;
    }
}

function saveNickname() {
    localStorage.setItem('lanChatNickname', myName);
}

// === Init ===
export function initLanChat() {
    loadNickname();

    // Check if LAN is enabled
    fetch('/api/lan-discovery/status')
        .then(r => r.json())
        .then(data => {
            if (!data.enabled) return;
            bindEvents();
        })
        .catch(() => { /* LAN disabled */ });
}

function bindEvents() {
    $('#lan_chat_create_room')?.addEventListener('click', createRoom);

    $('#lan_chat_join_btn')?.addEventListener('click', () => {
        const roomId = $('#lan_chat_join_room_id').value.trim();
        const token = $('#lan_chat_join_token').value.trim();
        if (!roomId || !token) {
            toastr.warning('请填写房间 ID 和令牌');
            return;
        }
        joinRoom(roomId, token);
    });

    $('#lan_chat_disconnect')?.addEventListener('click', disconnect);

    $('#lan_chat_copy_link')?.addEventListener('click', () => {
        const link = $('#lan_chat_share_link');
        if (link && link.value) {
            navigator.clipboard.writeText(link.value).then(() => {
                toastr.success('链接已复制');
            });
        }
    });

    $('#lan_chat_nickname')?.addEventListener('input', () => {
        myName = $('#lan_chat_nickname').value.trim() || 'Anonymous';
        saveNickname();
    });

    // Auto-join from URL hash: #room=xxx&token=yyy
    const hash = location.hash;
    if (hash.startsWith('#room=')) {
        const params = new URLSearchParams(hash.slice(1));
        const roomId = params.get('room');
        const token = params.get('token');
        if (roomId && token) {
            // Wait a bit for the UI to be ready
            setTimeout(() => joinRoom(roomId, token), 1000);
        }
    }
}

// Auto-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanChat);
} else {
    initLanChat();
}
