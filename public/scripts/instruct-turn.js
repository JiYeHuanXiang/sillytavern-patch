/**
 * Removes instruct turn sequences that leaked into generated text.
 *
 * In normal generation the sequence is a leak and is removed wherever it
 * appears. In Continue mode a sequence that follows real content marks the end
 * of the continued turn, so the text after it belongs to the next speaker and
 * must be dropped instead of merged into this message.
 * @param {string} message Generated message text
 * @param {string[]} sequences Turn sequences to look for
 * @param {{continueMode?: boolean}} [options] Options
 * @returns {string} Cleaned message text
 */
export function stripInstructTurnSequences(message, sequences, { continueMode = false } = {}) {
    let result = String(message ?? '');

    for (const sequence of sequences) {
        if (!sequence) {
            continue;
        }

        if (!continueMode) {
            result = result.replaceAll(sequence, '');
            continue;
        }

        let searchFrom = 0;
        while (true) {
            const index = result.indexOf(sequence, searchFrom);
            if (index === -1) {
                break;
            }

            if (result.substring(0, index).trim() === '') {
                // Leading leak (possibly after whitespace): drop the marker and
                // keep looking for a real turn boundary.
                result = result.substring(0, index) + result.substring(index + sequence.length);
                searchFrom = index;
            } else {
                result = result.substring(0, index);
                break;
            }
        }
    }

    return result;
}
