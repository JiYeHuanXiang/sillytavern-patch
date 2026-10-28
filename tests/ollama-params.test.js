import { describe, test, expect } from '@jest/globals';
import { OLLAMA_KEYS } from '../src/constants.js';

describe('Ollama text completion parameters', () => {
    test('does not forward typical sampling parameters', () => {
        expect(OLLAMA_KEYS).not.toContain('typical_p');
        expect(OLLAMA_KEYS).not.toContain('typical');
    });

    test('keeps the supported sampling parameters', () => {
        expect(OLLAMA_KEYS).toEqual(expect.arrayContaining([
            'temperature',
            'top_k',
            'top_p',
            'min_p',
            'seed',
        ]));
    });
});
