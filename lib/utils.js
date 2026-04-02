/**
 * SDSMap Web Converter Utilities
 */

/**
 * Decodes a Base64 string into a Uint8Array.
 * @param {string} base64 
 * @returns {Uint8Array}
 */
export function base64ToBytes(base64) {
    const binString = atob(base64);
    const bytes = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Triggers a browser download of a Uint8Array.
 * @param {Uint8Array} bytes 
 * @param {string} filename 
 */
export function downloadBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Simulates C# List<T>.Capacity growth logic for bit-perfect serialization.
 */
export function getCapacity(n) {
    if (n === 0) return 0;
    let cap = 4;
    while (cap < n) {
        cap *= 2;
    }
    return cap;
}
