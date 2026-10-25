/** Size of the open project for a report: counts only, never names or contents. */

import type { SessionView } from '../session.js';
import type { ProjectFacts } from './diagnostics.js';

export function projectFacts(workspace: string, view: SessionView | null): ProjectFacts {
  return {
    Workspace: workspace,
    Bodies: view?.bodies.length ?? 0,
    Features: view?.document.features.length ?? 0,
  };
}
