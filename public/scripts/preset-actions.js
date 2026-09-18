/**
 * Filters "preset action" choice blocks that character cards append to AI messages,
 * e.g. "1.继续交谈 2.离开现场" or "A.继续前进 B.向右转向", together with the short
 * prompt line that introduces them (e.g. "请选择你的行动：").
 *
 * A block is only removed when it consists of at least two indexed options,
 * so ordinary numbered prose is left untouched. Both vertical blocks
 * (one option per line) and inline blocks (several options on one line,
 * optionally wrapped in parentheses) are handled. Text is never modified
 * in place - the filtered copy is returned.
 */

// A single option label: 1-2 digits, a single latin letter, a circled number or a single CJK numeral.
const LABEL_PATTERN = '(?:\\d{1,2}|[A-Za-z]|[①-⑳]|[一二三四五六七八九十])';

// Start of one option item: the label plus an optional closing bracket or list punctuation.
// A match never starts on whitespace, so the char before it is the true separator.
// Circled numbers usually appear without any trailing punctuation. Lowercase "e." / "i."
// latin abbreviations are excluded to avoid matching prose like "e.g. ... i.e. ...",
// and a digit right after the punctuation marks a decimal number ("2.5"), not an option.
const ITEM_START_SOURCE = '(?:' +
    '[①-⑳]\\s*' +
    `|[（(【\\[]${LABEL_PATTERN}[)）\\]】]\\s*` +
    '|[（(【\\[]?(?:\\d{1,2}|[一二三四五六七八九十]|(?![ei]\\.)[A-Za-z])[\\.、．,，:：)）](?![\\s]*\\d)\\s*' +
    ')';

// Characters that may directly precede an option item mid-line
// (separator, opening bracket, quote, sentence ender, CJK text - Chinese cards
// often run options together without spaces: "1.选项一2.选项二").
const PRECEDING_CHARS = /[\s（(【[\]|｜/／:：,，、;；.。．!！?？…>」』"'“”‘’\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// Markdown decorations that may sit in front of an option line (bullets, quotes, bold markers).
const DECORATION_PREFIX = /^[\s>*\-+•·#"“'‘]+/;

// Short line that only asks the player to pick one of the options below it.
const HEADER_ONLY_LINE = /^[\s>*\-#+[(（【]*(?:可选行动|行动选项|可选项|选项|你的选择|下一步|available (?:actions?|options?|choices?)|choices?|your choice|next actions?)[)\]）】*#:：\s]*$/i;

// Keywords that mark a line as the lead-in prompt of an option block.
const LEAD_IN_KEYWORDS = /(?:请选择|请输入|请挑选|选一个|挑一个|做出选择|你的选择|你可以选择|可供选择|选择你的|选择一项|行动选项|可选行动|下一步|接下来的行动|接下来该|接下来做|怎么做|如何行动|如何选择|采取行动|什么行动|choose|select|pick|choice|option|action|decision|what do you|what will you|your move|next move)/i;

const MAX_OPTION_LINE_LENGTH = 200;
const MAX_ITEM_GAP = 120;
const MAX_LEAD_IN_LENGTH = 60;

// Sentence punctuation inside the text between two options on the same line
// usually means the items belong to different sentences, not to one option list.
const FORBIDDEN_GAP_CHARS = /[.。!！?？…;；]/;

/**
 * Finds the positions of all valid option item starts on a line.
 * @param {string} line Line of text
 * @returns {{index: number, end: number}[]} Item positions
 */
function findItemStarts(line) {
    const items = [];
    for (const match of line.matchAll(new RegExp(ITEM_START_SOURCE, 'g'))) {
        if (match.index === 0 || PRECEDING_CHARS.test(line[match.index - 1])) {
            items.push({ index: match.index, end: match.index + match[0].length });
        }
    }
    return items;
}

/**
 * Whether two adjacent items on the same line belong to the same option list.
 * @param {string} line Line of text
 * @param {number} prevEnd End of the previous item
 * @param {number} nextIndex Start of the next item
 * @returns {boolean}
 */
function isContiguous(line, prevEnd, nextIndex) {
    const gap = line.slice(prevEnd, nextIndex);
    return gap.length <= MAX_ITEM_GAP && !FORBIDDEN_GAP_CHARS.test(gap);
}

/**
 * Whether a line is a short lead-in prompt that only introduces an option block.
 * @param {string} line Line of text
 * @returns {boolean}
 */
function isLeadInLine(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > MAX_LEAD_IN_LENGTH) {
        return false;
    }
    return HEADER_ONLY_LINE.test(trimmed) || LEAD_IN_KEYWORDS.test(trimmed);
}

/**
 * Classifies a line for option block detection.
 * @param {string} line Line of text
 * @returns {{type: 'option', count: number} | {type: 'partial', from: number} | {type: 'normal'} }
 * 'option'  - the line itself is (the start of) an option item
 * 'partial' - options start mid-line; strip from `from` to the end of the line
 */
function classifyLine(line) {
    if (line.trim() === '' || line.length > MAX_OPTION_LINE_LENGTH) {
        return { type: 'normal' };
    }

    // Classify the line without its markdown decorations; report indexes relative to the full line.
    const decoration = line.match(DECORATION_PREFIX)?.[0]?.length ?? 0;
    const body = decoration > 0 ? line.slice(decoration) : line;

    const items = findItemStarts(body);
    if (items.length === 0) {
        return { type: 'normal' };
    }

    // Group adjacent items: an option list is a run of items separated by short prose.
    const groups = [[items[0]]];
    for (let i = 1; i < items.length; i++) {
        const lastGroup = groups[groups.length - 1];
        const lastItem = lastGroup[lastGroup.length - 1];
        if (isContiguous(body, lastItem.end, items[i].index)) {
            lastGroup.push(items[i]);
        } else {
            groups.push([items[i]]);
        }
    }

    if (items[0].index === 0) {
        return { type: 'option', count: groups[0].length };
    }

    for (const group of groups) {
        if (group.length >= 2) {
            let from = group[0].index + decoration;
            // Include an opening bracket or quote that wraps the inline block: "（1. ... 2. ...）"
            if (from > 0 && /[[（(【"“'‘「『]/.test(line[from - 1])) {
                from--;
            }
            return { type: 'partial', from };
        }
    }

    return { type: 'normal' };
}

/**
 * Removes preset action choice blocks (and their lead-in prompt lines) from a message.
 * @param {string} text Message text
 * @returns {string} Filtered text, or the original text if nothing matched
 */
export function stripPresetActions(text) {
    if (typeof text !== 'string' || text === '') {
        return text;
    }

    const lines = text.split('\n');
    const kinds = [];
    let inFence = false;
    for (const line of lines) {
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            kinds.push({ type: 'normal' });
            continue;
        }
        kinds.push(inFence ? { type: 'normal' } : classifyLine(line));
    }

    const out = [];
    let strippedAny = false;

    for (let i = 0; i < lines.length;) {
        const kind = kinds[i];

        if (kind.type === 'option') {
            // Gather the run of consecutive option lines (blank lines inside the block are allowed).
            let count = kind.count;
            let runEnd = i + 1;
            let j = i + 1;
            while (j < lines.length) {
                if (kinds[j].type === 'option') {
                    count += kinds[j].count;
                    j++;
                    runEnd = j;
                } else if (kinds[j].type === 'normal' && lines[j].trim() === '' && j + 1 < lines.length && kinds[j + 1].type === 'option') {
                    j++;
                } else {
                    break;
                }
            }

            if (count >= 2) {
                strippedAny = true;
                // Drop the lead-in prompt line that introduced the block.
                if (out.length > 0 && isLeadInLine(out[out.length - 1])) {
                    out.pop();
                }
                i = runEnd;
                // Block at the message start: swallow the blank lines before the remaining text.
                if (out.length === 0) {
                    while (i < lines.length && lines[i].trim() === '') {
                        i++;
                    }
                } else if (out[out.length - 1].trim() === '' && i < lines.length && lines[i].trim() === '') {
                    // Keep paragraph spacing single instead of stacking the blank lines from before and after the block.
                    i++;
                }
                continue;
            }
        }

        if (kind.type === 'partial') {
            strippedAny = true;
            const prefix = lines[i].slice(0, kind.from).trimEnd();
            if (prefix !== '' && !isLeadInLine(prefix)) {
                out.push(prefix);
            } else {
                // The whole line is gone. At the message start swallow the following blank
                // lines, otherwise avoid stacking the blank lines from before and after it.
                if (out.length === 0) {
                    while (i + 1 < lines.length && lines[i + 1].trim() === '') {
                        i++;
                    }
                } else if (out[out.length - 1].trim() === '' && i + 1 < lines.length && lines[i + 1].trim() === '') {
                    i++;
                }
            }
            i++;
            continue;
        }

        out.push(lines[i]);
        i++;
    }

    if (!strippedAny) {
        return text;
    }

    // Trim blank lines left over at the end of the message.
    while (out.length > 0 && out[out.length - 1].trim() === '') {
        out.pop();
    }

    return out.length > 0 ? out.join('\n') : '';
}
