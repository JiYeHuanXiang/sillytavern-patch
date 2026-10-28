import { describe, test, expect } from '@jest/globals';
import { stripInstructTurnSequences } from '../public/scripts/instruct-turn.js';

describe('stripInstructTurnSequences', () => {
    const outputSequence = '<|turn>model';

    test('removes a leaked sequence during normal generation', () => {
        const text = `Hello${outputSequence} world`;
        expect(stripInstructTurnSequences(text, [outputSequence])).toBe('Hello world');
    });

    test('drops text after a turn boundary when continuing', () => {
        const text = 'remainder of the user turn\n<|turn>model\n*The character replies.*';
        expect(stripInstructTurnSequences(text, [outputSequence], { continueMode: true }))
            .toBe('remainder of the user turn\n');
    });

    test('removes a leading sequence and keeps the actual content', () => {
        const text = '<|turn>model\n*The character replies.*';
        expect(stripInstructTurnSequences(text, [outputSequence], { continueMode: true }))
            .toBe('\n*The character replies.*');
    });

    test('removes multiple leading sequences before truncating', () => {
        const text = '<|turn>model\n<|turn>model\n*The character replies.*';
        expect(stripInstructTurnSequences(text, [outputSequence], { continueMode: true }))
            .toBe('\n\n*The character replies.*');
    });

    test('keeps the original text when no sequence is present', () => {
        expect(stripInstructTurnSequences('plain text', [outputSequence], { continueMode: true })).toBe('plain text');
    });
});
