/**
 * Branches of a live project, for trying a change without disturbing the shared model.
 *
 * A branch is its own live project in the vault that records its parent and starting model
 * (`TreeEntry.branchOf`, `document`), taken from the current model or any point in history.
 * Merging is a per-feature three-way merge (`mergeDocuments`): branch changes go in, others'
 * changes stay, and where both changed a feature the branch wins. The result is one ordinary,
 * undoable live edit.
 */

import {
  type CadDocument,
  describeOperation,
  diffOperations,
  type Operation,
  parseProjectFile,
} from '@bezier/core';
import {
  asDocument,
  type LiveChannel,
  LiveState,
  LiveSync,
  mergeDocuments,
  type Workspace,
} from '@bezier/sync';
import {
  download,
  type LinkStore,
  type LocalProjects,
  liveModel,
  projectCodec,
} from './shared-projects.js';

type Channel = LiveChannel<CadDocument, Operation>;

/** One change in a live project's history, newest last. */
export interface Change {
  readonly seq: number;
  readonly user: string;
  readonly at: string;
  /** Description from its operations: "Change Extrude", "Add Fillet". */
  readonly description: string;
  /** The model just before it, to branch from or revert to. */
  readonly before: CadDocument;
}

/** The individual changes the server still holds, oldest first (several hundred). */
export async function historyOf(channel: Channel): Promise<Change[]> {
  const first = await channel.start();
  if (first === null) return [];
  const state = new LiveState(liveModel, first.checkpoint.document, first.checkpoint.seq);
  const changes: Change[] = [];
  let page = first.edits;
  let known = first.seq;
  for (;;) {
    for (const edit of page) {
      const before = state.confirmed;
      state.receive([edit]);
      changes.push({
        seq: edit.seq,
        user: edit.user,
        at: edit.at,
        description: describe(edit.ops),
        before,
      });
    }
    if (state.seq >= known || page.length === 0) break;
    const next = await channel.poll(state.seq, false);
    page = next.edits;
    known = next.seq;
  }
  return changes;
}

function describe(ops: readonly Operation[]): string {
  const words = [...new Set(ops.map((op) => describeOperation(op)))];
  return words.length <= 2 ? words.join(', ') : `${words[0]} and ${words.length - 1} more`;
}

/** Starts a branch of `parent` from `from` and adds it to the library. Returns its id there. */
export async function createBranch(
  ws: Workspace,
  channelFor: (project: string) => Promise<Channel>,
  local: LocalProjects,
  links: LinkStore,
  target: { vault: string; parent: string; name: string; from: CadDocument },
): Promise<string> {
  const name = target.name.trim();
  if (name === '') throw new Error('Give the branch a name.');
  const entry = (await ws.state()).tree[target.parent];
  if (entry === undefined) throw new Error('This project is not in the vault any more.');
  // A branch of a branch is a branch of the same project: one level only.
  const root = entry.branchOf ?? target.parent;
  const rootName = (await ws.state()).tree[root]?.name ?? entry.name;
  const document = { ...target.from, meta: { ...target.from.meta, name: `${rootName} (${name})` } };
  const id = `${root}-${randomId()}`;
  const stored = await ws.repo.putDocument(projectCodec.encode(document));
  await ws.change(`Branch ${name}`, (tree) => ({
    ...tree,
    [id]: { name: document.meta.name, document: stored, branchOf: root },
  }));
  await (await channelFor(id)).create(document);
  const { localId } = await download(await channelFor(id), ws, local, links, {
    vault: target.vault,
    project: id,
    readOnly: false,
  });
  return localId;
}

export interface MergeResult {
  /** Features both sides changed; the branch's version was taken for each. */
  readonly conflicts: number;
  /** Whether the project changed at all. */
  readonly changed: boolean;
}

/** Brings what a branch changed into the project it came from, as one live edit. */
export async function mergeBranch(
  ws: Workspace,
  channelFor: (project: string) => Promise<Channel>,
  branch: string,
): Promise<MergeResult> {
  const entry = (await ws.state()).tree[branch];
  if (entry?.branchOf === undefined) throw new Error('This project is not a branch.');
  const base = projectCodec.decode(await ws.repo.getDocument(entry.document));
  const mine = normal(await current(await channelFor(branch)));
  const parentChannel = await channelFor(entry.branchOf);
  // Compared as read-back files: reading fills in default parameters, and a default written out
  // on one side only is not a change.
  const theirs = normal(await current(parentChannel));
  const ours = withName(mine, theirs.meta.name);
  const merged = mergeDocuments(
    asOrThrow(withName(base, theirs.meta.name)),
    asOrThrow(ours),
    asOrThrow(theirs),
  );
  const result = parseProjectFile(JSON.stringify(merged.document));
  const ops = diffOperations(theirs, result);
  if (ops.length > 0) await parentChannel.send({ id: randomId(), ops });
  // The branch's model is now in the project; the next merge starts from here.
  const stored = await ws.repo.putDocument(projectCodec.encode(mine));
  await ws.change(`Merge ${entry.name}`, (tree) => {
    const now = tree[branch];
    return now === undefined ? tree : { ...tree, [branch]: { ...now, document: stored } };
  });
  return { conflicts: merged.conflicts.length, changed: ops.length > 0 };
}

/** Removes a branch from the vault. Library copies stay as ordinary projects. */
export async function discardBranch(ws: Workspace, branch: string): Promise<void> {
  const entry = (await ws.state()).tree[branch];
  if (entry?.branchOf === undefined) throw new Error('This project is not a branch.');
  await ws.removeProject(branch);
}

async function current(channel: Channel): Promise<CadDocument> {
  const loaded = await LiveSync.load(channel, liveModel);
  if (loaded === null) throw new Error('This project is not shared live yet.');
  return loaded.document;
}

function normal(document: CadDocument): CadDocument {
  return parseProjectFile(JSON.stringify(document));
}

/** The branch has its own name; merging must not rename the target project. */
function withName(document: CadDocument, name: string): CadDocument {
  return { ...document, meta: { ...document.meta, name } };
}

function asOrThrow(document: CadDocument) {
  const d = asDocument(document);
  if (d === null) throw new Error('This project could not be merged.');
  return d;
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
