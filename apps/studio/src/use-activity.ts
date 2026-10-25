/**
 * Feeds the activity log (`report/activity-log.ts`): projects opened and their size, edits as named
 * in the undo menu, and workspaces visited.
 */

import { useEffect } from 'react';
import { recordActivity } from './report/activity-log.js';
import type { Session } from './session.js';

export function useActivity(session: Session | null, workspace: string): void {
  useEffect(() => {
    recordActivity('workspace', workspace);
  }, [workspace]);
  useEffect(() => {
    if (session === null) return;
    recordActivity('project', 'opened');
    return session.onEdit((edit) => recordActivity('edit', edit.description));
  }, [session]);
}
