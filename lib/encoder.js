import { base64ToBytes, getCapacity } from './utils.js';

const PREFIX_B64 = "AAEAAAD/////AQAAAAAAAAAMAgAAAEZBc3NlbWJseS1DU2hhcnAsIFZlcnNpb249MC4wLjAuMCwgQ3VsdHVyZT1uZXV0cmFsLCBQdWJsaWNLZXlUb2tlbj1udWxsBQEAAAAIU2F2ZURhdGEBAAAABXRpbGVzA3VTeXN0ZW0uQ29sbGVjdGlvbnMuR2VuZXJpYy5MaXN0YDFbW1RpbGVEYXRhLCBBc3NlbWJseS1DU2hhcnAsIFZlcnNpb249MC4wLjAuMCwgQ3VsdHVyZT1uZXV0cmFsLCBQdWJsaWNLZXlUb2tlbj1udWxsXV0CAAAACQMAAAAEAwAAAHVTeXN0ZW0uQ29sbGVjdGlvbnMuR2VuZXJpYy5MaXN0YDFbW1RpbGVEYXRhLCBBc3NlbWJseS1DU2hhcnAsIFZlcnNpb249MC4wLjAuMCwgQ3VsdHVyZT1uZXV0cmFsLCBQdWJsaWNLZXlUb2tlbj1udWxsXV0DAAAABl9pdGVtcwVfc2l6ZQhfdmVyc2lvbgQAAApUaWxlRGF0YVtdAgAAAAgICQQAAAA=";

/**
 * Encodes a list of blocks into a .fun binary file.
 * @param {Array} blocks 
 * @returns {Uint8Array}
 */
export function encodeMap(blocks) {
    // Prevent engine crash if empty
    if (!blocks || blocks.length === 0) {
        blocks = [{ id: 25, position: { x: 0, y: 0 }, scale: { x: 2, y: 2 }, rotation: 0 }];
    }

    const n = blocks.length;
    const prefix = base64ToBytes(PREFIX_B64);
    const capacity = getCapacity(n);

    // Initial estimate for buffer size, will grow as needed
    const buffer = new ArrayBuffer(prefix.length + 1024 + n * 100);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    
    let offset = 0;
    
    // Copy prefix
    bytes.set(prefix, 0);
    offset = prefix.length;

    // _size (Int32)
    view.setInt32(offset, n, true);
    offset += 4;

    // _version (Int32) - n + 3 like in Python
    view.setInt32(offset, n + 3, true);
    offset += 4;

    // Array Record
    bytes.set([0x07, 0x04, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00], offset);
    offset += 10;

    // Capacity (Int32)
    view.setInt32(offset, capacity, true);
    offset += 4;

    // "TileData" type header
    const typeHeader = [0x04, 0x08, ...Array.from("TileData").map(c => c.charCodeAt(0)), 0x02, 0x00, 0x00, 0x00];
    bytes.set(typeHeader, offset);
    offset += typeHeader.length;

    // Object References (starts from ID 5)
    for (let i = 0; i < n; i++) {
        bytes[offset++] = 0x09;
        view.setInt32(offset, 5 + i, true);
        offset += 4;
    }

    // Capacity padding (Null records)
    const nullCount = capacity - n;
    if (nullCount === 1) {
        bytes[offset++] = 0x0a;
    } else if (nullCount > 1) {
        if (nullCount <= 255) {
            bytes[offset++] = 0x0d;
            bytes[offset++] = nullCount;
        } else {
            bytes[offset++] = 0x0e;
            view.setInt32(offset, nullCount, true);
            offset += 4;
        }
    }

    const vectorsToWrite = [];
    let vectorIdCounter = 5 + n;

    // Blocks
    for (let i = 0; i < n; i++) {
        const b = blocks[i];
        const sVid = vectorIdCounter++;
        const pVid = vectorIdCounter++;
        
        vectorsToWrite.push({ id: sVid, x: b.scale.x, y: b.scale.y });
        vectorsToWrite.push({ id: pVid, x: b.position.x, y: b.position.y });

        if (i === 0) {
            // Full Class header (Record 05)
            const classDef = [
                0x05, 0x05, 0x00, 0x00, 0x00, 
                0x08, ...Array.from("TileData").map(c => c.charCodeAt(0)), 
                0x04, 0x00, 0x00, 0x00,
                0x02, 0x69, 0x64, // "id"
                0x05, 0x73, 0x63, 0x61, 0x6c, 0x65, // "scale"
                0x08, 0x70, 0x6f, 0x73, 0x69, 0x74, 0x69, 0x6f, 0x6e, // "position"
                0x08, 0x72, 0x6f, 0x74, 0x61, 0x74, 0x69, 0x6f, 0x6e, // "rotation"
                0x00, 0x07, 0x07, 0x00, 0x08, 0x0b, 0x0b, 0x0b, 
                0x02, 0x00, 0x00, 0x00
            ];
            bytes.set(classDef, offset);
            offset += classDef.length;
        } else {
            // Class ID reference (Record 01)
            bytes[offset++] = 0x01;
            view.setInt32(offset, 5 + i, true);
            offset += 4;
            view.setInt32(offset, 5, true); // base id 5 reference
            offset += 4;
        }

        // Data: id, scaleRef, positionRef, rotation
        view.setInt32(offset, b.id, true);
        offset += 4;
        
        bytes[offset++] = 0x09;
        view.setInt32(offset, sVid, true);
        offset += 4;
        
        bytes[offset++] = 0x09;
        view.setInt32(offset, pVid, true);
        offset += 4;
        
        view.setFloat32(offset, b.rotation, true);
        offset += 4;
    }

    // Vectors (ArraySinglePrimitive record 0F)
    for (const v of vectorsToWrite) {
        bytes[offset++] = 0x0f;
        view.setInt32(offset, v.id, true);
        offset += 4;
        bytes.set([0x02, 0x00, 0x00, 0x00, 0x0b], offset);
        offset += 5;
        view.setFloat32(offset, v.x, true);
        offset += 4;
        view.setFloat32(offset, v.y, true);
        offset += 4;
    }

    // MessageEnd
    bytes[offset++] = 0x0b;

    return bytes.slice(0, offset);
}
