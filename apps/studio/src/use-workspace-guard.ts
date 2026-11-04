/**
 * Entering a workspace, asking first when the model is too large to open quickly
 * (`large-model.ts`). Asked once per project and workspace. A project opens in the workspace the
 * settings name, not in the one the last project was left in.
 */

import { useCallback, useEffect, useRef } from 'react';
import { askQuestion } from './ask-question.js';
import { largeModelQuestion } from './large-model.js';
import { WORKSPACES } from './workspaces/WorkspaceModes.js';

export function useWorkspaceGuard(
  faces: number,
  projectId: string,
  enter: (id: string) => void,
  startup: string,
): (id: string) => void {
  const agreed = useRef(new Set<string>());
  const opening = useRef({ enter, startup });
  opening.current = { enter, startup };
  // biome-ignore lint/correctness/useExhaustiveDependencies: another project starts with no answers
  useEffect(() => {
    agreed.current.clear();
    if (projectId !== '') opening.current.enter(opening.current.startup);
  }, [projectId]);
  return useCallback(
    (id: string) => {
      // Checked against the registry so a workspace added to `WORKSPACES` cannot be silently
      // missing here.
      if (!WORKSPACES.some((entry) => entry.id === id)) return;
      const question = agreed.current.has(id) ? null : largeModelQuestion(id, faces);
      if (question === null) {
        enter(id);
        return;
      }
      void askQuestion(question).then((yes) => {
        if (!yes) return;
        agreed.current.add(id);
        enter(id);
      });
    },
    [enter, faces],
  );
}
