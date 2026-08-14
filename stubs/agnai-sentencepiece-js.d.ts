/**
 * Minimal ambient type declarations for @agnai/sentencepiece-js.
 *
 * The package ships no TypeScript types, and its minified dist file produces
 * thousands of errors when type-checked. CI (tsconfig.ci.json) redirects
 * imports of this module here via the `paths` compiler option so that
 * src/endpoints/tokenizers.js stays checked with accurate types.
 */
declare module '@agnai/sentencepiece-js' {
    export class SentencePieceProcessor {
        constructor();

        /** Loads a tokenizer model from a local file path or a buffer. */
        load(model: string | Uint8Array | ArrayBuffer): Promise<void>;

        /** Encodes text into token IDs. */
        encodeIds(text: string): number[];

        /** Encodes text into token pieces. */
        encodePieces(text: string): string[];

        /** Decodes token IDs back into text. */
        decodeIds(ids: number[]): Promise<string>;
    }

    /** Removes extra whitespace from text before tokenization. */
    export function cleanText(text: string): string;
}
