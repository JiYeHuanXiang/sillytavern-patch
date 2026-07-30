import { getRequestHeaders } from '../script.js';

// === State ===
let ws = null;
let currentRoom = null;       // { roomId, token, name, hostUserId, isHost }
let myName = 'Anonymous';
let lastSeq = 0;
let typingTimeout = null;
let isTypingSent = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let onlineUsers = [];

// === DOM helper ===
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

// === WebSocket URL ===
function getWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/api/lan-chat/ws`;
}

// === API calls ===
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
        updateConnectionStatus('connected');
    };

    ws.onmessage = (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            return;
        }
        handleMessage(msg);
    };

    ws.onclose = (event) => {
        updateConnectionStatus('disconnected');
        if (currentRoom && event.code !== 4000 && event.code !== 4003 && event.code !== 4004) {
            scheduleReconnect();
        } else if (event.code === 4000) {
            showSystemMessage('房间已被关闭');
            leaveRoom(false);
        }
    };

    ws.onerror = () => {
        // Error handled by onclose
    };
}

function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectAttempts++;
    if (reconnectAttempts > 10) {
        showSystemMessage('重连失败次数过多，请手动重连');
        return;
    }
    const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 15000);
    showSystemMessage(`断线重连中... (${reconnectAttempts})`);
    reconnectTimer = setTimeout(() => {
        if (currentRoom) {
            connectWebSocket(currentRoom.roomId, currentRoom.token, myName);
            // After reconnect, request sync from last known seq
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'room-sync-request', sinceSeq: lastSeq }));
                }
            }, 500);
        }
    }, delay);
}

// === Message handling ===
function handleMessage(msg) {
    switch (msg.type) {
        case 'room-sync':
            handleRoomSync(msg);
            break;
        case 'chat-message':
            appendMessage(msg);
            if (msg.seq > lastSeq) lastSeq = msg.seq;
            break;
        case 'ai-message':
            appendMessage(msg);
            if (msg.seq > lastSeq) lastSeq = msg.seq;
            break;
        case 'user-join':
            onlineUsers = msg.onlineUsers || onlineUsers;
            updateOnlineUsers();
            if (lanSettings.joinNotify) showSystemMessage(`${msg.name} 加入了房间`);
            break;
        case 'user-leave':
            // Refresh online users — we don't have the full list in user-leave,
            // so we remove the user locally
            onlineUsers = onlineUsers.filter(u => u.userId !== msg.userId);
            updateOnlineUsers();
            if (lanSettings.joinNotify) showSystemMessage(`${msg.name} 离开了房间`);
            break;
        case 'typing':
            showTypingIndicator(msg.name, msg.isTyping);
            break;
        case 'room-closed':
            showSystemMessage(msg.message || '房间已关闭');
            leaveRoom(false);
            break;
        case 'ping':
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
            break;
        case 'error':
            console.warn('LAN chat error:', msg);
            break;
    }
}

function handleRoomSync(msg) {
    if (msg.roomName && currentRoom) {
        currentRoom.name = msg.roomName;
        $('#lan_chat_room_name').textContent = msg.roomName;
    }
    onlineUsers = msg.onlineUsers || [];
    updateOnlineUsers();

    // Clear and re-render messages
    const container = $('#lan_chat_messages');
    container.innerHTML = '';

    if (msg.messages && msg.messages.length > 0) {
        msg.messages.forEach(m => {
            appendMessage(m);
            if (m.seq > lastSeq) lastSeq = m.seq;
        });
    } else {
        showSystemMessage('暂无消息，发送第一条消息开始聊天吧');
    }

    // Update AI character info
    if (msg.aiCharacterIds) {
        // Could be used to show which AI characters are available
    }
}

// === UI rendering ===
function appendMessage(msg) {
    const container = $('#lan_chat_messages');
    if (!container) return;

    // Remove typing indicator
    const typing = container.querySelector('.lan-chat-typing-indicator');
    if (typing) typing.remove();

    const div = document.createElement('div');
    div.className = 'lan-chat-message';

    const senderDiv = document.createElement('div');
    senderDiv.className = 'lan-chat-message-sender';
    senderDiv.textContent = msg.senderName;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'lan-chat-message-content';
    contentDiv.textContent = msg.content;

    // Classify message
    if (msg.senderType === 'ai') {
        div.classList.add('ai');
    } else if (msg.senderName === myName) {
        div.classList.add('own');
    } else {
        div.classList.add('other');
    }

    // Don't show sender name for own messages
    if (msg.senderName === myName && msg.senderType !== 'ai') {
        senderDiv.style.display = 'none';
    }

    div.appendChild(senderDiv);
    div.appendChild(contentDiv);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function showSystemMessage(text) {
    const container = $('#lan_chat_messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'lan-chat-message system';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function showTypingIndicator(name, isTyping) {
    const container = $('#lan_chat_messages');
    if (!container) return;

    const existing = container.querySelector('.lan-chat-typing-indicator');
    if (existing) existing.remove();

    if (isTyping && name !== myName) {
        const div = document.createElement('div');
        div.className = 'lan-chat-typing-indicator';
        div.textContent = `${name} 正在输入...`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }
}

function updateOnlineUsers() {
    const container = $('#lan_chat_online_users');
    if (!container) return;
    container.innerHTML = '';
    onlineUsers.forEach(u => {
        const span = document.createElement('span');
        span.className = 'lan-chat-online-user';
        span.textContent = u.name;
        container.appendChild(span);
    });
}

function updateConnectionStatus(status) {
    const indicator = $('#lan_chat_conn_status');
    if (!indicator) return;
    if (status === 'connected') {
        indicator.textContent = '● 已连接';
        indicator.style.color = '#4caf50';
    } else {
        indicator.textContent = '● 未连接';
        indicator.style.color = '#f44336';
    }
}

// === Room management ===
async function createRoom() {
    const name = $('#lan_chat_create_name').value.trim() || 'Untitled Room';
    myName = $('#lan_chat_my_name').value.trim() || 'Anonymous';

    try {
        const data = await apiCall('/api/lan-chat/create', 'POST', { name });
        if (data.error) {
            toastr.error(data.error);
            return;
        }
        currentRoom = {
            roomId: data.roomId,
            token: data.token,
            name: data.name,
            hostUserId: data.hostUserId,
            isHost: true,
        };
        showRoomView();
        connectWebSocket(data.roomId, data.token, myName);
        toastr.success('房间已创建');
    } catch (err) {
        toastr.error('创建房间失败: ' + err.message);
    }
}

async function joinRoom(host, port, roomId, token) {
    myName = $('#lan_chat_my_name').value.trim() || 'Anonymous';

    // For local connection, use the same host
    // For remote (FRP), the frontend would connect to the remote WebSocket
    try {
        const data = await apiCall('/api/lan-chat/join', 'POST', { roomId, token });
        if (data.error) {
            toastr.error(data.error);
            return;
        }
        currentRoom = {
            roomId: data.roomId,
            token,
            name: data.name,
            hostUserId: data.hostUserId,
            isHost: false,
        };
        showRoomView();
        connectWebSocket(data.roomId, token, myName);
        toastr.success(`已加入房间: ${data.name}`);
    } catch (err) {
        toastr.error('加入房间失败: ' + err.message);
    }
}

function leaveRoom(showConfirm = true) {
    if (showConfirm && !confirm('确定要离开房间吗？')) return;

    if (ws) {
        try { ws.close(1000); } catch { /* ignore */ }
        ws = null;
    }
    currentRoom = null;
    lastSeq = 0;
    reconnectAttempts = 0;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    showConnectionView();
}

// === Message sending ===
function sendMessage() {
    const input = $('#lan_chat_text_input');
    const content = input.value.trim();
    if (!content || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
        type: 'chat-message',
        content,
    }));

    input.value = '';
    input.style.height = 'auto';

    // Stop typing indicator
    if (isTypingSent) {
        ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
        isTypingSent = false;
    }
}

// === AI trigger (host only) ===
async function triggerAi() {
    if (!currentRoom || !currentRoom.isHost) {
        toastr.warning('只有房主可以触发 AI 回复');
        return;
    }

    const aiName = $('#lan_chat_ai_name').value.trim() || 'AI';
    const input = $('#lan_chat_text_input');
    const content = input.value.trim();

    if (!content) {
        toastr.warning('请输入要发送给 AI 的内容');
        return;
    }

    // First send as human message
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'chat-message', content }));
        input.value = '';
    }

    // Then trigger AI generation via existing Generate pipeline
    // This is a simplified integration — in production, the host would call
    // the existing Generate() function with appropriate context
    toastr.info('AI 正在生成回复...');

    try {
        // Use the host's existing AI generation setup
        // The actual generation will be done by the frontend's Generate function
        // and then submitted via /api/lan-chat/ai-generate
        const result = await triggerHostAiGeneration(content, aiName);
        if (result) {
            await apiCall('/api/lan-chat/ai-generate', 'POST', {
                roomId: currentRoom.roomId,
                token: currentRoom.token,
                senderName: aiName,
                content: result,
            });
        }
    } catch (err) {
        toastr.error('AI 生成失败: ' + err.message);
    }
}

/**
 * Triggers AI generation on the host using existing SillyTavern infrastructure.
 * This is a placeholder that delegates to the main Generate function.
 * @param {string} userMessage The user's message
 * @param {string} aiName The AI character name
 * @returns {Promise<string|null>}
 */
async function triggerHostAiGeneration(userMessage, aiName) {
    // This function integrates with the existing SillyTavern Generate pipeline.
    // In the full implementation, it would:
    // 1. Set up context from the LAN chat history
    // 2. Call Generate() with appropriate parameters
    // 3. Return the generated text
    //
    // For now, we return null to indicate the feature requires
    // manual integration with the user's configured AI backend.
    // The host can still use the regular chat interface to generate
    // and then paste results, or this can be extended later.

    // Check if Generate function is available (loaded from script.js)
    if (typeof window.Generate === 'function') {
        try {
            // Generate with the user message as context
            const result = await window.Generate('normal', { });
            return result;
        } catch {
            return null;
        }
    }
    return null;
}

// === Instance discovery ===
async function refreshInstances() {
    try {
        const data = await apiCall('/api/lan-discovery/instances', 'GET');
        renderInstances(data.instances || []);
    } catch (err) {
        console.warn('Failed to refresh instances:', err);
    }
}

function renderInstances(instances) {
    const container = $('#lan_chat_instance_list');
    if (!container) return;
    container.innerHTML = '';

    if (instances.length === 0) {
        container.innerHTML = '<div class="lan-chat-empty">未发现局域网实例<br><small>请确认其他实例已启用局域网发现</small></div>';
        return;
    }

    instances.forEach(inst => {
        const div = document.createElement('div');
        div.className = 'lan-chat-instance-item';

        const info = document.createElement('div');
        info.className = 'lan-chat-instance-info';
        const name = document.createElement('div');
        name.className = 'lan-chat-instance-name';
        name.textContent = inst.name;
        const addr = document.createElement('div');
        addr.className = 'lan-chat-instance-addr';
        addr.textContent = `${inst.host}:${inst.port}`;
        info.appendChild(name);
        info.appendChild(addr);

        const badge = document.createElement('span');
        badge.className = `lan-chat-instance-badge ${inst.source}`;
        badge.textContent = inst.source === 'mdns' ? 'LAN' : 'Manual';

        div.appendChild(info);
        div.appendChild(badge);
        container.appendChild(div);
    });
}

async function addManualInstance() {
    const name = $('#lan_chat_manual_name').value.trim() || 'Manual';
    const host = $('#lan_chat_manual_host').value.trim();
    const port = parseInt($('#lan_chat_manual_port').value);

    if (!host || !port) {
        toastr.warning('请填写主机和端口');
        return;
    }

    try {
        await apiCall('/api/lan-discovery/instances/add', 'POST', { name, host, port });
        $('#lan_chat_manual_name').value = '';
        $('#lan_chat_manual_host').value = '';
        $('#lan_chat_manual_port').value = '';
        refreshInstances();
        toastr.success('已添加');
    } catch (err) {
        toastr.error('添加失败: ' + err.message);
    }
}

// === View switching ===
function showRoomView() {
    $('#lan_chat_connection_view').style.display = 'none';
    $('#lan_chat_room_view').style.display = 'flex';
    if (currentRoom) {
        $('#lan_chat_room_name').textContent = currentRoom.name;
    }
    // Focus input
    setTimeout(() => $('#lan_chat_text_input')?.focus(), 100);
}

function showConnectionView() {
    $('#lan_chat_room_view').style.display = 'none';
    $('#lan_chat_connection_view').style.display = 'block';
}

function switchTab(tabName) {
    $$('.lan-chat-tab').forEach(t => t.classList.remove('active'));
    $$('.lan-chat-tab-content').forEach(c => c.classList.remove('active'));
    $(`#lan_chat_tab_${tabName}`).classList.add('active');
    $(`#lan_chat_tab_content_${tabName}`).classList.add('active');
}

// === Panel toggle ===
function togglePanel() {
    const panel = $('#lan_chat_panel');
    const toggle = $('#lan_chat_toggle');
    const isOpen = panel.classList.contains('lan-chat-open');

    if (isOpen) {
        panel.classList.remove('lan-chat-open');
        toggle.classList.remove('lan-chat-hidden');
    } else {
        panel.classList.add('lan-chat-open');
        // Refresh instances when opening
        refreshInstances();
    }
}

function closePanel() {
    $('#lan_chat_panel').classList.remove('lan-chat-open');
}

// === Typing indicator ===
function handleTyping() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (!isTypingSent) {
        isTypingSent = true;
        ws.send(JSON.stringify({ type: 'typing', isTyping: true }));
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        if (isTypingSent && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
            isTypingSent = false;
        }
    }, 2000);
}

// === Settings persistence ===
const SETTINGS_KEY = 'lanChatSettings';

/** @type {{ myName: string, visible: boolean, joinNotify: boolean, persist: boolean }} */
let lanSettings = {
    myName: 'Anonymous',
    visible: true,
    joinNotify: true,
    persist: false,
};

function loadSettings() {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            lanSettings = { ...lanSettings, ...parsed };
        } catch { /* ignore */ }
    }
    applySettingsToUI();
}

function saveSettingsToStorage() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(lanSettings));
}

function applySettingsToUI() {
    myName = lanSettings.myName;
    const nameInput = $('#lan_chat_my_name');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = myName;
    const nickInput = $('#lan_chat_set_nickname');
    if (nickInput && document.activeElement !== nickInput) nickInput.value = myName;

    const visCheck = $('#lan_chat_set_visible');
    if (visCheck) visCheck.checked = lanSettings.visible;
    const jnCheck = $('#lan_chat_set_join_notify');
    if (jnCheck) jnCheck.checked = lanSettings.joinNotify;
    const pCheck = $('#lan_chat_set_persist');
    if (pCheck) pCheck.checked = lanSettings.persist;

    applyPanelVisibility();
}

function applyPanelVisibility() {
    const toggle = $('#lan_chat_toggle');
    if (!toggle) return;
    if (lanSettings.visible) {
        toggle.style.display = '';
        toggle.style.opacity = '';
        toggle.title = '局域网聊天';
    } else {
        toggle.style.display = '';
        toggle.style.opacity = '0.35';
        toggle.title = '局域网聊天（已隐藏，点击设置中开启）';
    }
}

function setupSettingsBindings() {
    // Nickname — sync with panel input
    const nickInput = $('#lan_chat_set_nickname');
    if (nickInput) {
        nickInput.addEventListener('input', () => {
            const val = nickInput.value.trim() || 'Anonymous';
            lanSettings.myName = val;
            myName = val;
            const panelName = $('#lan_chat_my_name');
            if (panelName && document.activeElement !== panelName) panelName.value = val;
            saveSettingsToStorage();
        });
    }

    // Bind checkboxes
    const bindCheckbox = (id, key) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('change', () => {
            lanSettings[key] = el.checked;
            saveSettingsToStorage();
            if (key === 'visible') applyPanelVisibility();
        });
    };
    bindCheckbox('#lan_chat_set_visible', 'visible');
    bindCheckbox('#lan_chat_set_join_notify', 'joinNotify');
    bindCheckbox('#lan_chat_set_persist', 'persist');
}

// === Init ===
export function initLanChat() {
    // Load settings
    loadSettings();

    // Check if LAN chat is enabled on the server
    fetch('/api/lan-discovery/status')
        .then(r => r.json())
        .then(data => {
            if (!data.enabled) {
                // LAN chat disabled — hide the toggle button entirely
                const toggle = $('#lan_chat_toggle');
                if (toggle) toggle.style.display = 'none';
                const panel = $('#lan_chat_panel');
                if (panel) panel.style.display = 'none';
                return;
            }
            // LAN chat enabled — proceed with binding events
            bindEvents();
            refreshInstances();
            console.log('LAN chat module initialized');
        })
        .catch(() => {
            // If status check fails, hide the panel to be safe
            const toggle = $('#lan_chat_toggle');
            if (toggle) toggle.style.display = 'none';
        });
}

function bindEvents() {
    $('#lan_chat_toggle')?.addEventListener('click', togglePanel);
    $('#lan_chat_close_btn')?.addEventListener('click', closePanel);

    // Tab switching
    $$('.lan-chat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });

    // Create room
    $('#lan_chat_create_btn')?.addEventListener('click', createRoom);

    // Join room
    $('#lan_chat_join_btn')?.addEventListener('click', () => {
        const roomId = $('#lan_chat_join_room_id').value.trim();
        const token = $('#lan_chat_join_token').value.trim();
        if (!roomId || !token) {
            toastr.warning('请填写房间 ID 和令牌');
            return;
        }
        joinRoom(null, null, roomId, token);
    });

    // Leave room
    $('#lan_chat_leave_btn')?.addEventListener('click', () => leaveRoom(true));

    // Send message
    $('#lan_chat_send_btn')?.addEventListener('click', sendMessage);
    const textInput = $('#lan_chat_text_input');
    if (textInput) {
        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        textInput.addEventListener('input', () => {
            // Auto-resize
            textInput.style.height = 'auto';
            textInput.style.height = Math.min(textInput.scrollHeight, 100) + 'px';
            handleTyping();
        });
    }

    // AI trigger
    $('#lan_chat_ai_trigger_btn')?.addEventListener('click', triggerAi);

    // Manual instance add
    $('#lan_chat_manual_add_btn')?.addEventListener('click', addManualInstance);

    // Refresh instances
    $('#lan_chat_refresh_instances')?.addEventListener('click', refreshInstances);

    // Settings bindings (nicknames + checkboxes)
    setupSettingsBindings();

    // Auto-refresh instances every 10s when panel is open
    setInterval(() => {
        if ($('#lan_chat_panel')?.classList.contains('lan-chat-open')) {
            refreshInstances();
        }
    }, 10000);
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanChat);
} else {
    initLanChat();
}
