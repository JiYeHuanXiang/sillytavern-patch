// Mobile UI layer for /mobile (injected after script.js by server-main.js).
// Layout A shell: WeChat-style bottom tabs, chat bubbles (mobile.css), and a
// session list page ("消息" tab) backed by POST /api/chats/recent.
// The engine drawer system stays authoritative — tabs only toggle it; opening
// conversations goes through the engine's own SillyTavern.getContext() API.
(function () {
    'use strict';

    document.body.classList.add('st-mobile');

    let layout = 'a';
    try {
        const saved = localStorage.getItem('stMobileLayout');
        if (['a', 'b', 'c'].includes(saved)) layout = saved;
    } catch { /* private mode etc. */ }
    document.body.dataset.stLayout = layout;

    if (layout !== 'a') return; // layouts b / c land later

    const TABS = [
        { id: 'msg', label: '消息', icon: '💬' },
        { id: 'friends', label: '好友', icon: '👥', engineIcon: '#rightNavDrawerIcon' },
        { id: 'me', label: '我', icon: '👤', engineIcon: '#user-settings-button .drawer-icon' },
    ];

    // The engine binds its drawer toggle handler on .drawer-toggle wrappers
    // (doNavbarIconClick reads $(this).parent().find('.drawer-content')), so
    // clicking the bare icon does nothing — click the wrapper instead.
    function engineToggle(selector) {
        const icon = document.querySelector(selector);
        if (!icon) return;
        (icon.closest('.drawer-toggle') || icon).click();
    }

    function closeOpenDrawers() {
        document.querySelectorAll('.drawer-content.openDrawer').forEach(content => {
            const holder = content.closest('.drawer') || content.parentElement;
            const toggle = holder && holder.querySelector('.drawer-toggle');
            if (toggle) toggle.click();
        });
    }

    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    /* ---------- view state: session list vs engine chat ---------- */
    function setView(view) {
        document.body.dataset.stMView = view;
    }

    function setActive(id) {
        document.querySelectorAll('#st-m-tabbar .st-m-tab').forEach(b =>
            b.classList.toggle('on', b.dataset.tab === id));
    }

    /* ---------- bottom tab bar ---------- */
    function buildTabBar() {
        const nav = document.createElement('nav');
        nav.id = 'st-m-tabbar';
        nav.innerHTML = TABS.map(t =>
            `<button class="st-m-tab" data-tab="${t.id}"><span class="st-m-ti">${t.icon}</span><span>${t.label}</span></button>`
        ).join('');
        document.body.appendChild(nav);

        nav.addEventListener('click', e => {
            const btn = e.target.closest('.st-m-tab');
            if (!btn) return;
            const tab = TABS.find(t => t.id === btn.dataset.tab);
            if (!tab) return;
            if (!tab.engineIcon) {
                closeOpenDrawers();
                setActive('msg');
                setView('list');
                refreshSessionList();
            } else {
                setView('chat'); // list gives way to the drawer page
                engineToggle(tab.engineIcon);
            }
        });
    }

    /* ---------- drawer highlight sync ---------- */
    function watchDrawers() {
        const map = [
            // #rightNavHolder is a standalone drawer (no .drawer wrapper id),
            // so its panel is resolved by id; the top-settings drawers use the wrapper.
            { icon: '#rightNavDrawerIcon', panel: '#right-nav-panel', tab: 'friends' },
            { icon: '#user-settings-button .drawer-icon', panel: null, tab: 'me' },
        ];
        map.forEach(({ icon, panel, tab }) => {
            const iconEl = document.querySelector(icon);
            if (!iconEl) return;
            let content = panel ? document.querySelector(panel) : null;
            if (!content) {
                const holder = iconEl.closest('.drawer') || iconEl.parentElement;
                content = holder && holder.querySelector('.drawer-content');
            }
            if (!content) return;
            new MutationObserver(() => {
                if (content.classList.contains('openDrawer')) setActive(tab);
                else if (document.querySelector('#st-m-tabbar .st-m-tab.on')?.dataset.tab === tab) setActive('msg');
            }).observe(content, { attributes: true, attributeFilter: ['class'] });
        });
    }

    /* ---------- session list ("消息" tab home) ---------- */
    const listState = { loaded: false, loading: false };

    function fmtTime(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return '';
        const now = new Date();
        const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        if (d.toDateString() === now.toDateString()) return hm;
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return '昨天';
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    async function fetchRecent() {
        const token = await fetch('/csrf-token').then(r => r.json());
        return fetch('/api/chats/recent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token.token },
            body: JSON.stringify({}),
        }).then(r => r.json());
    }

    // script.js is a huge module: getContext() throws a TDZ error until its
    // bootstrapping reaches the chat/characters declarations, and the roster
    // fills seconds later — poll until characters are actually populated.
    async function getCtx() {
        for (let i = 0; i < 30; i++) {
            try {
                const ctx = window.SillyTavern.getContext();
                if (ctx && ctx.characters?.length) return ctx;
            } catch { /* engine still bootstrapping */ }
            await new Promise(r => setTimeout(r, 1000));
        }
        // Give up waiting for the roster (empty install?) but don't hard-fail
        const ctx = window.SillyTavern.getContext();
        if (ctx && Array.isArray(ctx.characters)) return ctx;
        throw new Error('引擎未就绪，请稍后刷新');
    }

    async function refreshSessionList() {
        const box = document.getElementById('st-m-list-rows');
        if (!box || listState.loading) return;
        listState.loading = true;
        box.innerHTML = '<div class="st-m-hint">加载中…</div>';
        try {
            const ctx = await getCtx();
            const recent = await fetchRecent();
            if (!Array.isArray(recent) || !recent.length) {
                box.innerHTML = '<div class="st-m-hint">暂无会话，到「好友」页开始聊天</div>';
                return;
            }
            const charByAvatar = new Map((ctx.characters || []).map(c => [c.avatar, c]));
            const groupById = new Map((ctx.groups || []).map(g => [String(g.id), g]));
            box.innerHTML = recent.map(entry => {
                const time = fmtTime(entry.last_mes);
                const preview = entry.mes || '';
                if (entry.group) {
                    const g = groupById.get(String(entry.group));
                    const name = g ? g.name : (entry.file_name || '群聊').replace(/\.jsonl$/, '');
                    return `<button class="st-m-row" data-kind="group" data-id="${esc(entry.group)}">
                        <span class="st-m-avx st-m-gavx">🏛️</span>
                        <span class="st-m-rm"><span class="st-m-rn">${esc(name)}</span><span class="st-m-rp ellip">${esc(preview)}</span></span>
                        <span class="st-m-rt">${esc(time)}</span>
                    </button>`;
                }
                const ch = charByAvatar.get(entry.avatar);
                const name = ch ? ch.name : (entry.file_name || '').replace(/ - \d{4}.*$/, '').replace(/\.jsonl$/, '');
                const chid = ch ? ctx.characters.indexOf(ch) : -1;
                const thumb = `/thumbnail?type=avatar&file=${encodeURIComponent(entry.avatar || '')}`;
                return `<button class="st-m-row" data-kind="char" data-chid="${chid}" data-name="${esc(name)}">
                        <span class="st-m-avx"><img src="${thumb}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></span>
                        <span class="st-m-rm"><span class="st-m-rn">${esc(name)}</span><span class="st-m-rp ellip">${esc(preview)}</span></span>
                        <span class="st-m-rt">${esc(time)}</span>
                    </button>`;
            }).join('');
            listState.loaded = true;
        } catch (err) {
            box.innerHTML = `<div class="st-m-hint">加载失败：${esc(err && err.message || err)}</div>`;
        } finally {
            listState.loading = false;
        }
    }

    async function openConversation(row) {
        const kind = row.dataset.kind;
        try {
            const ctx = await getCtx();
            if (kind === 'char') {
                const chid = Number(row.dataset.chid);
                if (!Number.isInteger(chid) || chid < 0) {
                    // shallow roster may miss the card; fall back to the character panel
                    setView('chat');
                    engineToggle('#rightNavDrawerIcon');
                    return;
                }
                await ctx.selectCharacterById(chid);
            } else if (kind === 'group') {
                // openGroupChat() needs an explicit chatId; the engine's own
                // group-card click path is openGroupById() — same live module
                // instance the engine loaded, reachable via dynamic import.
                const mod = await import('/scripts/group-chats.js');
                await mod.openGroupById(String(row.dataset.id));
            }
            setView('chat');
        } catch (err) {
            console.error('[ST Mobile] open conversation failed:', err);
        }
    }

    function buildSessionList() {
        const section = document.createElement('section');
        section.id = 'st-m-list';
        section.innerHTML = `
            <div class="st-m-hdr"><div class="st-m-hdr-t">消息</div></div>
            <input id="st-m-search" type="text" placeholder="搜索" autocomplete="off">
            <div id="st-m-list-rows"><div class="st-m-hint">加载中…</div></div>`;
        document.body.appendChild(section);

        section.addEventListener('click', e => {
            const row = e.target.closest('.st-m-row');
            if (row) openConversation(row);
        });
        document.getElementById('st-m-search').addEventListener('input', e => {
            const q = e.target.value.trim().toLowerCase();
            document.querySelectorAll('#st-m-list-rows .st-m-row').forEach(row => {
                const name = (row.dataset.name || row.querySelector('.st-m-rn')?.textContent || '').toLowerCase();
                row.style.display = !q || name.includes(q) ? '' : 'none';
            });
        });

        // back button shown while inside a conversation
        const back = document.createElement('button');
        back.id = 'st-m-back';
        back.textContent = '‹';
        back.addEventListener('click', () => {
            setView('list');
            setActive('msg');
            refreshSessionList();
        });
        document.body.appendChild(back);
    }

    /* ---------- start ---------- */
    function start() {
        if (document.getElementById('st-m-tabbar')) return;
        buildTabBar();
        watchDrawers();
        buildSessionList();
        setActive('msg');
        setView('list');
        refreshSessionList();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    console.log('[ST Mobile] layer active, layout =', layout);
})();
