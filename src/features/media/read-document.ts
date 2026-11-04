import { mediaKindFromMime } from './media-model.ts';

export const MAX_DOCUMENT_BYTES = 25_000_000;
/** Read bytes without account credentials. HTML/login responses are never rendered as documents. */
export async function readDocument(response: Response): Promise<{ kind: 'pdf' | 'image'; bytes: Uint8Array }> {
  if (!response.ok) throw new Error('media.error');
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_DOCUMENT_BYTES) { await response.body?.cancel(); throw new Error('media.error'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('media.error');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > MAX_DOCUMENT_BYTES) { await reader.cancel(); throw new Error('media.error'); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (bytes.length > 5 && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70 && bytes[4] === 45) return { kind: 'pdf', bytes };
  if (bytes.length && mediaKindFromMime(response.headers.get('content-type')) === 'image') return { kind: 'image', bytes };
  throw new Error('media.unsupported');
}
