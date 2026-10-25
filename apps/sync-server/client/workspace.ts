/**
 * One branch as the app uses it: a list of projects to add, replace, rename, restore and
 * delete, each change a signed commit pushed immediately. If someone else pushed in between,
 * the change is merged and pushed again, so callers never see a compare-and-swap failure.
 *
 * Built on Repository; nothing here touches keys or the wire.
 */

import { toHex } from '../protocol/bytes.ts';
import { randomBytes } from '../protocol/crypto.ts';
import type { Conflict, Tree, TreeEntry } from './merge.ts';
import type { Branch, Commit, MergeOutcome, Repository } from './repository.ts';

export interface BranchState {
  readonly branch: Branch | null;
  readonly commit: Commit | null;
  readonly tree: Tree;
}

export interface ChangeResult {
  readonly head: string;
  /** Set when the change had to be merged with someone else's. */
  readonly mergedWith: string | null;
  readonly merged: readonly string[];
  readonly conflicts: readonly Conflict[];
}

/** How often to merge and retry when others keep pushing. Past this, something is wrong. */
const ATTEMPTS = 5;

export class Workspace {
  readonly repo: Repository;
  readonly branchName: string;

  constructor(repo: Repository, branchName: string) {
    this.repo = repo;
    this.branchName = branchName;
  }

  async state(): Promise<BranchState> {
    const branch = await this.repo.branch(this.branchName);
    if (branch === null) return { branch: null, commit: null, tree: {} };
    const commit = await this.repo.readCommit(branch.head);
    return { branch, commit, tree: commit.tree };
  }

  /**
   * Applies `edit` to the branch's projects, commits and pushes. Creates the branch if it
   * does not exist yet. On a race, merges with what is there and pushes the merge.
   */
  async change(message: string, edit: (tree: Tree) => Tree): Promise<ChangeResult> {
    const { branch } = await this.state();
    return this.changeFrom(branch?.head ?? null, message, edit);
  }

  /**
   * Like `change`, but on top of `base`, the commit the change started from, rather than
   * the current branch head. For offline edits, so the merge with others' work is a real
   * three-way merge.
   */
  async changeFrom(
    base: string | null,
    message: string,
    edit: (tree: Tree) => Tree,
  ): Promise<ChangeResult> {
    const tree = base === null ? {} : (await this.repo.readCommit(base)).tree;
    let head = await this.repo.commit(base === null ? [] : [base], edit(tree), message);
    let branch = await this.repo.branch(this.branchName);
    let mergedWith: string | null = null;
    let outcome: MergeOutcome = { head, merged: [], conflicts: [] };

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (branch !== null && branch.head !== base && branch.head !== head) {
        mergedWith = branch.head;
        outcome = await this.repo.merge(branch.head, head, { message: `Merge: ${message}` });
        head = outcome.head;
      }
      const pushed = await this.repo.push(this.branchName, head, branch);
      if (pushed.ok)
        return { head, mergedWith, merged: outcome.merged, conflicts: outcome.conflicts };
      base = head;
      branch = await this.repo.branch(this.branchName);
    }
    throw new Error('Others keep changing this branch. Try again in a moment.');
  }

  async addProject(name: string, bytes: Uint8Array): Promise<{ id: string; result: ChangeResult }> {
    const id = `p-${toHex(randomBytes(8))}`;
    const document = await this.repo.putDocument(bytes);
    const result = await this.change(`Add ${name}`, (tree) => ({
      ...tree,
      [id]: { name, document },
    }));
    return { id, result };
  }

  async replaceProject(id: string, bytes: Uint8Array, message?: string): Promise<ChangeResult> {
    const document = await this.repo.putDocument(bytes);
    return this.change(message ?? 'Update project', (tree) => {
      const entry = tree[id];
      if (entry === undefined) throw new Error('This project is not on this branch any more.');
      return { ...tree, [id]: { name: entry.name, document } };
    });
  }

  async renameProject(id: string, name: string): Promise<ChangeResult> {
    return this.change(`Rename to ${name}`, (tree) => {
      const entry = tree[id];
      if (entry === undefined) throw new Error('This project is not on this branch any more.');
      return { ...tree, [id]: { ...entry, name } };
    });
  }

  async removeProject(id: string): Promise<ChangeResult> {
    return this.change('Delete project', (tree) => {
      const { [id]: gone, ...rest } = tree;
      return gone === undefined ? tree : rest;
    });
  }

  /** Puts an earlier version of a project (from any commit) back as the current one. */
  async restoreProject(id: string, entry: TreeEntry, from: Commit): Promise<ChangeResult> {
    const when = from.at.slice(0, 16).replace('T', ' ');
    return this.change(`Restore ${entry.name} from ${when}`, (tree) => ({ ...tree, [id]: entry }));
  }

  /** A new branch starting where this one is now (or at `from`). */
  async branchOff(name: string, from?: string): Promise<void> {
    const head = from ?? (await this.state()).branch?.head;
    if (head === undefined) throw new Error('There is nothing on this branch to start from yet.');
    if ((await this.repo.branch(name)) !== null)
      throw new Error(`A branch "${name}" exists already.`);
    const pushed = await this.repo.push(name, head, null);
    if (!pushed.ok) throw new Error(`A branch "${name}" was just created by someone else.`);
  }

  /** Brings another branch's changes into this one, and pushes the result. */
  async mergeFrom(source: string): Promise<ChangeResult> {
    const from = await this.repo.branch(source);
    if (from === null) throw new Error(`There is no branch "${source}".`);
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const target = await this.repo.branch(this.branchName);
      if (target === null) {
        await this.repo.push(this.branchName, from.head, null);
        return { head: from.head, mergedWith: from.head, merged: [], conflicts: [] };
      }
      const outcome = await this.repo.merge(target.head, from.head, {
        message: `Merge ${source} into ${this.branchName}`,
      });
      if (outcome.head === target.head) {
        return { head: target.head, mergedWith: null, merged: [], conflicts: [] };
      }
      const pushed = await this.repo.push(this.branchName, outcome.head, target);
      if (pushed.ok) {
        return {
          head: outcome.head,
          mergedWith: from.head,
          merged: outcome.merged,
          conflicts: outcome.conflicts,
        };
      }
    }
    throw new Error('Others keep changing this branch. Try again in a moment.');
  }
}

/** A file name for a project, safe on every desktop system. */
export function fileNameFor(name: string): string {
  // Control characters are dropped by code point: a regex range over them is easy to misread.
  const printable = [...name].map((c) => (c.charCodeAt(0) < 32 ? ' ' : c)).join('');
  const safe =
    printable
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'project';
  return `${safe.slice(0, 100)}.bezier.json`;
}

/**
 * A project's name from an uploaded file: the name inside a Bezier project if there is
 * one, else the file name without its extension.
 */
export function projectName(fileName: string, bytes: Uint8Array): string {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { meta?: { name?: unknown } };
    if (typeof parsed.meta?.name === 'string' && parsed.meta.name.trim() !== '') {
      return parsed.meta.name.trim().slice(0, 120);
    }
  } catch {
    // Not JSON: any file can be kept in a vault, it just merges as a whole.
  }
  return fileName.replace(/\.bezier\.json$|\.[^.]+$/i, '').slice(0, 120) || 'Untitled';
}
