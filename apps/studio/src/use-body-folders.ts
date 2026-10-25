/**
 * Body list organisation: folders, and isolating one body. Both are journalled document state, so
 * they save and undo. Isolating hides every other body in one step; repeating it shows them again.
 */

import type { BodySummary, CadDocument, Operation } from '@bezier/core';
import { useCallback } from 'react';
import type { Session, SessionView } from './session.js';

type Run = (change: (session: Session) => Promise<SessionView>) => Promise<void> | void;

export interface BodyFolders {
  /** Folder name by body key. */
  folders: Readonly<Record<string, string>>;
  onFolder: (key: string, folder: string) => void;
  onIsolate: (key: string) => void;
  onFolderVisible: (folder: string, visible: boolean) => void;
  /** Shows or hides several bodies as one undo step. */
  onBodiesVisible: (keys: readonly string[], visible: boolean) => void;
}

const NO_FOLDERS: Readonly<Record<string, string>> = {};

export function useBodyFolders(
  document: CadDocument | null,
  bodies: readonly BodySummary[],
  run: Run,
): BodyFolders {
  const folders = document?.meta.bodyFolders ?? NO_FOLDERS;

  const onFolder = useCallback(
    (key: string, folder: string) => {
      void run((session) => session.apply({ op: 'setBodyFolder', key, folder }));
    },
    [run],
  );

  const onIsolate = useCallback(
    (key: string) => {
      const others = bodies.filter((body) => body.key !== key);
      const isolated =
        others.length > 0 &&
        others.every((body) => body.hidden) &&
        bodies.some((body) => body.key === key && !body.hidden);
      const ops: Operation[] = isolated
        ? others.map((body) => ({ op: 'setBodyVisible', key: body.key, visible: true }))
        : [
            { op: 'setBodyVisible', key, visible: true },
            ...others
              .filter((body) => !body.hidden)
              .map((body): Operation => ({ op: 'setBodyVisible', key: body.key, visible: false })),
          ];
      void run((session) => session.apply(ops));
    },
    [bodies, run],
  );

  const onFolderVisible = useCallback(
    (folder: string, visible: boolean) => {
      const ops: Operation[] = bodies
        .filter((body) => folders[body.key] === folder && body.hidden === visible)
        .map((body) => ({ op: 'setBodyVisible', key: body.key, visible }));
      if (ops.length > 0) void run((session) => session.apply(ops));
    },
    [bodies, folders, run],
  );

  const onBodiesVisible = useCallback(
    (keys: readonly string[], visible: boolean) => {
      const ops: Operation[] = bodies
        .filter((body) => keys.includes(body.key) && body.hidden === visible)
        .map((body) => ({ op: 'setBodyVisible', key: body.key, visible }));
      if (ops.length > 0) void run((session) => session.apply(ops));
    },
    [bodies, run],
  );

  return { folders, onFolder, onIsolate, onFolderVisible, onBodiesVisible };
}
