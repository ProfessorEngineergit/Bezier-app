/**
 * A shared project on this device: a library copy kept current live (ADR 0015). It opens like any
 * project, with edits in the local journal (ADR 0009); `live-project.ts` sends and receives edits
 * while it is open. The link stores the server-ordered position (`live.seq`, `live.confirmed`)
 * and unsent local edits (`live.pending`), so offline work is sent on reconnect.
 */

import {
  apply,
  type CadDocument,
  diffOperations,
  type Operation,
  parseProjectFile,
  sameDocument,
} from '@bezier/core';
import type { DocumentCodec, LiveChannel, LiveModel, LiveSnapshot, Workspace } from '@bezier/sync';
import { LiveState, LiveSync } from '@bezier/sync';

export interface ProjectLink {
  /** The project's id in the library on this device. */
  readonly localId: string;
  readonly vault: string;
  /** The project's id in the vault. */
  readonly project: string;
  /** Read-only: a reader in the vault, or a read-only link. */
  readonly readOnly: boolean;
  /** Sync position and unsent edits. */
  readonly live?: LiveSnapshot<CadDocument, Operation>;
}

/** Link storage: the collaboration store on this device. */
export interface LinkStore {
  get(localId: string): Promise<ProjectLink | undefined>;
  set(link: ProjectLink): Promise<void>;
  remove(localId: string): Promise<void>;
  all(): Promise<readonly ProjectLink[]>;
}

/** The part of the library this needs (`DocumentStore`). */
export interface LocalProjects {
  load(id: string): Promise<{ document: CadDocument }>;
  importProject(id: string, document: CadDocument): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  list(): Promise<readonly string[]>;
}

/** How the live layer applies edits: the journal's `apply`, which never throws. */
export const liveModel: LiveModel<CadDocument, Operation> = {
  apply(document, op) {
    const next = apply(document, op);
    return next.ok ? next.document : null;
  },
};

/**
 * Checkpoints are project files, validated like a file from disk: a member's upload is untrusted
 * input, and an invalid document must not reach the rebuild.
 */
export const projectCodec: DocumentCodec<CadDocument> = {
  encode: (document) => new TextEncoder().encode(JSON.stringify(document)),
  decode: (bytes) => parseProjectFile(new TextDecoder().decode(bytes)),
};

/** The library id of a shared project; stable across devices. */
export function localIdFor(vault: string, project: string): string {
  return `shared-${vault.slice(0, 8)}-${project.replace(/^p-/, '')}`;
}

export function isSharedId(id: string): boolean {
  return id.startsWith('shared-');
}

/**
 * Adds a shared project to the library if missing. A project shared before live editing has no
 * checkpoint; the first member with write access makes it live from the vault version.
 */
export async function download(
  channel: LiveChannel<CadDocument, Operation>,
  ws: Workspace,
  local: LocalProjects,
  links: LinkStore,
  target: { vault: string; project: string; readOnly: boolean },
): Promise<{ localId: string; added: boolean }> {
  const localId = localIdFor(target.vault, target.project);
  const link = await links.get(localId);
  if (link !== undefined && (await local.list()).includes(localId)) {
    if (link.readOnly !== target.readOnly) await links.set({ ...link, readOnly: target.readOnly });
    return { localId, added: false };
  }
  let loaded = await LiveSync.load(channel, liveModel);
  if (loaded === null) {
    const entry = (await ws.state()).tree[target.project];
    if (entry === undefined) throw new Error('This project is not in the vault any more.');
    if (target.readOnly) throw new Error('This project opens once someone who can edit it has.');
    const document = projectCodec.decode(await ws.repo.getDocument(entry.document));
    await channel.create(document);
    loaded = { seq: 0, document };
  }
  await replace(local, localId, loaded.document);
  await links.set({
    localId,
    vault: target.vault,
    project: target.project,
    readOnly: target.readOnly,
    live: { seq: loaded.seq, confirmed: loaded.document, pending: [] },
  });
  return { localId, added: true };
}

/**
 * Shares a project from this device: uploads it to the vault, makes it live, and replaces the
 * original library project with the shared copy so the two cannot drift apart.
 */
export async function shareLocal(
  ws: Workspace,
  channelFor: (project: string) => Promise<LiveChannel<CadDocument, Operation>>,
  local: LocalProjects,
  links: LinkStore,
  vault: string,
  sourceId: string,
): Promise<{ project: string; localId: string }> {
  const document = parseProjectFile(JSON.stringify((await local.load(sourceId)).document));
  const { id: project } = await ws.addProject(document.meta.name, projectCodec.encode(document));
  await (await channelFor(project)).create(document);
  const localId = localIdFor(vault, project);
  await replace(local, localId, document);
  await links.set({
    localId,
    vault,
    project,
    readOnly: false,
    live: { seq: 0, confirmed: document, pending: [] },
  });
  if (sourceId !== localId) await local.deleteDocument(sourceId);
  return { project, localId };
}

/**
 * Where to resume when the project opens: the last received position, plus local edits never
 * recorded as pending (made with collaboration off, or just before the app closed), found by
 * diffing the copy against its expected state and sent as one edit by this user.
 */
export function resume(
  link: ProjectLink,
  here: CadDocument,
): { from: LiveSnapshot<CadDocument, Operation>; unsent: Operation[] } | null {
  if (link.live === undefined) return null;
  const expected = new LiveState(liveModel, link.live.confirmed, link.live.seq, link.live.pending)
    .target;
  const unsent =
    link.readOnly || sameDocument(expected, here) ? [] : diffOperations(expected, here);
  return { from: link.live, unsent };
}

async function replace(local: LocalProjects, id: string, document: CadDocument): Promise<void> {
  if ((await local.list()).includes(id)) await local.deleteDocument(id);
  await local.importProject(id, document);
}
