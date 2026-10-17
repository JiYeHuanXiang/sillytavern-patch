import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

const fetchMock = jest.fn();
const readSecretMock = jest.fn(() => 'test-key');

jest.unstable_mockModule('node-fetch', () => ({ default: fetchMock }));
jest.unstable_mockModule('../src/util.js', () => ({
    color: { blue: v => v, red: v => v, yellow: v => v },
    combineAbortSignals: (...signals) => signals[0] ?? null,
    delay: async () => undefined,
    ensureDirectory: () => undefined,
    excludeKeysByYaml: () => undefined,
    extractFilesFromZipBuffer: async () => [],
    flattenSchema: () => undefined,
    forwardFetchResponse: jest.fn(),
    generateTimestamp: () => '20260101-000000',
    getConfigValue: (_key, defaultValue) => defaultValue,
    getZipEntryList: async () => [],
    inlineLocalVideoMedia: () => undefined,
    invalidateFirefoxCache: () => undefined,
    isPathUnderParent: () => false,
    isValidUrl: value => URL.canParse(value),
    mergeObjectWithYaml: () => undefined,
    normalizeZipEntryPath: value => value,
    setPermissionsSync: () => undefined,
    trimTrailingSlash: value => value.replace(/\/+$/, ''),
    trimV1: () => undefined,
    tryParse: value => { try { return JSON.parse(value); } catch { return undefined; } },
    uuidv4: () => 'test-uuid',
}));
jest.unstable_mockModule('../src/endpoints/secrets.js', () => ({
    readSecret: readSecretMock,
    writeSecret: () => undefined,
    SECRETS_FILE: 'secrets.json',
    allowKeysExposure: false,
    SECRET_KEYS: { DEEPSEEK: 'api_key_deepseek' },
}));
jest.unstable_mockModule('../src/url-safety.js', () => ({
    assertSafeFetchUrl: jest.fn(async () => undefined),
}));

/** @type {import('../src/endpoints/backends/chat-completions.js')} */
let mod;

beforeAll(async () => {
    mod = await import('../src/endpoints/backends/chat-completions.js');
});

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [] }),
    });
});

function createRequest(overrides = {}) {
    return {
        body: {
            chat_completion_source: 'deepseek',
            model: 'deepseek-v4-pro',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 256,
            stream: false,
            temperature: 1,
            presence_penalty: 0,
            frequency_penalty: 0,
            top_p: 0.95,
            stop: [],
            include_reasoning: true,
            reasoning_effort: 'disabled',
            ...overrides,
        },
        user: { directories: {} },
        socket: {
            removeAllListeners: jest.fn(),
            on: jest.fn(),
        },
    };
}

function createResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        end: jest.fn(),
        headersSent: false,
    };
}

async function captureRequestBody(overrides) {
    await mod.sendDeepSeekRequest(createRequest(overrides), createResponse());
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/beta/chat/completions');
    return JSON.parse(options.body);
}

describe('DeepSeek thinking-mode payloads', () => {
    test('disables thinking via thinking.type without forwarding the internal disabled sentinel', async () => {
        const body = await captureRequestBody();
        expect(body.thinking).toEqual({ type: 'disabled' });
        expect(body).not.toHaveProperty('reasoning_effort');
    });

    test('forwards valid reasoning_effort values when thinking is enabled', async () => {
        const body = await captureRequestBody({ reasoning_effort: 'high' });
        expect(body.thinking).toEqual({ type: 'enabled' });
        expect(body.reasoning_effort).toBe('high');
    });

    test('omits reasoning_effort when the effort is auto', async () => {
        const body = await captureRequestBody({ reasoning_effort: undefined });
        expect(body.thinking).toEqual({ type: 'enabled' });
        expect(body).not.toHaveProperty('reasoning_effort');
    });

    test('keeps thinking disabled when reasoning output is hidden', async () => {
        const body = await captureRequestBody({ include_reasoning: false });
        expect(body.thinking).toEqual({ type: 'disabled' });
        expect(body).not.toHaveProperty('reasoning_effort');
    });
});

describe('reasoning effort normalization', () => {
    test.each([
        // Sources that forward reasoning_effort verbatim cannot express the
        // internal sentinel; they keep the established "disabled ≈ low" fallback.
        ['opencodego', undefined, 'low'],
        ['nanogpt', undefined, 'low'],
        ['chutes', undefined, 'low'],
        ['concentrate', undefined, 'low'],
        ['infersia', undefined, 'low'],
        ['electronhub', undefined, 'low'],
        ['aimlapi', undefined, 'low'],
        ['perplexity', undefined, 'low'],
        ['pollinations', undefined, 'low'],
        ['openai', undefined, 'low'],
        ['xai', undefined, 'low'],
        ['custom', 'auto', 'low'],
        ['custom', 'disable_unsupported', 'low'],
        // Sources that translate the sentinel into a real thinking toggle/budget.
        ['deepseek', undefined, 'disabled'],
        ['siliconflow', undefined, 'disabled'],
        ['moonshot', undefined, 'disabled'],
        ['zai', undefined, 'disabled'],
        ['claude', undefined, 'disabled'],
        ['makersuite', undefined, 'disabled'],
        ['vertexai', undefined, 'disabled'],
        ['custom', 'disable_deepseek', 'disabled'],
        ['custom', 'disable_qwen', 'disabled'],
    ])('%s with customThinkingMode=%s keeps disabled as %s', (source, customThinkingMode, expected) => {
        expect(mod.normalizeReasoningEffort({
            source,
            reasoningEffort: 'disabled',
            customThinkingMode,
        })).toBe(expected);
    });

    test('passes other effort values through unchanged', () => {
        expect(mod.normalizeReasoningEffort({ source: 'opencodego', reasoningEffort: 'low' })).toBe('low');
        expect(mod.normalizeReasoningEffort({ source: 'opencodego', reasoningEffort: 'auto' })).toBe('auto');
        expect(mod.normalizeReasoningEffort({ source: 'opencodego', reasoningEffort: undefined })).toBeUndefined();
    });
});
