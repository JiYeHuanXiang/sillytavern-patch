/**
 * Model icon resolution for chat message / connection profile badges.
 *
 * Resolution order:
 *   1. MODEL_ICON_MAP prefixes (longest match first)
 *   2. sanitized model name (vendor prefix stripped, lowercased)
 *   3. known model-family brand icon
 *   4. provider fallback
 *
 * Model IDs from aggregators and custom endpoints often carry a vendor prefix
 * (`zai-org/GLM-4.6`, `deepseek-ai/DeepSeek-V3`). The prefix is stripped before
 * matching so those models resolve to their brand icon instead of falling
 * through to the generic Custom icon (which is a question mark).
 */

/**
 * Maps model name prefixes to icon file basenames in /img/.
 * Keys are matched as case-insensitive prefixes against the normalized model name.
 * @type {Record<string, string>}
 */
const MODEL_ICON_MAP = {
    'glm-5.3': 'glm-5.3',
    'glm-5.2': 'glm-5.2',
    'glm-5.1': 'glm-5.1',
    'glm-5-turbo': 'glm-5-turbo',
    'glm-5v-turbo': 'glm-5v-turbo',
    'glm-5': 'glm-5',
    'glm-4.7': 'glm-4.7',
    'glm-4.6': 'glm-4.6',
    'glm-4.5': 'glm-4.5',
    'glm-4': 'glm-4',
    'claude-opus': 'claude-opus',
    'claude-sonnet': 'claude-sonnet',
    'claude-haiku': 'claude-haiku',
    'claude-fable': 'claude-fable',
    'claude-3': 'claude-3',
    'gpt-5.6': 'gpt-5.6',
    'gpt-5.5': 'gpt-5.5',
    'gpt-5.4': 'gpt-5.4',
    'gpt-5.3': 'gpt-5.3',
    'gpt-5.2': 'gpt-5.2',
    'gpt-5': 'gpt-5',
    'gpt-4o': 'gpt-4o',
    'gpt-4': 'gpt-4',
    'gpt-3': 'gpt-3',
    'o1': 'o1',
    'o3': 'o3',
    'o4': 'o4',
    'deepseek-v4': 'deepseek-v4',
    'deepseek-v3': 'deepseek-v3',
    'deepseek-r1': 'deepseek-r1',
    'deepseek-chat': 'deepseek-chat',
    'deepseek': 'deepseek',
    'MiniMax-M3': 'minimax-m3',
    'MiniMax-M2': 'minimax-m2',
    'M2-her': 'minimax-her',
    'grok-4': 'grok-4',
    'grok-3': 'grok-3',
    'grok-2': 'grok-2',
    'mistral-large': 'mistral-large',
    'mistral-medium': 'mistral-medium',
    'mistral-small': 'mistral-small',
    'gemini-3': 'gemini-3',
    'gemini-2.5': 'gemini-2.5',
    'gemini-2.0': 'gemini-2.0',
    'gemini': 'gemini',
    'gemma-4': 'gemma-4',
    'kimi-k2': 'kimi-k2',
    'kimi': 'kimi',
};

/**
 * Model-family prefixes that reuse an existing provider icon in /img/ when no
 * model-specific icon file is available.
 * @type {Array<[RegExp, string]>}
 */
const BRAND_ICON_FALLBACKS = [
    [/^(?:glm|zhipu|chatglm)/, 'zai'],
    [/^claude/, 'claude'],
    [/^(?:gpt|o1|o3|o4|chatgpt)/, 'openai'],
    [/^(?:gemini|gemma)/, 'makersuite'],
    [/^grok/, 'xai'],
    [/^(?:kimi|moonshot)/, 'moonshot'],
    [/^mistral/, 'mistralai'],
    [/^deepseek/, 'deepseek'],
    [/^minimax/, 'minimax'],
];

/**
 * Resolves the ordered list of candidate icon paths for a given API/model pair.
 * Priority: (1) MODEL_ICON_MAP prefix match, (2) sanitized model name,
 * (3) brand icon for the model family, (4) provider fallback.
 * Model-specific candidates yield a .png then .svg attempt; brand and provider
 * fallbacks are .svg only. Duplicate paths are removed while preserving order.
 * @param {string} apiName API identifier (provider, e.g. 'custom', 'zai', 'claude')
 * @param {string} modelName Model name (e.g. 'zai-org/GLM-4.6')
 * @returns {string[]} Ordered candidate paths, last is always the provider fallback
 */
export function resolveIconCandidates(apiName, modelName) {
    const candidates = [];
    const provider = String(apiName || '').toLowerCase();
    const model = String(modelName || '')
        .replace(/^[^/]+\//, '')      // strip 'vendor/' prefix
        .toLowerCase();

    // (1) Mapping table — longest-prefix-first so 'glm-5.3' beats 'glm-5'
    const mapKeys = Object.keys(MODEL_ICON_MAP)
        .filter(key => model.startsWith(key.toLowerCase()))
        .sort((a, b) => b.length - a.length);

    for (const key of mapKeys) {
        const base = MODEL_ICON_MAP[key];
        candidates.push(`/img/${base}.png`, `/img/${base}.svg`);
    }

    // (2) Sanitized model name, for user-supplied exact model icons
    if (model) {
        const sanitized = model
            .replace(/[^a-z0-9._-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');
        if (sanitized) {
            candidates.push(`/img/${sanitized}.png`, `/img/${sanitized}.svg`);
        }
    }

    // (3) Brand fallback for known model families
    const brand = BRAND_ICON_FALLBACKS.find(([pattern]) => pattern.test(model));
    if (brand) {
        candidates.push(`/img/${brand[1]}.svg`);
    }

    // (4) Provider fallback (always last, always svg)
    if (provider) {
        candidates.push(`/img/${provider}.svg`);
    }

    return [...new Set(candidates)];
}
