/**
 * Image import: decodes with the browser (`createImageBitmap`), downsizes for the drawing desk and
 * stores the result as one small file in the project.
 *
 * PNG, JPEG, WebP, GIF, BMP, ICO and AVIF decode everywhere; TIFF and HEIC only where the system
 * decoder supports them (Safari, the Mac app). Small images keep their original bytes; larger ones
 * are scaled to `MAX_SIDE` and re-encoded (WebP, else JPEG or PNG) until under `MAX_BYTES`, since
 * projects are saved and shared as text.
 */

/** Accepted types, also offered by the file chooser. SVG is handled elsewhere, as a drawing. */
export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.jpe',
  '.jfif',
  '.webp',
  '.gif',
  '.bmp',
  '.dib',
  '.ico',
  '.cur',
  '.avif',
  '.apng',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
] as const;

/** Longer side, in pixels, an image is stored at. A screen shows no more than this. */
export const MAX_SIDE = 3072;
/** Maximum stored file size, before it is written as text. */
export const MAX_BYTES = 3 * 1024 * 1024;
/** Files larger than this are rejected without decoding. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  apng: 'image/apng',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  jfif: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  dib: 'image/bmp',
  ico: 'image/x-icon',
  cur: 'image/x-icon',
  avif: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** Formats usable as they are, without re-encoding. */
const KEPT_AS_IS = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function looksLikeImage(name: string, type = ''): boolean {
  if (/\.svg$/i.test(name)) return false;
  return (
    IMAGE_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension)) ||
    (type.startsWith('image/') && type !== 'image/svg+xml')
  );
}

export function mimeOf(name: string, type = ''): string {
  return (
    (type.startsWith('image/') ? type : undefined) ?? MIME_BY_EXTENSION[extensionOf(name)] ?? ''
  );
}

/** The stored size: the original if small enough, else scaled to longer side `max`. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const longer = Math.max(width, height);
  if (longer <= max) return { width, height };
  const scale = max / longer;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function toBase64(bytes: Uint8Array): string {
  let text = '';
  const chunk = 0x8000;
  for (let at = 0; at < bytes.length; at += chunk)
    text += String.fromCharCode(...bytes.subarray(at, at + chunk));
  return btoa(text);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export interface ReadImage {
  /** The image file, base64. */
  data: string;
  mime: string;
  /** Of the stored image; placement proportions derive from it. */
  pixelWidth: number;
  pixelHeight: number;
}

export type ImageResult = { ok: true; image: ReadImage } | { ok: false; message: string };

/** Why a format cannot be read, in user-facing words that say what to do. */
function unreadable(name: string): string {
  const extension = extensionOf(name);
  const rare = ['heic', 'heif', 'tif', 'tiff', 'avif', 'jxl'].includes(extension);
  return rare
    ? `This window cannot read .${extension} pictures. Save a copy as PNG or JPEG in the program that made it, and bring that.`
    : `${name} could not be read as a picture. It may be damaged, or not a picture at all.`;
}

function newCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function encode(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality }).catch(() => null);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Whether any pixel is not fully opaque; an opaque image can be stored as JPEG. */
function hasTransparency(
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  const { data } = context.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 255) < 255) return true;
  return false;
}

export async function readImage(
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
  type = '',
): Promise<ImageResult> {
  if (bytes.byteLength === 0) return { ok: false, message: `${name} is empty.` };
  if (bytes.byteLength > MAX_FILE_BYTES)
    return {
      ok: false,
      message: `${name} is larger than ${String(MAX_FILE_BYTES / 1024 / 1024)} MB, which is more than a picture here can be.`,
    };
  const mime = mimeOf(name, type);
  let bitmap: ImageBitmap;
  try {
    // The browser applies EXIF orientation when decoding.
    bitmap = await createImageBitmap(new Blob([bytes], mime === '' ? {} : { type: mime }));
  } catch {
    return { ok: false, message: unreadable(name) };
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height, MAX_SIDE);
    const small = size.width === bitmap.width && size.height === bitmap.height;
    if (small && KEPT_AS_IS.has(mime) && bytes.byteLength <= MAX_BYTES)
      return {
        ok: true,
        image: {
          data: toBase64(bytes),
          mime,
          pixelWidth: bitmap.width,
          pixelHeight: bitmap.height,
        },
      };

    let scale = 1;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const width = Math.max(1, Math.round(size.width * scale));
      const height = Math.max(1, Math.round(size.height * scale));
      const canvas = newCanvas(width, height);
      const context = canvas.getContext('2d') as
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D
        | null;
      if (context === null) return { ok: false, message: 'This window cannot prepare pictures.' };
      context.drawImage(bitmap, 0, 0, width, height);
      const transparent = hasTransparency(context, width, height);
      // WebP where supported, else PNG with transparency or JPEG without.
      let blob = await encode(canvas, 'image/webp', 0.92);
      if (blob === null || blob.type !== 'image/webp')
        blob = await encode(canvas, transparent ? 'image/png' : 'image/jpeg', 0.92);
      if (blob === null) return { ok: false, message: unreadable(name) };
      if (blob.size <= MAX_BYTES)
        return {
          ok: true,
          image: {
            data: toBase64(new Uint8Array(await blob.arrayBuffer())),
            mime: blob.type,
            pixelWidth: width,
            pixelHeight: height,
          },
        };
      scale *= 0.75;
    }
    return { ok: false, message: `${name} is too large to keep in a project, even reduced.` };
  } finally {
    bitmap.close();
  }
}
