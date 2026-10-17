import { resolveIconCandidates } from '../public/scripts/model-icons.js';

describe('resolveIconCandidates', () => {
    test('resolves vendor-prefixed GLM models to the Z.ai brand icon before the Custom fallback', () => {
        const candidates = resolveIconCandidates('custom', 'zai-org/GLM-4.6');
        expect(candidates).toContain('/img/zai.svg');
        expect(candidates.indexOf('/img/zai.svg')).toBeLessThan(candidates.indexOf('/img/custom.svg'));
        expect(resolveIconCandidates('custom', 'zai-org/GLM-5.3-Flash')).toContain('/img/zai.svg');
    });

    test('resolves THUDM GLM models without a recognized model icon file', () => {
        const candidates = resolveIconCandidates('custom', 'THUDM/glm-4-9b-chat');
        expect(candidates).toContain('/img/zai.svg');
        expect(candidates.at(-1)).toBe('/img/custom.svg');
    });

    test('falls back to the provider icon for unknown models', () => {
        const candidates = resolveIconCandidates('custom', 'some-org/unknown-model');
        expect(candidates.at(-1)).toBe('/img/custom.svg');
        expect(candidates).not.toContain('/img/zai.svg');
    });

    test.each([
        ['deepseek-ai/DeepSeek-V3', '/img/deepseek.svg'],
        ['claude-sonnet-5', '/img/claude.svg'],
        ['gpt-5.4-mini', '/img/openai.svg'],
        ['gemini-3.7-pro', '/img/makersuite.svg'],
        ['grok-4.7', '/img/xai.svg'],
        ['moonshotai/Kimi-K2', '/img/moonshot.svg'],
        ['MiniMax-M3', '/img/minimax.svg'],
    ])('maps %s to the %s brand icon', (model, icon) => {
        expect(resolveIconCandidates('custom', model)).toContain(icon);
    });

    test('deduplicates candidate paths', () => {
        const candidates = resolveIconCandidates('zai', 'glm-4.6');
        expect(new Set(candidates).size).toBe(candidates.length);
    });

    test('is case-insensitive for provider and model names', () => {
        const candidates = resolveIconCandidates('CUSTOM', 'ZAI-ORG/GLM-4.6');
        expect(candidates).toContain('/img/zai.svg');
        expect(candidates).toContain('/img/custom.svg');
    });

    test('works without a provider name', () => {
        const candidates = resolveIconCandidates('', 'zai-org/GLM-4.6');
        expect(candidates.at(-1)).toBe('/img/zai.svg');
    });
});
