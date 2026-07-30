/**
 * OneBot 群聊桥接 扩展
 *
 * 让兼容 OneBot 11 协议的骰子机器人（海豹/Lagrange/go-cqhttp 等）作为群聊成员
 * 加入 SillyTavern 群聊，与 AI NPC 同群互动、掷骰、跑团。
 * 全程在酒馆内部模拟 OneBot 环境，不接触真实 QQ，安全不封号。
 *
 * 依赖服务端插件 plugins/onebot-bridge/index.mjs
 */
import { getContext, extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { eventSource, event_types, getRequestHeaders, saveSettingsDebounced } from '../../../../script.js';

const PLUGIN_NAME = 'onebot-bridge';
const API_BASE = '/api/plugins/onebot-bridge';

// ─────────────────────────────────────────────────────────────────────────────
// 默认设置
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
    enabled: false,
    mode: 'reverse',           // 'reverse' | 'forward' | 'http'
    reversePort: 8081,
    reversePath: '/onebot/v11/ws',
    reverseToken: '',
    forwardUrl: '',
    forwardToken: '',
    httpUrl: '',
    httpToken: '',
    selfId: 10001,
    groupId: 100000,
    // 骰子机器人作为哪个角色发言（用角色名或头像 URL 绑定）
    diceCharacterName: '骰子',
    diceAvatarUrl: '',
    // 是否在骰子发言后自动触发 AI 生成
    autoTrigger: false,
    // 触发 AI 的指令前缀（匹配则无视 autoTrigger 强制触发）
    triggerPrefixes: '/ask,.ask,.gen',
    // 防递归标记
};

function getSettings() {
    if (!extension_settings[PLUGIN_NAME]) {
        extension_settings[PLUGIN_NAME] = {};
    }
    const s = extension_settings[PLUGIN_NAME];
    // 合并默认值（补齐新增字段，不覆盖已有值）
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (s[k] === undefined) s[k] = DEFAULT_SETTINGS[k];
    }
    return s;
}

// UIN 映射：角色名 -> 稳定的伪 QQ 号
const uinMap = new Map();
// 防递归标记（模块级，不持久化，避免崩溃后卡死）
let isBridging = false;

function getUinForName(name) {
    if (!uinMap.has(name)) {
        // 基于字符串 hash 生成稳定的伪 UIN
        let h = 100000;
        for (let i = 0; i < name.length; i++) {
            h = (h * 31 + name.charCodeAt(i)) % 900000 + 100000;
        }
        uinMap.set(name, h);
    }
    return uinMap.get(name);
}

// ─────────────────────────────────────────────────────────────────────────────
// 与服务端通信
// ─────────────────────────────────────────────────────────────────────────────

async function postToServer(path, body) {
    try {
        const resp = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body || {}),
        });
        return await resp.json().catch(() => null);
    } catch (e) {
        console.error('[onebot-bridge] POST failed:', path, e.message);
        return null;
    }
}

let sseSource = null;

function startSse() {
    stopSse();
    try {
        sseSource = new EventSource(`${API_BASE}/events`);
        sseSource.addEventListener('dice_message', (ev) => {
            const data = JSON.parse(ev.data);
            onDiceMessage(data.payload || data);
        });
        sseSource.addEventListener('connection', (ev) => {
            const data = JSON.parse(ev.data);
            updateConnectionIndicator(!!(data.payload || data).connected);
        });
        sseSource.onerror = () => {
            // EventSource 会自动重连
        };
    } catch (e) {
        console.error('[onebot-bridge] SSE failed:', e.message);
    }
}

function stopSse() {
    if (sseSource) {
        sseSource.close();
        sseSource = null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 酒馆 → 骰子：群消息桥接
// ─────────────────────────────────────────────────────────────────────────────

async function onMessageReceived(messageId, type) {
    const ctx = getContext();
    const s = getSettings();

    // 只桥接群聊消息
    if (!ctx.groupId) return;
    // 防递归：本扩展注入的骰子消息不再回推
    if (isBridging) return;

    const msg = ctx.chat?.[messageId];
    if (!msg) return;
    // 跳过系统消息
    if (msg.is_system) return;
    // 跳过骰子自己发的（避免回环）
    if (msg.name === s.diceCharacterName) return;

    const senderName = msg.is_user ? ctx.name1 : (msg.name || 'NPC');
    const senderId = getUinForName(senderName);
    const text = msg.mes || '';

    if (!text.trim()) return;

    await postToServer('/event', { senderName, senderId, text, isUser: !!msg.is_user });
}

// ─────────────────────────────────────────────────────────────────────────────
// 骰子 → 酒馆：注入群聊
// ─────────────────────────────────────────────────────────────────────────────

async function onDiceMessage({ text }) {
    const ctx = getContext();
    const s = getSettings();

    // 必须在群聊里才注入
    if (!ctx.groupId) {
        console.debug('[onebot-bridge] dice message ignored (not in group chat)');
        return;
    }

    const message = {
        name: s.diceCharacterName,
        is_user: false,
        is_system: false,
        send_date: getMessageTimeStamp(),
        mes: String(text || ''),
        extra: {
            type: 'onebot_dice',
            api: 'onebot-bridge',
            model: 'dice-bot',
            gen_id: Date.now(),
        },
    };

    // 绑定头像：若配置了 URL 则锁定
    if (s.diceAvatarUrl) {
        message.force_avatar = s.diceAvatarUrl;
    } else {
        // 尝试用角色表里同名的角色头像
        const char = ctx.characters?.find(c => c.name === s.diceCharacterName);
        if (char?.avatar) {
            message.force_avatar = `/thumbnail?type=avatar&file=${encodeURIComponent(char.avatar)}`;
        }
    }

    // 防递归标记
    isBridging = true;
    try {
        ctx.chat.push(message);
        ctx.addOneMessage(message);
        await ctx.saveChat();
    } finally {
        isBridging = false;
    }

    // AI 触发判断
    const trimmed = text.trim();
    const prefixes = (s.triggerPrefixes || '').split(',').map(p => p.trim()).filter(Boolean);
    const matchedPrefix = prefixes.some(p => trimmed.startsWith(p));

    if (matchedPrefix || s.autoTrigger) {
        // 走群聊生成：让 AI NPC 对骰子结果即时反应
        try {
            // Generate(type, options, dryRun)：type='normal' 触发新一轮生成
            ctx.generate('normal', { automatic_trigger: false });
        } catch (e) {
            console.error('[onebot-bridge] auto trigger failed:', e.message);
        }
    }
}

// getMessageTimeStamp 在 script.js 里有但不在 getContext；用本地兜底实现
function getMessageTimeStamp() {
    const d = new Date();
    return d.toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────

function buildSettingsHtml() {
    return `
    <div class="onebot_bridge_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>OneBot 群聊桥接</b>
                <div class="onebot_bridge_status">
                    <span id="onebot_bridge_dot" class="onebot_bridge_dot offline">●</span>
                    <span id="onebot_bridge_status_text">未连接</span>
                </div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label">
                    <input type="checkbox" id="onebot_enabled">
                    <span>启用桥接</span>
                </label>

                <label class="title">连接方式</label>
                <select id="onebot_mode" class="text_pole">
                    <option value="reverse">反向 WebSocket（骰子连酒馆，推荐）</option>
                    <option value="forward">正向 WebSocket（酒馆连骰子）</option>
                    <option value="http">HTTP API（酒馆调骰子）</option>
                </select>

                <div class="onebot_reverse_block">
                    <label class="title">反向 WS 监听端口</label>
                    <input id="onebot_reverse_port" type="number" class="text_pole" min="1024" max="65535">
                    <label class="title">WS 路径</label>
                    <input id="onebot_reverse_path" type="text" class="text_pole">
                    <label class="title">Access Token（可选）</label>
                    <input id="onebot_reverse_token" type="text" class="text_pole" placeholder="留空=不校验">
                    <div class="onebot_help">骰子配置反向 WS 地址：<code id="onebot_reverse_addr"></code></div>
                </div>

                <div class="onebot_forward_block" style="display:none">
                    <label class="title">骰子 WS 地址</label>
                    <input id="onebot_forward_url" type="text" class="text_pole" placeholder="ws://127.0.0.1:6700">
                    <label class="title">Access Token（可选）</label>
                    <input id="onebot_forward_token" type="text" class="text_pole">
                </div>

                <div class="onebot_http_block" style="display:none">
                    <label class="title">骰子 HTTP API 地址</label>
                    <input id="onebot_http_url" type="text" class="text_pole" placeholder="http://127.0.0.1:5700">
                    <label class="title">Access Token（可选）</label>
                    <input id="onebot_http_token" type="text" class="text_pole">
                    <div class="onebot_help">骰子上报 webhook 地址：<code id="onebot_http_webhook"></code></div>
                </div>

                <hr>
                <label class="title">骰子角色名（群聊中显示）</label>
                <input id="onebot_dice_name" type="text" class="text_pole">

                <label class="checkbox_label">
                    <input type="checkbox" id="onebot_auto_trigger">
                    <span>骰子发言后自动触发 AI 生成</span>
                </label>

                <label class="title">强制触发前缀（逗号分隔，匹配则无视上方开关触发 AI）</label>
                <input id="onebot_trigger_prefixes" type="text" class="text_pole">

                <div class="onebot_help">
                    使用方法：① 建一个群聊，把 AI NPC 角色加入②确认服务端插件已加载（config.yaml 中 <code>enableServerPlugins: true</code>）③填好连接参数并勾选"启用桥接" ④在骰子软件里把接入地址指向上面显示的地址 ⑤群里发消息即可联动
                </div>
            </div>
        </div>
    </div>`;
}

function updateConnectionIndicator(connected) {
    const dot = document.getElementById('onebot_bridge_dot');
    const txt = document.getElementById('onebot_bridge_status_text');
    if (!dot || !txt) return;
    if (connected) {
        dot.classList.remove('offline'); dot.classList.add('online');
        dot.textContent = '●';
        txt.textContent = '已连接';
    } else {
        dot.classList.remove('online'); dot.classList.add('offline');
        dot.textContent = '●';
        txt.textContent = '未连接';
    }
}

function showModeBlock(mode) {
    document.querySelector('.onebot_reverse_block').style.display = mode === 'reverse' ? '' : 'none';
    document.querySelector('.onebot_forward_block').style.display = mode === 'forward' ? '' : 'none';
    document.querySelector('.onebot_http_block').style.display = mode === 'http' ? '' : 'none';
    updateAddrHints();
}

function updateAddrHints() {
    const s = getSettings();
    const rev = document.getElementById('onebot_reverse_addr');
    if (rev) rev.textContent = `ws://<酒馆IP>:${s.reversePort}${s.reversePath}`;
    const hk = document.getElementById('onebot_http_webhook');
    if (hk) hk.textContent = `<酒馆IP>:${location.port}/api/plugins/onebot-bridge/webhook`;
}

async function pushConfigToServer() {
    const s = getSettings();
    await postToServer('/config', {
        enabled: s.enabled,
        mode: s.mode,
        reversePort: Number(s.reversePort),
        reversePath: s.reversePath,
        reverseToken: s.reverseToken,
        forwardUrl: s.forwardUrl,
        forwardToken: s.forwardToken,
        httpUrl: s.httpUrl,
        httpToken: s.httpToken,
        selfId: Number(s.selfId),
        groupId: Number(s.groupId),
    });
}

function bindUi() {
    const s = getSettings();

    const el = (id) => document.getElementById(id);
    el('onebot_enabled').checked = s.enabled;
    el('onebot_mode').value = s.mode;
    el('onebot_reverse_port').value = s.reversePort;
    el('onebot_reverse_path').value = s.reversePath;
    el('onebot_reverse_token').value = s.reverseToken;
    el('onebot_forward_url').value = s.forwardUrl;
    el('onebot_forward_token').value = s.forwardToken;
    el('onebot_http_url').value = s.httpUrl;
    el('onebot_http_token').value = s.httpToken;
    el('onebot_dice_name').value = s.diceCharacterName;
    el('onebot_auto_trigger').checked = s.autoTrigger;
    el('onebot_trigger_prefixes').value = s.triggerPrefixes;

    showModeBlock(s.mode);

    // 事件绑定
    el('onebot_enabled').addEventListener('change', async (e) => {
        s.enabled = e.target.checked;
        saveSettingsDebounced();
        await pushConfigToServer();
        if (s.enabled) startSse(); else stopSse();
    });
    el('onebot_mode').addEventListener('change', (e) => {
        s.mode = e.target.value;
        saveSettingsDebounced();
        showModeBlock(s.mode);
        pushConfigToServer();
    });
    const bindInput = (id, key, isNum) => {
        el(id).addEventListener('change', async (e) => {
            s[key] = isNum ? Number(e.target.value) : e.target.value;
            saveSettingsDebounced();
            await pushConfigToServer();
        });
    };
    bindInput('onebot_reverse_port', 'reversePort', true);
    bindInput('onebot_reverse_path', 'reversePath', false);
    bindInput('onebot_reverse_token', 'reverseToken', false);
    bindInput('onebot_forward_url', 'forwardUrl', false);
    bindInput('onebot_forward_token', 'forwardToken', false);
    bindInput('onebot_http_url', 'httpUrl', false);
    bindInput('onebot_http_token', 'httpToken', false);

    el('onebot_dice_name').addEventListener('change', (e) => {
        s.diceCharacterName = e.target.value;
        saveSettingsDebounced();
    });
    el('onebot_auto_trigger').addEventListener('change', (e) => {
        s.autoTrigger = e.target.checked;
        saveSettingsDebounced();
    });
    el('onebot_trigger_prefixes').addEventListener('change', (e) => {
        s.triggerPrefixes = e.target.value;
        saveSettingsDebounced();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 初始化
// ─────────────────────────────────────────────────────────────────────────────

export function init() {
    const s = getSettings();

    const html = buildSettingsHtml();
    $('#extensions_settings').append(html);

    bindUi();

    // 监听群聊消息事件
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.MESSAGE_SENT, onMessageSent);

    // 若已启用，启动 SSE 并推送配置
    if (s.enabled) {
        startSse();
        pushConfigToServer();
    }

    console.log('[onebot-bridge] extension initialized');
}

async function onMessageSent(messageId) {
    const ctx = getContext();
    const s = getSettings();
    if (!ctx.groupId) return;
    if (isBridging) return;
    const msg = ctx.chat?.[messageId];
    if (!msg) return;
    const senderName = ctx.name1;
    const senderId = getUinForName(senderName);
    const text = msg.mes || '';
    if (!text.trim()) return;
    await postToServer('/event', { senderName, senderId, text, isUser: true });
}
