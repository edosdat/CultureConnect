/**
 * One still image on a feedback note.
 * User-facing cap is 5 Mo. The browser re-encodes below
 * `FEEDBACK_IMAGE_UPLOAD_MAX_BYTES` so the POST stays under the platform
 * body limit (~4.5 Mo) and GPS/EXIF never reaches Neon.
 * Stored bytes are JPEG only. No video, no OCR, no push.
 */

export const FEEDBACK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Client upload target. Leaves room for the multipart envelope. */
export const FEEDBACK_IMAGE_UPLOAD_MAX_BYTES = 3_500_000;

export const ATTACH_LABEL = 'Joindre une capture';
export const CAPTURE_LABEL = 'Capture';
export const REMOVE_CAPTURE_LABEL = 'Retirer la capture';
export const IMAGE_TOO_HEAVY = 'Image trop lourde (max 5 Mo)';
export const IMAGE_SEND_FAIL = 'Impossible d’envoyer l’image — réessaie';
export const IMAGE_PERMISSION = 'Tu peux autoriser dans Réglages';

export type PreparedFeedbackImage = {
  mime: 'image/jpeg';
  bytes: Uint8Array;
};

export type FeedbackImageError = { error: 'size' | 'type' };

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const chunk of chunks) n += chunk.length;
  const out = new Uint8Array(n);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Drop EXIF, XMP, ICC and comments. Keeps the compressed image data. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const chunks: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) break;
    const marker = bytes[i]!;
    i += 1;
    if (marker === 0xd9) {
      chunks.push(Uint8Array.of(0xff, 0xd9));
      break;
    }
    if (marker === 0xda) {
      chunks.push(Uint8Array.of(0xff, 0xda));
      chunks.push(bytes.subarray(i));
      break;
    }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(Uint8Array.of(0xff, marker));
      continue;
    }
    if (i + 1 >= bytes.length) return null;
    const len = (bytes[i]! << 8) | bytes[i + 1]!;
    if (len < 2 || i + len > bytes.length) return null;
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) chunks.push(bytes.subarray(i - 2, i + len));
    i += len;
  }
  const out = concatBytes(chunks);
  if (out.length < 4 || out[0] !== 0xff || out[1] !== 0xd8) return null;
  return out;
}

export function sniffJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Accept a JPEG under 5 Mo and return a copy without EXIF.
 * PNG, WebP, GIF, HEIC, SVG, PDF and video fail closed (`type`).
 */
export function prepareFeedbackImage(bytes: Uint8Array): PreparedFeedbackImage | FeedbackImageError {
  if (bytes.byteLength > FEEDBACK_IMAGE_MAX_BYTES) return { error: 'size' };
  if (!sniffJpeg(bytes)) return { error: 'type' };
  const stripped = stripJpegMetadata(bytes);
  if (!stripped || stripped.byteLength > FEEDBACK_IMAGE_MAX_BYTES) return { error: 'type' };
  if (!sniffJpeg(stripped)) return { error: 'type' };
  return { mime: 'image/jpeg', bytes: stripped };
}

export function feedbackImageErrorCopy(kind: 'size' | 'type'): string {
  return kind === 'size' ? IMAGE_TOO_HEAVY : IMAGE_SEND_FAIL;
}
