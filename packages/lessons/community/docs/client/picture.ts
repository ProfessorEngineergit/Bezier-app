/**
 * Prepares a picture for upload: scaled down to what an article needs and encoded as WebP, on the
 * device, so large screenshots are not sent as multi-megabyte PNGs.
 */

import { LIMITS } from '../format/article.js';

const WIDEST = 1600;

export async function preparePicture(
  file: Blob,
): Promise<{ bytes: Uint8Array; mime: string; width: number; height: number }> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type))
    throw new Error('Choose a PNG, JPEG or WebP picture.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, WIDEST / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('This browser cannot prepare pictures.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength > LIMITS.imageBytes)
    throw new Error(
      `That picture is still over ${Math.round(LIMITS.imageBytes / 1_000_000)} MB. Crop it first.`,
    );
  return { bytes, mime: blob.type, width, height };
}
