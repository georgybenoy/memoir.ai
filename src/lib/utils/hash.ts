/**
 * SHA-256 content hashing utilities using the Web Crypto API.
 * Compatible with modern browsers, Web Workers, and Node.js 18+.
 */

export async function computeSha256(
  data: string | ArrayBuffer | Uint8Array,
): Promise<string> {
  let buffer: Uint8Array;
  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    buffer = data;
  } else {
    buffer = new Uint8Array(data);
  }

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer as unknown as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback for Node environments without globalThis.crypto.subtle
  try {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(buffer).digest('hex');
  } catch (err) {
    throw new Error('No cryptographic implementation available for SHA-256: ' + String(err));
  }
}

/**
 * Fast synchronous string hashing (djb2) suitable for in-memory cache keys.
 */
export function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16);
}

