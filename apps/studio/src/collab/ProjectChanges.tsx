/**
 * History of the open shared project, with two ways out of an unwanted change: revert to before
 * it (a new edit, visible to everyone and undoable) or start a branch from before it. Branches are
 * merged or discarded here too. Opened from the people pill (`ProjectPeople.tsx`).
 */

import type { CadDocument } from '@bezier/core';
import { useEffect, useRef, useState } from 'react';
import { type Change, createBranch, discardBranch, historyOf, mergeBranch } from './branches.js';
import { type OpenProject, useCollab } from './CollabProvider.js';
import { links } from './collab-store.js';

export interface ProjectChangesProps {
  project: OpenProject;
  onClose: () => void;
}

/** The newest changes shown; the server keeps a few hundred. */
const SHOWN = 40;

export function ProjectChanges({ project, onClose }: ProjectChangesProps) {
  const collab = useCollab();
  const collabRef = useRef(collab);
  collabRef.current = collab;
  const [changes, setChanges] = useState<readonly Change[] | null>(null);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [parent, setParent] = useState<{ id: string; name: string } | null>(null);
  const [branchName, setBranchName] = useState('');
  const [from, setFrom] = useState<{ before: CadDocument; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const vault = collab.vault(project.vault);
  const canWrite = !project.readOnly;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is the trigger to read again
  useEffect(() => {
    const c = collabRef.current;
    const v = c.vault(project.vault);
    if (v === undefined) return;
    let live = true;
    void (async () => {
      try {
        const ws = await c.workspace(v);
        const [history, state, info] = await Promise.all([
          historyOf(await c.liveChannel(v, project.project)),
          ws.state(),
          c.isLink(v.id) ? null : c.vaultClient().get(v.id),
        ]);
        if (!live) return;
        setChanges(history);
        const of = state.tree[project.project]?.branchOf;
        setParent(
          of === undefined ? null : { id: of, name: state.tree[of]?.name ?? 'the project' },
        );
        const me = c.identity?.userId;
        setNames(
          new Map(
            (info?.members ?? []).map((m) => [
              m.userId,
              m.userId === me ? 'You' : (m.name ?? 'Someone'),
            ]),
          ),
        );
      } catch (error) {
        if (live) setSaid(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      live = false;
    };
  }, [project.vault, project.project, tick]);

  if (vault === undefined) return null;

  const act = async (what: () => Promise<string | null>) => {
    setBusy(true);
    setSaid(null);
    try {
      setSaid(await what());
    } catch (error) {
      setSaid(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setTick((n) => n + 1);
    }
  };

  const branch = () =>
    act(async () => {
      const library = project.library();
      if (library === null) return 'The library is not open.';
      const ws = await collab.workspace(vault);
      const localId = await createBranch(ws, (p) => collab.liveChannel(vault, p), library, links, {
        vault: vault.id,
        parent: project.project,
        name: branchName,
        from: from?.before ?? project.document(),
      });
      onClose();
      project.open(localId);
      return null;
    });

  const merge = () =>
    act(async () => {
      const ws = await collab.workspace(vault);
      const result = await mergeBranch(ws, (p) => collab.liveChannel(vault, p), project.project);
      if (!result.changed)
        return `${parent?.name ?? 'The project'} has everything from this branch already.`;
      return result.conflicts > 0
        ? `Merged. Where both changed the same thing, this branch's version was taken (${result.conflicts}).`
        : `Merged into ${parent?.name ?? 'the project'}.`;
    });

  const discard = () =>
    act(async () => {
      await discardBranch(await collab.workspace(vault), project.project);
      return 'The branch is gone from the vault. Your copy here stays as a project of its own.';
    });

  const shown = (changes ?? []).slice(-SHOWN).reverse();
  return (
    <div
      aria-label="Changes"
      className="menu collab-changes"
      data-testid="project-changes"
      role="dialog"
    >
      {parent !== null && canWrite && (
        <section className="collab-changes__branch">
          <p>
            A branch of <b>{parent.name}</b>.
          </p>
          <div className="collab-changes__row">
            <button
              className="prefs-button"
              disabled={busy}
              onClick={() => void merge()}
              type="button"
            >
              Merge into {parent.name}
            </button>
            <button
              className="prefs-button"
              disabled={busy}
              onClick={() => void discard()}
              type="button"
            >
              Discard branch
            </button>
          </div>
        </section>
      )}

      {canWrite && (
        <form
          className="collab-changes__new"
          onSubmit={(event) => {
            event.preventDefault();
            void branch();
          }}
        >
          <label>
            <span>
              {from === null ? 'New branch from here' : `New branch from before “${from.label}”`}
            </span>
            <input
              aria-label="Branch name"
              className="prefs-select"
              onChange={(event) => setBranchName(event.target.value)}
              placeholder="Name, for example Taller lid"
              value={branchName}
            />
          </label>
          <div className="collab-changes__row">
            <button
              className="prefs-button"
              disabled={busy || branchName.trim() === ''}
              type="submit"
            >
              Start branch
            </button>
            {from !== null && (
              <button className="prefs-button" onClick={() => setFrom(null)} type="button">
                From here instead
              </button>
            )}
          </div>
        </form>
      )}

      {said !== null && (
        <p className="collab-changes__said" role="status">
          {said}
        </p>
      )}

      <h2>Recent changes</h2>
      {changes === null ? (
        <p className="collab-empty">Reading the history…</p>
      ) : shown.length === 0 ? (
        <p className="collab-empty">Nothing has changed since it was shared.</p>
      ) : (
        <ol className="collab-changes__list">
          {shown.map((change) => (
            <li key={change.seq}>
              <span>
                <b>{names.get(change.user) ?? 'Someone'}</b> {change.description}
                <small>{when(change.at)}</small>
              </span>
              {canWrite && (
                <span className="collab-changes__actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await project.restore(change.before);
                        return 'Back to before that change. Undo brings it back.';
                      })
                    }
                    type="button"
                  >
                    Go back to before
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => setFrom({ before: change.before, label: change.description })}
                    type="button"
                  >
                    Branch from before
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function when(at: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(at)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(at).toLocaleDateString();
}
