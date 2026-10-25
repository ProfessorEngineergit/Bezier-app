/**
 * Three-way merge of two project trees against their common ancestor. Pure: no network,
 * no crypto, so the rules can be read and tested on their own.
 *
 * The unit is a whole project, as Git's is a whole file: a project changed on one side is
 * taken from that side, one changed on both is a conflict. Name and content merge
 * separately. Feature-level merging is in document-merge.ts (../DESIGN.md, "Merging inside a
 * project").
 */

export interface TreeEntry {
  readonly name: string;
  /** Object id of the sealed document manifest. */
  readonly document: string;
  /**
   * Set on a branch of a live project: the project it branched from. `document` is then the
   * model where it branched (or was last merged), the base a merge back compares against.
   */
  readonly branchOf?: string;
}

export type Tree = Readonly<Record<string, TreeEntry>>;

export interface Conflict {
  readonly project: string;
  readonly base: TreeEntry | null;
  readonly ours: TreeEntry | null;
  readonly theirs: TreeEntry | null;
}

export interface MergeResult {
  readonly tree: Record<string, TreeEntry>;
  readonly conflicts: readonly Conflict[];
}

export function mergeTrees(base: Tree, ours: Tree, theirs: Tree): MergeResult {
  const tree: Record<string, TreeEntry> = {};
  const conflicts: Conflict[] = [];
  const ids = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);

  for (const id of [...ids].sort()) {
    const b = base[id] ?? null;
    const o = ours[id] ?? null;
    const t = theirs[id] ?? null;

    if (o === null || t === null) {
      // Deleted on one side: fine if the other side left it alone, a conflict if it was
      // edited, so an edit is never dropped silently.
      const kept = o ?? t;
      if (kept === null) continue;
      if (b === null) tree[id] = kept;
      else if (!same(kept, b)) conflicts.push({ project: id, base: b, ours: o, theirs: t });
      continue;
    }

    const document = pick(b?.document, o.document, t.document);
    const name = pick(b?.name, o.name, t.name);
    if (document === undefined || name === undefined) {
      conflicts.push({ project: id, base: b, ours: o, theirs: t });
    } else {
      // Which project a branch came from never changes once it is made.
      const branchOf = o.branchOf ?? t.branchOf;
      tree[id] = branchOf === undefined ? { name, document } : { name, document, branchOf };
    }
  }
  return { tree, conflicts };
}

/** The side that changed, or undefined if both changed and disagree. */
function pick(base: string | undefined, ours: string, theirs: string): string | undefined {
  if (ours === theirs) return ours;
  if (ours === base) return theirs;
  if (theirs === base) return ours;
  return undefined;
}

function same(a: TreeEntry, b: TreeEntry): boolean {
  return a.name === b.name && a.document === b.document;
}

/**
 * The default resolution: keep both. Ours keeps the project id, theirs becomes a labelled
 * copy beside it, and the user decides which to keep.
 */
export function keepBoth(result: MergeResult, theirsLabel: string): Record<string, TreeEntry> {
  const tree = { ...result.tree };
  for (const c of result.conflicts) {
    if (c.ours !== null) tree[c.project] = c.ours;
    if (c.theirs !== null) {
      const copy = c.ours === null ? c.project : `${c.project}~${theirsLabel}`;
      const name = c.ours === null ? c.theirs.name : `${c.theirs.name} (${theirsLabel})`;
      tree[copy] = { name, document: c.theirs.document };
    }
  }
  return tree;
}
