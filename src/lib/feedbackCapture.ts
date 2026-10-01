/**
 * Browser-only: turn one user-picked file into a JPEG.
 * The picker is `<input type="file" accept="image/*">`. No programmatic screen grab.
 */
import {
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_SEND_FAIL,
  IMAGE_TOO_HEAVY,
} from '@/lib/feedbackImage';

const BLOCKED_TYPES = new Set(['image/svg+xml']);

function refusedMime(type: string): boolean {
  const t = type.toLowerCase();
  if (!t) return false;
  if (BLOCKED_TYPES.has(t)) return true;
  if (t.startsWith('image/')) return false;
  return true;
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

/** One still JPEG, under the upload cap. Originals over 5 Mo are refused first. */
export async function compressFeedbackCapture(file: File): Promise<{ blob: Blob } | { error: string }> {
  if (file.size > FEEDBACK_IMAGE_MAX_BYTES) return { error: IMAGE_TOO_HEAVY };
  if (file.size < 1 || refusedMime(file.type)) return { error: IMAGE_SEND_FAIL };
  if (typeof createImageBitmap !== 'function') return { error: IMAGE_SEND_FAIL };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { error: IMAGE_SEND_FAIL };
  }

  try {
    if (bitmap.width < 1 || bitmap.height < 1) return { error: IMAGE_SEND_FAIL };
    let scale = 1;
    const edge = Math.max(bitmap.width, bitmap.height);
    if (edge > 1920) scale = 1920 / edge;
    let quality = 0.82;
    let last: Blob | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { error: IMAGE_SEND_FAIL };
      ctx.drawImage(bitmap, 0, 0, width, height);
      last = await canvasBlob(canvas, quality);
      if (last && last.size <= FEEDBACK_IMAGE_UPLOAD_MAX_BYTES && last.size > 0) {
        return { blob: last };
      }
      quality = Math.max(0.5, quality - 0.1);
      scale *= 0.75;
    }
    if (last && last.size > FEEDBACK_IMAGE_MAX_BYTES) return { error: IMAGE_TOO_HEAVY };
    return { error: IMAGE_SEND_FAIL };
  } finally {
    bitmap.close();
  }
}
