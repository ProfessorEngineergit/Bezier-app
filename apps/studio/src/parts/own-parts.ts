/**
 * The parts someone added themselves: a STEP model and, if given, a picture of it. Kept on this
 * device beside the projects, under their own keys.
 */

import { IndexedDbBackend } from '@bezier/storage';

export interface OwnPart {
  id: string;
  name: string;
  /** A data URL, or null when none was given. */
  picture: string | null;
}

const LIST = 'parts/list.json';
const modelKey = (id: string) => `parts/${id}.step`;

const store = new IndexedDbBackend();
const text = new TextDecoder();
const bytes = new TextEncoder();

export async function listOwnParts(): Promise<readonly OwnPart[]> {
  const saved = await store.read(LIST);
  if (saved === null) return [];
  try {
    return JSON.parse(text.decode(saved)) as OwnPart[];
  } catch {
    return [];
  }
}

export async function addOwnPart(name: string, model: string, picture: string | null) {
  const part: OwnPart = { id: `part-${String(Date.now())}`, name, picture };
  await store.write(modelKey(part.id), bytes.encode(model));
  const all = [...(await listOwnParts()), part];
  await store.write(LIST, bytes.encode(JSON.stringify(all)));
  return all;
}

export async function removeOwnPart(id: string) {
  const all = (await listOwnParts()).filter((part) => part.id !== id);
  await store.write(LIST, bytes.encode(JSON.stringify(all)));
  await store.remove(modelKey(id));
  return all;
}

export async function ownPartModel(id: string): Promise<string | null> {
  const saved = await store.read(modelKey(id));
  return saved === null ? null : text.decode(saved);
}
