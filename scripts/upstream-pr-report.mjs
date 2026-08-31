#!/usr/bin/env node
/**
 * 抓取上游 SillyTavern/SillyTavern 开放中的 PR，
 * 调用 SiliconFlow DeepSeek 翻译为中文并按类别分类，
 * 输出中文 Markdown 文档。
 *
 * 用法:
 *   node scripts/upstream-pr-report.mjs
 *
 * 可选环境变量:
 *   SF_API_BASE   翻译 API base，默认 https://api.siliconflow.cn/v1
 *   SF_API_KEY    翻译 API key（必需，默认已内置）
 *   SF_MODEL      翻译模型，默认 deepseek-ai/DeepSeek-V3.2
 *   GH_REPO       上游仓库，默认 SillyTavern/SillyTavern
 *   OUT_PATH      输出文档路径，默认 docs/upstream-open-prs.zh.md
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---------- 配置 ----------
const GH_REPO = process.env.GH_REPO || 'SillyTavern/SillyTavern';
const SF_API_BASE = (process.env.SF_API_BASE || 'https://api.siliconflow.cn/v1').replace(/\/$/, '');
const SF_API_KEY = process.env.SF_API_KEY || 'sk-zxcddagncsemgexivclwwfpymmmnzbywzfdiyaghhjllluar';
const SF_MODEL = process.env.SF_MODEL || 'deepseek-ai/DeepSeek-V3.2';
const OUT_PATH = process.env.OUT_PATH
    ? join(ROOT, process.env.OUT_PATH)
    : join(ROOT, 'docs', 'upstream-open-prs.zh.md');

const CATEGORIES = [
    ['功能', '新特性 / 新增能力'],
    ['修复', 'Bug 修复'],
    ['优化', '性能 / 体验 / 可访问性改进'],
    ['安全', '安全加固 / 鉴权 / 凭据'],
    ['重构', '代码重构 / 结构调整'],
    ['文档', '文档 / 说明'],
    ['其他', '杂项 / 构建 / CI / 依赖'],
];
const VALID_CATS = CATEGORIES.map(c => c[0]);
const CATEGORY_ORDER = CATEGORIES.map(c => c[0]);

const BATCH_SIZE = 8;

// ---------- 网络安全守卫 ----------
/** 仅允许 http/https，拒绝 localhost / 环回 / 私有 / 保留地址 */
function assertSafeUrl(raw) {
    let u;
    try { u = new URL(raw); } catch { throw new Error(`非法 URL: ${raw}`); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error(`仅允许 http/https 协议: ${raw}`);
    }
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0') {
        throw new Error(`拒绝本地地址: ${raw}`);
    }
    const ipVer = isIP(h);
    if (ipVer === 4) {
        const [a, b] = h.split('.').map(Number);
        const isLoop = a === 127;
        const isPriv = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
        const isLink = a === 169 && b === 254;
        const isReserved = a === 0 || (a === 100 && b >= 64 && b <= 127) || a >= 224;
        if (isLoop || isPriv || isLink || isReserved) throw new Error(`拒绝私有/保留 IP: ${raw}`);
    } else if (ipVer === 6) {
        if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) {
            throw new Error(`拒绝私有/环回 IPv6: ${raw}`);
        }
    }
}

// ---------- GitHub PR 抓取（经 gh CLI，规避直连网络问题）----------
function ghBin() {
    // 便携安装路径，按平台扩展名区分
    const base = join(homedir(), '.gh-bin', 'bin', 'gh');
    return process.platform === 'win32' ? base + '.exe' : base;
}

function fetchAllOpenPRs() {
    const gh = ghBin();
    // gh api --paginate 自动跟随 Link 分页，每页一个 JSON 数组对象
    const apiPath = `repos/${GH_REPO}/pulls?state=open&sort=created&direction=desc&per_page=100`;
    // --jq 仅保留所需字段，逐对象输出（NDJSON）
    const jq = '.[] | {number,title,html_url,user:(.user.login//"?"),draft:(.draft//false),labels:[.labels[].name],body:(.body//"")}';
    let raw;
    try {
        raw = execSync(
            `"${gh}" api --paginate --jq ${JSON.stringify(jq)} ${JSON.stringify(apiPath)}`,
            { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: 'bash' },
        );
    } catch (e) {
        throw new Error(`gh api 调用失败: ${e.message}`);
    }
    const all = [];
    for (const line of raw.split('\n')) {
        const s = line.trim();
        if (!s) continue;
        let pr;
        try { pr = JSON.parse(s); } catch { continue; }
        all.push({
            number: pr.number,
            title: (pr.title || '').trim(),
            url: pr.html_url,
            user: pr.user || '?',
            draft: !!pr.draft,
            labels: Array.isArray(pr.labels) ? pr.labels : [],
            body: pr.body || '',
        });
    }
    // 去重（--paginate 偶发边界重复）
    const seen = new Set();
    return all.filter(p => (seen.has(p.number) ? false : (seen.add(p.number), true)));
}

// ---------- 翻译 + 分类 ----------
function bodySummary(body, max = 300) {
    if (!body) return '';
    const text = body.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim();
    return text.slice(0, max);
}

function buildPrompt(prs) {
    const items = prs.map(p => ({
        number: p.number,
        title: p.title,
        labels: p.labels.slice(0, 6),
        summary: bodySummary(p.body, 240),
    }));
    return [
        '你是软件工程助手。请将下面 GitHub PR 的标题翻译成简体中文，并按内容归类。',
        '分类必须从下列中选择: ' + VALID_CATS.join('、'),
        '- 功能: 新增功能 / 新能力',
        '- 修复: Bug 修复',
        '- 优化: 性能 / 体验 / 可访问性改进',
        '- 安全: 安全加固 / 鉴权 / 凭据',
        '- 重构: 代码重构 / 结构调整（无行为变化）',
        '- 文档: 文档 / 说明',
        '- 其他: 构建 / CI / 依赖 / 杂项',
        '标题请简洁、专业，不要加引号或句号。保留专有名词（如 SillyTavern、TTS、OpenAI、QuickReply 等）。',
        '只返回 JSON 数组，不要 markdown 围栏，不要解释。每项格式: {"number":数字,"category":"类别","title_zh":"中文标题"}',
        'PR 列表 JSON:',
        JSON.stringify(items, null, 2),
    ].join('\n');
}

function extractJsonArray(text) {
    let t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    const start = t.indexOf('[');
    const end = t.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) throw new Error('无法解析 JSON 数组');
    return JSON.parse(t.slice(start, end + 1));
}

async function translateBatch(prs) {
    const body = {
        model: SF_MODEL,
        messages: [{ role: 'user', content: buildPrompt(prs) }],
        temperature: 0.2,
        max_tokens: 2000,
    };
    const url = `${SF_API_BASE}/chat/completions`;
    assertSafeUrl(url);
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SF_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`翻译 API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const arr = extractJsonArray(content);
    const map = new Map();
    for (const it of arr) {
        if (typeof it.number !== 'number') continue;
        const cat = VALID_CATS.includes(it.category) ? it.category : '其他';
        map.set(it.number, { category: cat, title_zh: String(it.title_zh || '').trim() });
    }
    return map;
}

async function translateAll(prs) {
    const result = new Map();
    for (let i = 0; i < prs.length; i += BATCH_SIZE) {
        const batch = prs.slice(i, i + BATCH_SIZE);
        process.stderr.write(`  翻译中 [${i + 1}-${i + batch.length}/${prs.length}]…\n`);
        // 单批失败不致命：保留原文，分类置“其他”
        try {
            const m = await translateBatch(batch);
            for (const pr of batch) {
                const got = m.get(pr.number);
                result.set(pr.number, got || { category: '其他', title_zh: pr.title });
            }
        } catch (e) {
            process.stderr.write(`    ⚠ 批次失败: ${e.message}\n`);
            for (const pr of batch) result.set(pr.number, { category: '其他', title_zh: pr.title });
        }
    }
    return result;
}

// ---------- 渲染 Markdown ----------
function esc(s) {
    return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function render(input) {
    const { prs, tr, generatedAt, total } = input;
    const byCat = new Map(CATEGORIES.map(c => [c[0], []]));
    for (const pr of prs) {
        const t = tr.get(pr.number) || { category: '其他', title_zh: pr.title };
        const arr = byCat.get(t.category) || byCat.get('其他');
        arr.push({ pr, t });
    }

    const lines = [];
    lines.push('# 上游开放中 PR 整理（中文）');
    lines.push('');
    lines.push(`- 上游仓库: \`${GH_REPO}\``);
    lines.push(`- 抓取时间: ${generatedAt}`);
    lines.push(`- 开放 PR 总数: ${total}`);
    lines.push(`- 翻译模型: \`${SF_MODEL}\` (SiliconFlow)`);
    lines.push('');
    lines.push('## 分类统计');
    lines.push('');
    lines.push('| 类别 | 说明 | 数量 |');
    lines.push('| --- | --- | --- |');
    for (const [name, desc] of CATEGORIES) {
        const n = byCat.get(name).length;
        if (n) lines.push(`| ${name} | ${desc} | ${n} |`);
    }
    lines.push('');

    for (const cat of CATEGORY_ORDER) {
        const arr = byCat.get(cat);
        if (!arr.length) continue;
        lines.push(`## ${cat}`);
        lines.push('');
        lines.push(`> ${CATEGORIES.find(c => c[0] === cat)[1]}（共 ${arr.length} 个）`);
        lines.push('');
        lines.push('| # | 中文标题 | 原标题 | 作者 | 草稿 | 链接 |');
        lines.push('| --- | --- | --- | --- | --- | --- |');
        for (const { pr, t } of arr) {
            lines.push(
                `| ${pr.number} | ${esc(t.title_zh)} | ${esc(pr.title)} | ${esc(pr.user)} | ${pr.draft ? '是' : ''} | [PR](${pr.url}) |`,
            );
        }
        lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('生成自 `scripts/upstream-pr-report.mjs`，标题译自上游 PR 原文，分类由模型推断，仅供参考。');
    return lines.join('\n');
}

// ---------- 主流程 ----------
async function main() {
    process.stderr.write(`抓取 ${GH_REPO} 开放 PR…\n`);
    const prs = fetchAllOpenPRs();
    if (!prs.length) {
        process.stderr.write('未找到开放 PR。\n');
        return;
    }
    process.stderr.write(`共 ${prs.length} 个 PR，开始翻译/分类…\n`);
    const tr = await translateAll(prs);

    const md = render({
        prs, tr,
        total: prs.length,
        generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
    });

    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, md, 'utf8');
    process.stderr.write(`✓ 已输出: ${OUT_PATH}\n`);
    console.log(OUT_PATH);
}

main().catch(e => {
    process.stderr.write(`✗ 失败: ${e.stack || e.message}\n`);
    process.exit(1);
});
