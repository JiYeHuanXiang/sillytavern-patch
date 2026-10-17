import { extractCacheUsage } from '../public/scripts/cache-usage.js';

describe('extractCacheUsage', () => {
    describe('DeepSeek', () => {
        test('normalizes hit and miss tokens', () => {
            expect(extractCacheUsage({
                usage: {
                    prompt_cache_hit_tokens: 900,
                    prompt_cache_miss_tokens: 100,
                },
            })).toEqual({
                hit_tokens: 900,
                miss_tokens: 100,
                total_tokens: 1000,
                hit_rate: 90,
                source: 'deepseek',
            });
        });

        test('keeps 0% hits visible', () => {
            expect(extractCacheUsage({
                usage: {
                    prompt_cache_hit_tokens: 0,
                    prompt_cache_miss_tokens: 1000,
                },
            })).toEqual({
                hit_tokens: 0,
                miss_tokens: 1000,
                total_tokens: 1000,
                hit_rate: 0,
                source: 'deepseek',
            });
        });

        test('accepts numeric strings from proxies', () => {
            expect(extractCacheUsage({
                usage: {
                    prompt_cache_hit_tokens: '900',
                    prompt_cache_miss_tokens: '100',
                },
            })?.hit_rate).toBe(90);
        });
    });

    describe('OpenAI-compatible', () => {
        test('normalizes cached prompt tokens', () => {
            expect(extractCacheUsage({
                usage: {
                    prompt_tokens: 1000,
                    prompt_tokens_details: { cached_tokens: 250 },
                },
            })).toEqual({
                hit_tokens: 250,
                miss_tokens: 750,
                total_tokens: 1000,
                hit_rate: 25,
                source: 'openai',
            });
        });

        test('clamps cached tokens to prompt tokens', () => {
            expect(extractCacheUsage({
                usage: {
                    prompt_tokens: 1000,
                    prompt_tokens_details: { cached_tokens: 1200 },
                },
            })).toEqual({
                hit_tokens: 1000,
                miss_tokens: 0,
                total_tokens: 1000,
                hit_rate: 100,
                source: 'openai',
            });
        });
    });

    describe('Anthropic', () => {
        test('includes cache reads, cache writes and input tokens', () => {
            expect(extractCacheUsage({
                usage: {
                    input_tokens: 100,
                    cache_read_input_tokens: 300,
                    cache_creation_input_tokens: 100,
                },
            })).toEqual({
                hit_tokens: 300,
                miss_tokens: 200,
                total_tokens: 500,
                hit_rate: 60,
                source: 'anthropic',
            });
        });

        test('reads streaming message_start usage', () => {
            expect(extractCacheUsage({
                type: 'message_start',
                message: {
                    usage: {
                        input_tokens: 50,
                        cache_read_input_tokens: 150,
                        cache_creation_input_tokens: 0,
                    },
                },
            })).toEqual({
                hit_tokens: 150,
                miss_tokens: 50,
                total_tokens: 200,
                hit_rate: 75,
                source: 'anthropic',
            });
        });
    });

    describe('Gemini', () => {
        test('normalizes cached content tokens', () => {
            expect(extractCacheUsage({
                usageMetadata: {
                    promptTokenCount: 1000,
                    cachedContentTokenCount: 400,
                },
            })).toEqual({
                hit_tokens: 400,
                miss_tokens: 600,
                total_tokens: 1000,
                hit_rate: 40,
                source: 'gemini',
            });
        });
    });

    test('returns null without cache fields', () => {
        expect(extractCacheUsage({ usage: { prompt_tokens: 1000 } })).toBeNull();
        expect(extractCacheUsage({ choices: [] })).toBeNull();
        expect(extractCacheUsage(null)).toBeNull();
        expect(extractCacheUsage('not an object')).toBeNull();
    });

    test('returns null when total prompt tokens are zero', () => {
        expect(extractCacheUsage({
            usage: {
                prompt_cache_hit_tokens: 0,
                prompt_cache_miss_tokens: 0,
                prompt_tokens: 0,
            },
        })).toBeNull();
    });
});
