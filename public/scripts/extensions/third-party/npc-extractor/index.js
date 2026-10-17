// NPC Character Extractor — 从聊天记录中提取 NPC 并生成新角色卡
//
// 依赖的现有端点：
//   /api/chats/search | /api/chats/get | /api/chats/group/get   读取历史聊天
//   /api/characters/get | /api/characters/export                读取来源卡与其 PNG 底图
//   /api/characters/create | /api/characters/merge-attributes   落地新卡（底头像 + 世界书内置）
//
// 世界观沿用规则：新卡 data.character_book 与 data.extensions 均为来源卡对应字段的深拷贝。
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { escapeRegex } from '../../../utils.js';
import { t } from '../../../i18n.js';
import { POPUP_TYPE, Popup } from '../../../popup.js';
import {
    generateRaw,
    getCharacters,
    getRequestHeaders,
    saveSettingsDebounced,
    selectCharacterById,
} from '../../../../script.js';

const MODULE_NAME = 'npc-extractor';
const TEMPLATE_PREFIX = 'third-party/npc-extractor';
const LOG_PREFIX = '[NPC Extractor]';

const DEFAULT_SETTINGS = {
    chunkChars: 24000,
    responseLength: 1200,
    maxMaterialChars: 120000,
};

// 世界观来源卡的整本内置世界书拷贝进新卡；这些字段按勾选与否沿用
const CARRY_IDS = ['system_prompt', 'post_history_instructions', 'tags', 'creator'];

// 单聊台词前缀识别时忽略的常见误报词
const NAME_STOP_WORDS = new Set([
    '旁白', '独白', '系统', '内心', '低语', '低声', '轻声', '继续', '总结', '备注', 'ooc', 'OOC',
    'i', 'me', 'narrator', 'system', 'ooc', 'thinking', 'note',
]);

const wizard = {
    busy: false,
    loaded: false,           // 来源+聊天已加载
    sourceType: 'character',
    sourceAvatar: '',        // 角色来源（单聊）
    sourceGroupId: '',       // 群组来源
    sourceName: '',
    sourceCard: null,        // 聊天所属角色卡（单聊，用于沿用项默认值）
    chats: [],
    chatKey: '',
    messages: [],
    npcName: '',
    candidates: [],
    npcAvatar: '',           // 群聊中与 NPC 同名角色的头像（可能为空）
    lorebookAvatar: '',      // 世界书来源卡头像
    lorebookCard: null,
    cardCache: new Map(),    // avatarUrl -> full card
};

const settings = () => {
    if (!extension_settings[MODULE_NAME] || typeof extension_settings[MODULE_NAME] !== 'object') {
        extension_settings[MODULE_NAME] = {};
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (extension_settings[MODULE_NAME][key] === undefined) {
            extension_settings[MODULE_NAME][key] = value;
        }
    }
    return extension_settings[MODULE_NAME];
};

// ─────────────────────────────────────────────────────────────────────────────
// 入口
// ─────────────────────────────────────────────────────────────────────────────

export async function init() {
    settings();

    // 动态插入的按钮不走模板管线，文案需在 JS 里直接本地化
    $('#extensionsMenu').append(`
        <div id="npc_extractor_wand_container" class="extension_container">
            <div id="ne_wand_button" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
                <div class="fa-solid fa-user-secret extensionsMenuExtensionButton"></div>
                <span>${t`Extract NPC`}</span>
            </div>
        </div>`);

    $('#extensions_settings2').append(await renderExtensionTemplateAsync(TEMPLATE_PREFIX, 'settings'));

    bindWandEvents();
    bindWizardEvents();
    bindSettingsEvents();
}

function bindWandEvents() {
    $(document).on('click.neExt', '#ne_wand_button', async () => {
        if (wizard.busy) {
            toastr.warning(t`Already working. Please wait.`);
            return;
        }
        await openWizard();
    });
}

function bindSettingsEvents() {
    const chunkInput = $('#ne_opt_chunk_chars');
    const lengthInput = $('#ne_opt_response_length');
    if (!chunkInput.length || !lengthInput.length) {
        return;
    }
    const s = settings();
    chunkInput.val(String(s.chunkChars));
    lengthInput.val(String(s.responseLength));
    chunkInput.on('input', () => {
        const value = Number(chunkInput.val());
        if (Number.isFinite(value) && value >= 4000) {
            s.chunkChars = value;
            saveSettingsDebounced();
        }
    });
    lengthInput.on('input', () => {
        const value = Number(lengthInput.val());
        if (Number.isFinite(value) && value >= 256) {
            s.responseLength = value;
            saveSettingsDebounced();
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 向导：打开与填充
// ─────────────────────────────────────────────────────────────────────────────

async function openWizard() {
    resetWizard();
    const html = await renderExtensionTemplateAsync(TEMPLATE_PREFIX, 'index');
    const popup = new Popup(html, POPUP_TYPE.DISPLAY, '', {
        wide: true,
        allowVerticalScrolling: true,
    });
    // show() 第一行会同步插入 DOM，无需等待关闭即可填充内容
    popup.show();
    $('#ne_npc_input').attr('placeholder', t`Type the NPC name, or click a candidate below`);
    populateSourceSelect();
    await reloadChats(true);
}

function resetWizard() {
    const context = getContext();
    wizard.loaded = false;
    wizard.sourceType = 'character';
    wizard.sourceAvatar = '';
    wizard.sourceGroupId = '';
    wizard.sourceName = '';
    wizard.sourceCard = null;
    wizard.chats = [];
    wizard.chatKey = '';
    wizard.messages = [];
    wizard.npcName = '';
    wizard.candidates = [];
    wizard.npcAvatar = '';
    wizard.lorebookAvatar = '';
    wizard.lorebookCard = null;
    wizard.cardCache.clear();

    // 预选当前角色 / 当前群组及其当前聊天
    if (context.groupId) {
        const group = (context.groups ?? []).find(x => x?.id === context.groupId);
        if (group) {
            wizard.sourceType = 'group';
            wizard.sourceGroupId = group.id;
            wizard.sourceName = group.name ?? '';
        }
    } else if (context.characterId !== undefined && Number.isInteger(context.characterId)) {
        const char = context.characters?.[context.characterId];
        if (char?.avatar) {
            wizard.sourceType = 'character';
            wizard.sourceAvatar = char.avatar;
            wizard.sourceName = char.name ?? '';
        }
    }

    $('#ne_npc_input').val('');
    $('#ne_npc_candidates').empty();
    $('#ne_chat_info').empty();
    $('#ne_book_info').empty();
    $('#ne_save_info').empty();
    $('#ne_progress_text').empty();
    $('#ne_progress_fill').css('width', '0');
    showElement('#ne_step_source', true);
    showElement('#ne_step_npc', true);
    showElement('#ne_step_progress', false);
    showElement('#ne_step_review', false);
}

function showElement(selector, show) {
    $(selector).css('display', show ? '' : 'none');
}

function populateSourceSelect() {
    const select = $('#ne_source_select').empty();
    const currentKey = sourceKey(wizard);
    for (const option of buildSourceOptions()) {
        const el = $('<option></option>').val(option.value).text(option.label).data('type', option.type);
        if (option.key === currentKey) {
            el.prop('selected', true);
        }
        select.append(el);
    }
}

function buildSourceOptions() {
    const context = getContext();
    const options = [];
    for (const char of context.characters ?? []) {
        if (!char?.avatar) {
            continue;
        }
        options.push({
            type: 'character',
            value: `character:${char.avatar}`,
            key: `character:${char.avatar}`,
            label: char.name ?? char.avatar,
            avatar: char.avatar,
        });
    }
    for (const group of context.groups ?? []) {
        if (!group?.id) {
            continue;
        }
        options.push({
            type: 'group',
            value: `group:${group.id}`,
            key: `group:${group.id}`,
            label: `${group.name ?? group.id} (${t`group chat`})`,
            groupId: group.id,
        });
    }
    return options;
}

function sourceKey(w) {
    return w.sourceType === 'group' ? `group:${w.sourceGroupId}` : `character:${w.sourceAvatar}`;
}

async function reloadChats(selectCurrent) {
    const context = getContext();
    let results = [];
    if (wizard.sourceType === 'group') {
        if (wizard.sourceGroupId) {
            results = await searchChats({ group_id: wizard.sourceGroupId });
        }
    } else if (wizard.sourceAvatar) {
        results = await searchChats({ avatar_url: wizard.sourceAvatar });
    } else {
        return;
    }
    wizard.chats = Array.isArray(results) ? results : [];

    const select = $('#ne_chat_select').empty();
    for (const chat of wizard.chats) {
        const label = `${chat.file_name} (${chat.message_count ?? '?'} ${t`messages`})`;
        select.append($('<option></option>').val(chat.file_name).text(label));
    }

    let chatKey = wizard.chats[0]?.file_name ?? '';
    if (selectCurrent) {
        if (wizard.sourceType === 'group') {
            const group = (context.groups ?? []).find(x => x?.id === wizard.sourceGroupId);
            if (group?.chat_id && wizard.chats.some(x => x.file_name === group.chat_id)) {
                chatKey = group.chat_id;
            }
        } else if (context.chatId && wizard.chats.some(x => x.file_name === context.chatId)) {
            chatKey = context.chatId;
        }
    }
    wizard.chatKey = chatKey;
    if (chatKey) {
        select.val(chatKey);
        await loadSelectedChat();
    } else {
        wizard.loaded = false;
        $('#ne_chat_info').text(t`No chat files found for this source.`);
    }
}

async function searchChats(body) {
    try {
        const response = await fetch('/api/chats/search', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ ...body, query: '' }),
        });
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error(LOG_PREFIX, 'Failed to list chats', error);
    }
    return [];
}

async function loadSelectedChat() {
    if (!wizard.chatKey) {
        return;
    }
    $('#ne_chat_info').text(t`Loading chat…`);
    const data = wizard.sourceType === 'group'
        ? await fetchChat('/api/chats/group/get', { id: wizard.chatKey })
        : await fetchChat('/api/chats/get', { avatar_url: wizard.sourceAvatar, file_name: wizard.chatKey });

    // 与 group-chats.js 一致：仅当首行是 metadata 才算文件头
    const messages = Array.isArray(data) ? data.filter(Boolean) : [];
    if (messages.length && Object.hasOwn(messages[0], 'chat_metadata')) {
        messages.shift();
    }
    wizard.messages = messages;
    wizard.loaded = messages.length > 0;

    if (wizard.sourceType === 'group') {
        wizard.sourceName = wizard.sourceName || wizard.chatKey;
    } else {
        wizard.sourceCard = await fetchCard(wizard.sourceAvatar);
        wizard.sourceName = wizard.sourceCard?.name ?? wizard.sourceAvatar;
    }
    wizard.npcAvatar = findAvatarByName(wizard.npcName || '');

    const total = wizard.messages.length;
    const lastMes = wizard.messages[lastAIIndex()]?.mes ?? '';
    const preview = lastMes.replace(/\s+/g, ' ');
    $('#ne_chat_info')
        .text(`${preview.length > 80 ? `${preview.slice(0, 80)}…` : preview} (${total} ${t`messages`})`);

    renderCandidateChips();
}

async function fetchChat(url, body) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });
        if (response.ok) {
            return await response.json();
        }
        console.error(LOG_PREFIX, url, response.status, response.statusText);
    } catch (error) {
        console.error(LOG_PREFIX, url, error);
    }
    return [];
}

function lastAIIndex() {
    for (let i = wizard.messages.length - 1; i >= 0; i--) {
        const m = wizard.messages[i];
        if (m && !m.is_system && m.mes) {
            return i;
        }
    }
    return -1;
}

async function fetchCard(avatarUrl) {
    if (!avatarUrl) {
        return null;
    }
    if (wizard.cardCache.has(avatarUrl)) {
        return wizard.cardCache.get(avatarUrl);
    }
    const card = await fetchChat('/api/characters/get', { avatar_url: avatarUrl });
    // 失败兜底返回的是空数组；一张合法卡至少要有 name/data
    const valid = card && !Array.isArray(card) && (card.name || card.data);
    wizard.cardCache.set(avatarUrl, valid ? card : null);
    return valid ? card : null;
}

function findAvatarByName(name) {
    const target = String(name ?? '').trim().toLowerCase();
    if (!target) {
        return '';
    }
    const char = (getContext().characters ?? []).find(x => {
        const n = String(x?.name ?? '').trim().toLowerCase();
        return n === target || String(x?.avatar ?? '').replace(/\.png$/, '').trim().toLowerCase() === target;
    });
    return char?.avatar ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// NPC 候选识别与素材收集
// ─────────────────────────────────────────────────────────────────────────────

function renderCandidateChips() {
    const container = $('#ne_npc_candidates').empty();
    if (!wizard.loaded || wizard.messages.length === 0) {
        return;
    }

    if (wizard.sourceType === 'group') {
        const counts = new Map();
        const exclude = new Set([getContext().name1, '']);
        for (const m of wizard.messages) {
            if (!m || m.is_system || m.is_user || !m.name) {
                continue;
            }
            if (exclude.has(m.name)) {
                continue;
            }
            counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
        }
        wizard.candidates = [...counts.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    } else {
        const exclude = new Set([
            getContext().name1,
            wizard.sourceName,
            ...NAME_STOP_WORDS,
        ].filter(Boolean).map(x => String(x).toLowerCase()));
        const counts = new Map();
        const lineRe = /^([^\s:："'「」『』*#\-—\d][^\s:：]{0,20}?)\s*[:：]/;
        for (const m of wizard.messages) {
            if (!m || m.is_user || m.is_system || !m.mes) {
                continue;
            }
            const normalized = String(m.mes).replace(/\*\*/g, '');
            for (const line of normalized.split('\n')) {
                const match = line.match(lineRe);
                if (!match) {
                    continue;
                }
                const name = match[1].trim();
                if (!name || exclude.has(name.toLowerCase())) {
                    continue;
                }
                counts.set(name, (counts.get(name) ?? 0) + 1);
            }
        }
        wizard.candidates = [...counts.entries()]
            .map(([name, count]) => ({ name, count }))
            .filter(x => x.count >= 2)
            .sort((a, b) => b.count - a.count)
            .slice(0, 12);
    }

    if (wizard.candidates.length === 0) {
        return;
    }
    for (const candidate of wizard.candidates) {
        const chip = $('<div class="ne_chip interactable" tabindex="0"></div>')
            .text(`${candidate.name} ×${candidate.count}`)
            .attr('title', `${candidate.name} ×${candidate.count}`);
        container.append(chip);
    }
}

function collectMaterial(npcName) {
    const entries = [];

    // 定位相关消息：群聊按 name，单聊按台词前缀/提及
    const relevant = [];
    const isGroup = wizard.sourceType === 'group';
    const speakerRe = isGroup
        ? null
        : new RegExp(`(^|\\n)[ \\t]*(\\*\\*)?${escapeRegex(npcName)}(\\*\\*)?[ \\t]*[:：]`);
    const mentionRe = isGroup ? null : new RegExp(escapeRegex(npcName), 'g');
    wizard.messages.forEach((m, index) => {
        if (!m || m.is_system || !m.mes) {
            return;
        }
        let matched = false;
        if (isGroup) {
            matched = !m.is_user && m.name === npcName;
        } else {
            const normalized = String(m.mes).replace(/\*\*/g, '');
            const isSpeaker = !m.is_user && speakerRe.test(normalized);
            // 台词前缀命中必收；正文提及达到 2 次也收（用于关系/评价类内容）
            const mentionCount = normalized.split(mentionRe).length - 1;
            matched = isSpeaker || mentionCount >= 2;
        }
        if (matched) {
            relevant.push(index);
        }
    });

    if (relevant.length === 0) {
        return entries;
    }

    // 加入相邻一条做多上下文
    const indices = new Set();
    for (const index of relevant) {
        indices.add(index);
        const prev = wizard.messages[index - 1];
        const next = wizard.messages[index + 1];
        if (prev && !prev.is_system && prev.mes) {
            indices.add(index - 1);
        }
        if (next && !next.is_system && next.mes) {
            indices.add(index + 1);
        }
    }

    const context = getContext();
    const sorted = [...indices].sort((a, b) => a - b);
    for (const index of sorted) {
        const m = wizard.messages[index];
        const speaker = m.is_user ? (context.name1 || 'User') : (m.name || (isGroup ? '?' : wizard.sourceName));
        entries.push(`${speaker}:\n${m.mes}`);
    }

    // 超出上限时从中间截断，保留开头与结尾
    const max = settings().maxMaterialChars;
    if (entries.length > 1 && entries.reduce((sum, e) => sum + e.length, 0) > max) {
        const keepHead = Math.max(1, Math.floor(entries.length / 2) - 1);
        const keepTail = Math.max(1, Math.floor(entries.length / 2) - 1);
        const trimmed = [
            ...entries.slice(0, keepHead),
            `…… (${t`middle messages omitted`}) ……`,
            ...entries.slice(entries.length - keepTail),
        ];
        return trimmed;
    }
    return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM 提取管线
// ─────────────────────────────────────────────────────────────────────────────

const CARD_SCHEMA = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        personality: { type: 'string' },
        scenario: { type: 'string' },
        first_mes: { type: 'string' },
        mes_example: { type: 'string' },
        creator_notes: { type: 'string' },
    },
    required: ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes'],
    additionalProperties: false,
};

function makeBatches(entries, chunkChars) {
    const batches = [];
    let current = [];
    let size = 0;
    for (const entry of entries) {
        // 单条超限的整段消息硬切成多个片段
        if (entry.length > chunkChars) {
            if (current.length) {
                batches.push(current);
                current = [];
                size = 0;
            }
            for (let i = 0; i < entry.length; i += chunkChars) {
                batches.push([entry.slice(i, i + chunkChars)]);
            }
            continue;
        }
        if (size + entry.length > chunkChars && current.length) {
            batches.push(current);
            current = [];
            size = 0;
        }
        current.push(entry);
        size += entry.length;
    }
    if (current.length) {
        batches.push(current);
    }
    return batches;
}

async function extractPersona(npcName) {
    const s = settings();

    // 世界书来源卡默认值：单聊=聊天所属卡；群聊=NPC 同名卡，否则群第一个成员
    wizard.lorebookAvatar = deriveDefaultLorebookAvatar(npcName);
    wizard.lorebookCard = await fetchCard(wizard.lorebookAvatar);
    wizard.sourceCard = wizard.sourceCard ?? await fetchCard(wizard.sourceAvatar);
    wizard.npcAvatar = findAvatarByName(npcName);

    const entries = collectMaterial(npcName);
    if (entries.length === 0) {
        toastr.warning(t`No messages mentioning "${npcName}" were found.`, '', { timeOut: 6000 });
        return null;
    }

    const batches = makeBatches(entries, s.chunkChars);
    const facts = [];
    for (let i = 0; i < batches.length; i++) {
        setProgress(t`Analyzing segment ${i + 1} of ${batches.length}…`, (i + 0.5) / (batches.length + 1));
        const batchText = batches[i].join('\n\n');
        const note = await extractFacts(npcName, batchText, i + 1, batches.length);
        if (note === null) {
            toastr.error(t`LLM extraction failed. Check the connection or try again later.`);
            return null;
        }
        if (note && note.trim() && !isNothingAnswer(note.trim())) {
            facts.push(note.trim());
        }
    }

    if (facts.length === 0) {
        toastr.warning(t`The LLM found no information about "${npcName}" in this chat.`, '', { timeOut: 6000 });
        return null;
    }

    setProgress(t`Composing character card…`, batches.length / (batches.length + 1));
    const worldContext = buildWorldContext(wizard.lorebookCard ?? wizard.sourceCard, npcName);
    const card = await composeCard(npcName, facts.join('\n\n'), worldContext, s);
    if (!card) {
        toastr.error(t`Failed to get a valid JSON answer from the LLM. Try again.`);
        return null;
    }
    return card;
}

function setProgress(text, fraction) {
    $('#ne_progress_text').text(String(text ?? ''));
    if (typeof fraction === 'number') {
        $('#ne_progress_fill').css('width', `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`);
    }
}

// 模型被要求对不含该 NPC 的片段回复 nothing / 无
function isNothingAnswer(text) {
    const trimmed = String(text).trim();
    return /^nothing\.?$/i.test(trimmed)
        || /^无[资料信息。!\s]*$/.test(trimmed)
        || /(^|\n)\s*无[资料信息。!\s]*\s*$/.test(trimmed);
}

async function extractFacts(npcName, batchText, index, total) {
    // 模型侧指令保持英文，不参与界面本地化
    const systemPrompt = [
        'You are a meticulous character archivist.',
        `Below is segment ${index} of ${total} of a chat log.`,
        `Based ONLY on the log, list every fact about the character "${npcName}": identity & appearance, personality, speech style (quote original lines), abilities & knowledge, backstory, relationships with other characters, goals & motivations, and important events involving them (including what other characters said about them).`,
        'One fact per line, concise and concrete.',
        'Never invent anything not present in the log.',
        `If this segment contains nothing about "${npcName}", reply with exactly: nothing`,
    ].join(' ');
    const prompt = batchText;
    try {
        const response = await generateRaw({
            prompt,
            systemPrompt,
            responseLength: settings().responseLength,
            trimNames: false,
        });
        const text = String(response ?? '').trim();
        if (!text || /^nothing\.?$/i.test(text)) {
            return '';
        }
        return text;
    } catch (error) {
        console.error(LOG_PREFIX, 'extractFacts failed', error);
        return null;
    }
}

function buildWorldContext(card, npcName) {
    const data = card?.data ?? card ?? {};
    const description = String(data.description ?? '').slice(0, 4000);
    const scenario = String(data.scenario ?? '').slice(0, 2000);
    return [
        `Source card: ${card?.name ?? '—'}`,
        `Description: ${description || '—'}`,
        `Scenario: ${scenario || '—'}`,
        `NPC to extract: ${npcName}`,
    ].join('\n');
}

async function composeCard(npcName, facts, worldContext, s) {
    // 模型侧指令保持英文，不参与界面本地化
    const systemPrompt = [
        'You are writing a SillyTavern character card from verified facts. Write in the same language as the chat log (usually Chinese).',
        'description: a complete persona (appearance, personality, background, speech style, relationships), consistent with the world context; do not invent new world settings.',
        'personality: a one-sentence character summary.',
        'scenario: a scene in which the user ({{user}}) interacts with this NPC, reusing only settings from the world context.',
        'first_mes: the NPC\'s opening message, using *actions* and "dialogue", set in the original world.',
        'mes_example: 2-3 sample exchanges starting with <START>, with dialogue style close to the NPC\'s real lines.',
        'creator_notes: a short note saying this character was extracted from a chat log.',
        'Use "{{char}}" to refer to the NPC in scenario and first_mes. Output ONLY a JSON object with these keys: name, description, personality, scenario, first_mes, mes_example, creator_notes.',
    ].join('\n');
    const prompt = [
        worldContext,
        '',
        'Verified facts about the NPC:',
        facts,
    ].join('\n');

    // 优先走结构化输出；失败则退回提示词约束 + 宽松解析
    try {
        const json = await generateRaw({
            prompt,
            systemPrompt,
            responseLength: s.responseLength,
            trimNames: false,
            jsonSchema: CARD_SCHEMA,
        });
        const parsed = parseLooseJson(json);
        if (parsed?.description) {
            return normalizeCardFields(parsed, npcName);
        }
    } catch (error) {
        console.warn(LOG_PREFIX, 'jsonSchema generation failed, falling back', error);
    }

    try {
        const response = await generateRaw({
            prompt: `${prompt}\n\nRespond with ONLY a JSON object: {"name": "...", "description": "...", "personality": "...", "scenario": "...", "first_mes": "...", "mes_example": "...", "creator_notes": "..."}`,
            systemPrompt,
            responseLength: s.responseLength,
            trimNames: false,
        });
        const parsed = parseLooseJson(response);
        if (parsed?.description) {
            return normalizeCardFields(parsed, npcName);
        }
        console.warn(LOG_PREFIX, 'Unparseable LLM output:', response);
        return null;
    } catch (error) {
        console.error(LOG_PREFIX, 'composeCard failed', error);
        return null;
    }
}

function parseLooseJson(text) {
    if (!text) {
        return null;
    }
    let str = String(text).trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
    const start = str.indexOf('{');
    const end = str.lastIndexOf('}');
    if (start !== -1 && end > start) {
        str = str.slice(start, end + 1);
    }
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
}

function normalizeCardFields(card, npcName) {
    const result = {};
    for (const key of CARD_SCHEMA.required) {
        result[key] = String(card[key] ?? '').trim();
    }
    if (!result.name) {
        result.name = npcName;
    }
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 审校与保存
// ─────────────────────────────────────────────────────────────────────────────

function deriveDefaultLorebookAvatar(npcName) {
    if (wizard.sourceType === 'character') {
        return wizard.sourceAvatar;
    }
    const npcAvatar = findAvatarByName(npcName);
    if (npcAvatar) {
        return npcAvatar;
    }
    const group = (getContext().groups ?? []).find(x => x?.id === wizard.sourceGroupId);
    return group?.members?.[0] ?? '';
}

async function openReview(card, npcName) {
    showElement('#ne_step_progress', false);
    showElement('#ne_step_review', true);

    const fields = card ?? {
        name: npcName,
        description: '',
        personality: '',
        scenario: '',
        first_mes: '',
        mes_example: '',
        creator_notes: buildAutoNote(npcName),
    };
    $('#ne_f_name').val(fields.name ?? npcName);
    $('#ne_f_description').val(fields.description ?? '');
    $('#ne_f_personality').val(fields.personality ?? '');
    $('#ne_f_scenario').val(fields.scenario ?? '');
    $('#ne_f_first_mes').val(fields.first_mes ?? '');
    $('#ne_f_mes_example').val(fields.mes_example ?? '');
    $('#ne_f_creator_notes').val(fields.creator_notes ?? '');

    // 沿用项默认勾选状态：原卡该字段有内容才默认沿用
    const srcData = wizard.lorebookCard?.data ?? wizard.lorebookCard ?? {};
    for (const id of CARRY_IDS) {
        const source = srcData[id];
        const has = Array.isArray(source) ? source.length > 0 : Boolean(source);
        $(`#ne_carry_${id}`).prop('checked', has);
    }

    // 世界书来源下拉
    const select = $('#ne_lorebook_select').empty();
    for (const option of buildSourceOptions().filter(x => x.type === 'character')) {
        select.append($('<option></option>').val(option.value).text(option.label));
    }
    select.val(`character:${wizard.lorebookAvatar}`);
    await refreshBookInfo();

    // 头像下拉：NPC 同名卡头像可选仅在存在时展示
    const avatarSelect = $('#ne_avatar_select');
    avatarSelect.children('option[value="npc"]').css('display', wizard.npcAvatar ? '' : 'none');
    if (!wizard.npcAvatar && avatarSelect.val() === 'npc') {
        avatarSelect.val('source');
    }
}

function buildAutoNote(npcName) {
    const where = wizard.sourceType === 'group' ? `${t`group chat`} ${wizard.sourceName}` : `${wizard.sourceName} / ${wizard.chatKey}`;
    return t`Extracted from the chat log "${where}" (NPC: ${npcName}), world book carried over from the source card. Generated by the NPC Character Extractor extension.`;
}

async function refreshBookInfo() {
    const value = String($('#ne_lorebook_select').val() ?? '');
    const avatarUrl = value.replace(/^character:/, '');
    await selectLorebook(avatarUrl);
}

async function selectLorebook(avatarUrl) {
    wizard.lorebookAvatar = avatarUrl;
    wizard.lorebookCard = await fetchCard(avatarUrl);
    const data = wizard.lorebookCard?.data ?? wizard.lorebookCard ?? {};
    const book = data.character_book;
    if (book?.entries?.length) {
        $('#ne_book_info').text(`${t`Embedded world book`}《${book.name ?? avatarUrl}》· ${book.entries.length} ${t`entries`} · ${t`world file`}: ${data.extensions?.world || '—'}`);
    } else if (data.extensions?.world) {
        $('#ne_book_info').text(`${t`No embedded world book; linked world file`}: ${data.extensions.world}`);
    } else {
        $('#ne_book_info').text(t`This card has no world book.`);
    }
}

function readReviewForm() {
    const checkboxes = {};
    for (const id of CARRY_IDS) {
        checkboxes[id] = $(`#ne_carry_${id}`).is(':checked');
    }
    return {
        name: String($('#ne_f_name').val() ?? '').trim(),
        description: String($('#ne_f_description').val() ?? ''),
        personality: String($('#ne_f_personality').val() ?? ''),
        scenario: String($('#ne_f_scenario').val() ?? ''),
        first_mes: String($('#ne_f_first_mes').val() ?? ''),
        mes_example: String($('#ne_f_mes_example').val() ?? ''),
        creator_notes: String($('#ne_f_creator_notes').val() ?? ''),
        carry: checkboxes,
    };
}

function buildCardData(review) {
    const srcData = wizard.lorebookCard?.data ?? wizard.lorebookCard ?? {};
    const data = {
        name: review.name,
        description: review.description,
        personality: review.personality,
        scenario: review.scenario,
        first_mes: review.first_mes,
        mes_example: review.mes_example,
        creator_notes: review.creator_notes,
        system_prompt: review.carry.system_prompt ? (srcData.system_prompt ?? '') : '',
        post_history_instructions: review.carry.post_history_instructions ? (srcData.post_history_instructions ?? '') : '',
        tags: review.carry.tags ? deepClone(srcData.tags ?? []) : [],
        creator: review.carry.creator ? (srcData.creator ?? '') : '',
        character_version: '',
        alternate_greetings: [],
        extensions: deepClone(srcData.extensions ?? {}),
    };
    const book = srcData.character_book;
    if (book && book.entries?.length) {
        data.character_book = deepClone(book);
    }
    return data;
}

function deepClone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

async function exportPngAvatar(avatarUrl) {
    try {
        const response = await fetch('/api/characters/export', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ format: 'png', avatar_url: avatarUrl }),
        });
        if (response.ok) {
            return await response.blob();
        }
        console.error(LOG_PREFIX, 'export failed', response.status, await response.text().catch(() => ''));
    } catch (error) {
        console.error(LOG_PREFIX, 'export failed', error);
    }
    return null;
}

async function saveNewCharacter(withDownload) {
    if (wizard.busy) {
        return;
    }
    const review = readReviewForm();
    if (!review.name) {
        toastr.warning(t`Enter a character name first.`);
        return;
    }
    if (!review.description.trim() || !review.first_mes.trim()) {
        toastr.warning(t`Description and first message should not be empty.`);
        return;
    }

    wizard.busy = true;
    $('#ne_save_info').text(withDownload ? t`Saving and preparing PNG…` : t`Saving…`);
    try {
        // 1. 底图：所选头像（缺省则由服务端用默认头像兜底）
        const avatarChoice = String($('#ne_avatar_select').val());
        const avatarUrl = avatarChoice === 'npc'
            ? (wizard.npcAvatar || wizard.lorebookAvatar)
            : (avatarChoice === 'default' ? '' : wizard.lorebookAvatar);
        let avatarFile = null;
        if (avatarUrl) {
            const blob = await exportPngAvatar(avatarUrl);
            if (!blob) {
                throw new Error(t`Failed to load the source avatar image.`);
            }
            avatarFile = new File([blob], 'avatar.png', { type: 'image/png' });
        }

        // 2. 创建角色（输入字段与 charaFormatData 对齐）
        const srcData = wizard.lorebookCard?.data ?? wizard.lorebookCard ?? {};
        const formData = new FormData();
        formData.append('ch_name', review.name);
        formData.append('description', review.description);
        formData.append('personality', review.personality);
        formData.append('scenario', review.scenario);
        formData.append('first_mes', review.first_mes);
        formData.append('mes_example', review.mes_example);
        formData.append('creator_notes', review.creator_notes);
        formData.append('system_prompt', review.carry.system_prompt ? String(srcData.system_prompt ?? '') : '');
        formData.append('post_history_instructions', review.carry.post_history_instructions ? String(srcData.post_history_instructions ?? '') : '');
        formData.append('creator', review.carry.creator ? String(srcData.creator ?? '') : '');
        formData.append('tags', review.carry.tags && Array.isArray(srcData.tags) ? srcData.tags.join(', ') : '');
        formData.append('character_version', '');
        formData.append('talkativeness', '0.5');
        formData.append('fav', 'false');
        if (avatarFile) {
            formData.append('avatar', avatarFile);
        }
        const createResponse = await fetch('/api/characters/create', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
            body: formData,
            cache: 'no-cache',
        });
        if (!createResponse.ok) {
            throw new Error(`${t`Character creation failed`}: HTTP ${createResponse.status}`);
        }
        const avatarName = String((await createResponse.text()) ?? '').trim();
        if (!avatarName) {
            throw new Error(t`Character creation failed` + ' (empty response)');
        }

        // 3. 合并写入世界书与沿用字段（create 不携带 world，内嵌书由此处写入）
        const cardData = buildCardData(review);
        const mergeResponse = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar: avatarName, data: cardData }),
        });
        if (!mergeResponse.ok) {
            const message = await mergeResponse.json().catch(() => ({}));
            throw new Error(`${t`Saving character data failed`}: ${message.message ?? `HTTP ${mergeResponse.status}`}`);
        }

        // 4. 刷新列表并选中新角色
        await getCharacters();
        const index = getContext().characters.findIndex(x => x?.avatar === avatarName);
        if (index >= 0) {
            await selectCharacterById(index, { switchMenu: false });
        }

        // 5. 下载
        if (withDownload) {
            const blob = await exportPngAvatar(avatarName);
            if (blob) {
                downloadBlob(blob, avatarName);
            } else {
                toastr.warning(t`Saved, but the PNG download failed.`);
            }
        }

        toastr.success(t`Character "${review.name}" saved as ${avatarName}.`);
        $('#ne_save_info').text(`${t`Saved as ${avatarName}`}${withDownload ? ` · ${t`PNG downloaded`}` : ''}`);
    } catch (error) {
        console.error(LOG_PREFIX, 'saveNewCharacter failed', error);
        toastr.error(error?.message ?? String(error), '', { timeOut: 8000 });
        $('#ne_save_info').text(t`Save failed. See browser console for details.`);
    } finally {
        wizard.busy = false;
    }
}

function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
}

// ─────────────────────────────────────────────────────────────────────────────
// 向导事件（document 委托，弹窗重建后依然有效）
// ─────────────────────────────────────────────────────────────────────────────

function bindWizardEvents() {
    $(document).on('change.neExt', '#ne_source_select', async function () {
        if (wizard.busy) {
            return;
        }
        const value = String($(this).val() ?? '');
        const [type, ...rest] = value.split(':');
        if (type === 'group') {
            wizard.sourceType = 'group';
            wizard.sourceGroupId = rest.join(':');
            wizard.sourceAvatar = '';
        } else {
            wizard.sourceType = 'character';
            wizard.sourceAvatar = rest.join(':');
            wizard.sourceGroupId = '';
        }
        wizard.loaded = false;
        wizard.messages = [];
        wizard.chatKey = '';
        wizard.sourceCard = null;
        wizard.candidates = [];
        $('#ne_npc_candidates').empty();
        await reloadChats(false);
    });

    $(document).on('change.neExt', '#ne_chat_select', async function () {
        if (wizard.busy) {
            return;
        }
        wizard.chatKey = String($(this).val() ?? '');
        await loadSelectedChat();
    });

    $(document).on('input.neExt', '#ne_npc_input', () => {
        wizard.npcName = String($('#ne_npc_input').val() ?? '').trim();
    });

    $(document).on('click.neExt', '.ne_chip', function () {
        const name = $(this).text().replace(/ ×\d+$/, '');
        $('#ne_npc_input').val(name);
        wizard.npcName = name;
        wizard.npcAvatar = findAvatarByName(name);
    });

    $(document).on('change.neExt', '#ne_lorebook_select', () => {
        refreshBookInfo();
    });

    $(document).on('click.neExt', '#ne_btn_extract', async (event) => {
        event.preventDefault();
        if (wizard.busy) {
            return;
        }
        const npcName = String($('#ne_npc_input').val() ?? '').trim();
        if (!npcName) {
            toastr.warning(t`Enter the NPC's name first.`);
            return;
        }
        if (!wizard.loaded) {
            toastr.warning(t`Load a chat file first.`);
            return;
        }
        wizard.busy = true;
        wizard.npcName = npcName;
        showElement('#ne_step_progress', true);
        showElement('#ne_step_review', false);
        setProgress(t`Starting extraction…`, 0.02);
        try {
            const card = await extractPersona(npcName);
            if (card) {
                await openReview(card, npcName);
            } else {
                showElement('#ne_step_progress', false);
            }
        } catch (error) {
            console.error(LOG_PREFIX, 'extraction failed', error);
            toastr.error(error?.message ?? String(error));
            showElement('#ne_step_progress', false);
        } finally {
            wizard.busy = false;
        }
    });

    $(document).on('click.neExt', '#ne_btn_manual', async (event) => {
        event.preventDefault();
        if (wizard.busy) {
            return;
        }
        const npcName = String($('#ne_npc_input').val() ?? '').trim();
        if (!wizard.loaded) {
            toastr.warning(t`Load a chat file first.`);
            return;
        }
        wizard.npcName = npcName;
        wizard.lorebookAvatar = deriveDefaultLorebookAvatar(npcName);
        wizard.lorebookCard = await fetchCard(wizard.lorebookAvatar);
        wizard.npcAvatar = findAvatarByName(npcName);
        await openReview(null, npcName || t`New NPC`);
    });

    $(document).on('click.neExt', '#ne_btn_save', (event) => {
        event.preventDefault();
        saveNewCharacter(false);
    });

    $(document).on('click.neExt', '#ne_btn_save_download', (event) => {
        event.preventDefault();
        saveNewCharacter(true);
    });
}
