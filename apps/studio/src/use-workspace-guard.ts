/**
 * Entering a workspace, asking first when the model is too large to open quickly
 * (`large-model.ts`). Asked once per project and workspace.
 */

import { useCallback, useEffect, useRef } from 'react';
import { askQuestion } from './ask-question.js';
import { largeModelQuestion } from './large-model.js';
import { WORKSPACES } from './workspaces/WorkspaceModes.js';

export function useWorkspaceGuard(
  faces: number,
  projectId: string,
  enter: (id: string) => void,
): (id: string) => void {
  const agreed = useRef(new Set<string>());
  // biome-ignore lint/correctness/useExhaustiveDependencies: another project starts with no answers
  useEffect(() => agreed.current.clear(), [projectId]);
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
