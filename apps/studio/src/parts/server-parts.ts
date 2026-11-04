/**
 * Parts from a server someone runs: a folder of STEP files and pictures with a `parts.json` beside
 * them. Plain files over HTTPS, read without any credentials. What comes from there is untrusted:
 * sizes are capped, pictures must be real raster images, and a model only reaches the geometry
 * engine when someone adds it, as any imported file does.
 */

export interface ServerPart {
  name: string;
  /** Blob URL of the picture, or null. */
  picture: string | null;
  model: string;
}

const MAX_INDEX = 1024 * 1024;
const MAX_PICTURE = 8 * 1024 * 1024;
const MAX_MODEL = 64 * 1024 * 1024;
const MAX_PARTS = 500;
const PICTURES = ['image/png', 'image/jpeg', 'image/webp'];

/** The address as a base URL, or null when it is not one this app will talk to. */
export function serverBase(address: string): URL | null {
  let url: URL;
  try {
    url = new URL(address.trim().replace(/\/*$/, '/'));
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
  if (url.username !== '' || url.password !== '') return null;
  return url;
}

async function capped(url: URL, limit: number): Promise<Response> {
  const response = await fetch(url, { credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error(`The server answered ${String(response.status)}.`);
  if (Number(response.headers.get('content-length') ?? 0) > limit) {
    throw new Error('That file is larger than the library accepts.');
  }
  return response;
}

async function bodyOf(response: Response, limit: number): Promise<Blob> {
  const blob = await response.blob();
  if (blob.size > limit) throw new Error('That file is larger than the library accepts.');
  return blob;
}

/** A file name beside `parts.json`. Paths and other hosts are refused. */
function fileIn(base: URL, name: unknown): URL | null {
  if (typeof name !== 'string' || !/^[\w. -]+$/.test(name) || name.startsWith('.')) return null;
  return new URL(encodeURIComponent(name), base);
}

async function pictureOf(base: URL, name: unknown): Promise<string | null> {
  const url = fileIn(base, name);
  if (url === null) return null;
  try {
    const blob = await bodyOf(await capped(url, MAX_PICTURE), MAX_PICTURE);
    return PICTURES.includes(blob.type) ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

export async function readServerParts(address: string): Promise<readonly ServerPart[]> {
  const base = serverBase(address);
  if (base === null) throw new Error('That address does not work here: it has to be https://.');
  const index = await bodyOf(await capped(new URL('parts.json', base), MAX_INDEX), MAX_INDEX);
  const listed = (JSON.parse(await index.text()) as { parts?: unknown }).parts;
  if (!Array.isArray(listed)) throw new Error('That server has no parts.json with a parts list.');
  const parts: ServerPart[] = [];
  for (const entry of listed.slice(0, MAX_PARTS) as Record<string, unknown>[]) {
    const model = fileIn(base, entry.model);
    if (model === null || typeof entry.name !== 'string') continue;
    parts.push({
      name: entry.name.slice(0, 80),
      picture: await pictureOf(base, entry.picture),
      model: model.href,
    });
  }
  return parts;
}

export async function readServerModel(href: string): Promise<string> {
  const url = new URL(href);
  return (await bodyOf(await capped(url, MAX_MODEL), MAX_MODEL)).text();
}
