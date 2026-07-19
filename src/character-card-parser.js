import fs from 'node:fs';
import { Buffer } from 'node:buffer';

import encode from './png/encode.js';
import extract from 'png-chunks-extract';
import PNGtext from 'png-chunk-text';
import { crc32 } from 'crc';

/**
 * PNG chunk structure: [4-byte length][4-byte type][N-byte data][4-byte CRC]
 * Total overhead per chunk = 12 bytes.
 */

/**
 * Decodes the keyword from a tEXt chunk data buffer.
 * tEXt chunk data format: [keyword]\0[text]
 * @param {Buffer} chunkData
 * @returns {string} keyword
 */
function decodeTextKeyword(chunkData) {
    const nullIndex = chunkData.indexOf(0);
    if (nullIndex === -1) return '';
    return chunkData.subarray(0, nullIndex).toString('latin1');
}

/**
 * Builds a complete PNG chunk buffer from a type and data.
 * @param {string} type 4-character chunk type
 * @param {Uint8Array|Buffer} data chunk data (from PNGtext.encode)
 * @returns {Buffer} Complete chunk: [length][type][data][crc]
 */
function buildChunk(type, data) {
    const typeBytes = Buffer.from(type, 'latin1');
    const dataBuf = Buffer.from(data);
    const chunk = Buffer.alloc(12 + dataBuf.length);
    // Write length (big-endian)
    chunk.writeUInt32BE(dataBuf.length, 0);
    // Write type
    typeBytes.copy(chunk, 4);
    // Write data
    dataBuf.copy(chunk, 8);
    // CRC covers type + data — compute incrementally to avoid Buffer.concat
    let crcVal = crc32(typeBytes);
    crcVal = crc32(dataBuf, crcVal);
    chunk.writeUInt32BE(crcVal >>> 0, 8 + dataBuf.length);
    return chunk;
}

/**
 * Writes Character metadata to a PNG image buffer using chunk-level replacement.
 *
 * Instead of the full extract→modify→encode cycle (which copies all IDAT data),
 * this function scans the PNG buffer once to locate chara/ccv3 tEXt chunks,
 * removes them by splicing the buffer, then inserts new chunks before IEND.
 * All non-tEXt chunks (IHDR, IDAT, etc.) are never decoded or copied individually,
 * making this O(chunks) instead of O(image size).
 *
 * Falls back to the classic extract+encode path if the buffer structure is unexpected.
 *
 * @param {Buffer} image PNG image buffer
 * @param {string} data Character data to write
 * @returns {Buffer} New PNG image buffer with updated metadata
 */
export const writeInPlace = (image, data) => {
    // Validate PNG signature
    if (
        image.length < 8 ||
        image[0] !== 0x89 || image[1] !== 0x50 ||
        image[2] !== 0x4E || image[3] !== 0x47 ||
        image[4] !== 0x0D || image[5] !== 0x0A ||
        image[6] !== 0x1A || image[7] !== 0x0A
    ) {
        // Not a valid PNG, fall back to classic path
        return write(image, data);
    }

    try {
        /** @type {{start: number, end: number}[]} Ranges of chara/ccv3 tEXt chunks to remove */
        const removals = [];
        let iendStart = -1;
        let iendEnd = -1;
        let offset = 8; // skip PNG signature

        while (offset < image.length) {
            if (offset + 8 > image.length) break;

            const chunkLength = image.readUInt32BE(offset);
            const chunkType = image.subarray(offset + 4, offset + 8).toString('latin1');

            // chunk total = 4(length) + 4(type) + dataLength + 4(crc)
            const chunkEnd = offset + 12 + chunkLength;
            if (chunkEnd > image.length) break;

            if (chunkType === 'IEND') {
                iendStart = offset;
                iendEnd = chunkEnd;
                break;
            }

            if (chunkType === 'tEXt') {
                const chunkData = image.subarray(offset + 8, offset + 8 + chunkLength);
                const keyword = decodeTextKeyword(chunkData);
                const kwLower = keyword.toLowerCase();
                if (kwLower === 'chara' || kwLower === 'ccv3') {
                    removals.push({ start: offset, end: chunkEnd });
                }
            }

            offset = chunkEnd;
        }

        // If we couldn't find IEND, fall back to the classic path
        if (iendStart === -1) {
            return write(image, data);
        }

        // Build new chunks to insert before IEND
        const charaChunk = buildChunk('tEXt', PNGtext.encode('chara', Buffer.from(data, 'utf8').toString('base64')).data);

        let ccv3Chunk = null;
        try {
            const v3Data = JSON.parse(data);
            v3Data.spec = 'chara_card_v3';
            v3Data.spec_version = '3.0';
            const v3Base64 = Buffer.from(JSON.stringify(v3Data), 'utf8').toString('base64');
            ccv3Chunk = buildChunk('tEXt', PNGtext.encode('ccv3', v3Base64).data);
        } catch {
            // Ignore errors when adding v3 chunk
        }

        const newChunks = ccv3Chunk ? Buffer.concat([charaChunk, ccv3Chunk]) : charaChunk;

        // Calculate final size: original minus removals plus new chunks
        const removedBytes = removals.reduce((sum, r) => sum + (r.end - r.start), 0);
        const finalSize = image.length - removedBytes + newChunks.length;

        // Assemble the output buffer
        const output = Buffer.alloc(finalSize);
        let writeOffset = 0;

        // Track which bytes to skip (the removals)
        let readOffset = 0;
        for (const removal of removals) {
            // Copy everything before this removal
            if (removal.start > readOffset) {
                image.copy(output, writeOffset, readOffset, removal.start);
                writeOffset += removal.start - readOffset;
            }
            readOffset = removal.end; // skip the removed chunk
        }

        // Copy everything between last removal and IEND
        if (iendStart > readOffset) {
            image.copy(output, writeOffset, readOffset, iendStart);
            writeOffset += iendStart - readOffset;
        }

        // Insert new chunks
        newChunks.copy(output, writeOffset);
        writeOffset += newChunks.length;

        // Copy IEND
        image.copy(output, writeOffset, iendStart, iendEnd);

        return output;
    } catch (error) {
        // Any unexpected structure, fall back to the safe classic path
        return write(image, data);
    }
};

/**
 * Writes Character metadata to a PNG image buffer.
 * Writes only 'chara', 'ccv3' is not supported and removed not to create a mismatch.
 * @param {Buffer} image PNG image buffer
 * @param {string} data Character data to write
 * @returns {Buffer} PNG image buffer with metadata
 */
export const write = (image, data) => {
    const chunks = extract(new Uint8Array(image));
    const tEXtChunks = chunks.filter(chunk => chunk.name === 'tEXt');

    // Remove existing tEXt chunks
    for (const tEXtChunk of tEXtChunks) {
        const data = PNGtext.decode(tEXtChunk.data);
        if (data.keyword.toLowerCase() === 'chara' || data.keyword.toLowerCase() === 'ccv3') {
            chunks.splice(chunks.indexOf(tEXtChunk), 1);
        }
    }

    // Add new v2 chunk before the IEND chunk
    const base64EncodedData = Buffer.from(data, 'utf8').toString('base64');
    chunks.splice(-1, 0, PNGtext.encode('chara', base64EncodedData));

    // Try adding v3 chunk before the IEND chunk
    try {
        //change v2 format to v3
        const v3Data = JSON.parse(data);
        v3Data.spec = 'chara_card_v3';
        v3Data.spec_version = '3.0';

        const base64EncodedData = Buffer.from(JSON.stringify(v3Data), 'utf8').toString('base64');
        chunks.splice(-1, 0, PNGtext.encode('ccv3', base64EncodedData));
    } catch (error) {
        // Ignore errors when adding v3 chunk
    }

    const newBuffer = Buffer.from(encode(chunks));
    return newBuffer;
};

/**
 * Reads Character metadata from a PNG image buffer.
 * Supports both V2 (chara) and V3 (ccv3). V3 (ccv3) takes precedence.
 *
 * Uses a fast chunk-level scan that skips IDAT data (no CRC verification,
 * no per-chunk allocation) with fallback to the full extract on error.
 * @param {Buffer} image PNG image buffer
 * @returns {string} Character data
 */
export const read = (image) => {
    // Fast path: scan chunks without full extraction
    try {
        if (
            image.length >= 8 &&
            image[0] === 0x89 && image[1] === 0x50 &&
            image[2] === 0x4E && image[3] === 0x47
        ) {
            let foundChara = null;
            let foundCcv3 = null;
            let offset = 8;

            while (offset < image.length) {
                if (offset + 8 > image.length) break;
                const chunkLength = image.readUInt32BE(offset);
                const chunkType = image.toString('latin1', offset + 4, offset + 8);
                const chunkEnd = offset + 12 + chunkLength;
                if (chunkEnd > image.length) break;

                if (chunkType === 'tEXt') {
                    const chunkData = image.subarray(offset + 8, offset + 8 + chunkLength);
                    const nullIndex = chunkData.indexOf(0);
                    if (nullIndex !== -1) {
                        const keyword = chunkData.toString('latin1', 0, nullIndex).toLowerCase();
                        // Text after null separator is the value (latin1 is safe for base64 chars)
                        const text = chunkData.toString('latin1', nullIndex + 1);
                        if (keyword === 'ccv3') foundCcv3 = text;
                        else if (keyword === 'chara') foundChara = text;
                    }
                }

                if (chunkType === 'IEND') break;
                offset = chunkEnd;
            }

            if (foundCcv3 !== null) {
                return Buffer.from(foundCcv3, 'base64').toString('utf8');
            }
            if (foundChara !== null) {
                return Buffer.from(foundChara, 'base64').toString('utf8');
            }
        }
    } catch {
        // Fall through to classic path
    }

    // Classic fallback: full extract + decode
    const chunks = extract(new Uint8Array(image));

    const textChunks = chunks.filter((chunk) => chunk.name === 'tEXt').map((chunk) => PNGtext.decode(chunk.data));

    if (textChunks.length === 0) {
        console.error('PNG metadata does not contain any text chunks.');
        throw new Error('No PNG metadata.');
    }

    const ccv3Index = textChunks.findIndex((chunk) => chunk.keyword.toLowerCase() === 'ccv3');

    if (ccv3Index > -1) {
        return Buffer.from(textChunks[ccv3Index].text, 'base64').toString('utf8');
    }

    const charaIndex = textChunks.findIndex((chunk) => chunk.keyword.toLowerCase() === 'chara');

    if (charaIndex > -1) {
        return Buffer.from(textChunks[charaIndex].text, 'base64').toString('utf8');
    }

    console.error('PNG metadata does not contain any character data.');
    throw new Error('No PNG metadata.');
};

/**
 * Parses a card image and returns the character metadata.
 * @param {string} cardUrl Path to the card image
 * @param {string} format File format
 * @returns {Promise<string>} Character data
 */
export const parse = async (cardUrl, format) => {
    let fileFormat = format === undefined ? 'png' : format;

    switch (fileFormat) {
        case 'png': {
            const buffer = fs.readFileSync(cardUrl);
            return read(buffer);
        }
    }

    throw new Error('Unsupported format');
};

