/** The control that opens the report dialog, in the title bar and in the start page's sidebar. */

import { shortcutLabel } from '@bezier/ui';
import { type RefObject, useEffect, useRef } from 'react';
import type { SessionView } from '../session.js';
import type { ViewportHandle } from '../Viewport.js';
import { projectFacts } from './project-facts.js';
import { openReport, setReportSource } from './ReportHost.js';

const WORKSPACE_NAMES: Record<string, string> = {
  design: 'Modeling',
  visualize: 'Visualize',
  drawings: 'Drawings',
  simulation: 'Simulation',
};

/** A bug icon: body, legs and feelers. */
const MARK = (
  <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
    <path
      d="M5.5 5.5a2.5 2.5 0 0 1 5 0M5 6h6v3.2A3 3 0 0 1 8 12.2 3 3 0 0 1 5 9.200V6ZM8 6v6.200M2.5 7.5H5M11 7.500h2.500M2.500 11.500 5 10.300M13.500 11.500 11 10.300M3.500 4 5.300 5.300M12.500 4 10.700 5.300"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.3"
    />
  </svg>
);

export function ReportButton({
  className,
  label,
  workspace,
  handleRef,
  view,
}: {
  className?: string;
  /** Text beside the mark, where the button is a row in a list. */
  label?: string;
  /** The editor's workspace, named in the report; absent on the start page. */
  workspace?: string;
  /** The 3D view, to take the picture from. */
  handleRef?: RefObject<ViewportHandle | null>;
  /** The open project, for the report's size details, never its contents. */
  view?: SessionView | null;
}) {
  // Read when the report opens, not at render: the project changes under the button.
  const viewRef = useRef(view);
  viewRef.current = view;
  // Records this screen as the report's origin.
  useEffect(() => {
    return setReportSource({
      where: workspace === undefined ? 'Projects' : (WORKSPACE_NAMES[workspace] ?? 'Modeling'),
      capture:
        handleRef === undefined
          ? null
          : async () => (await handleRef.current?.capture({ scale: 1 })) ?? null,
      facts: () => projectFacts(workspace ?? 'Projects', viewRef.current ?? null),
    });
  }, [workspace, handleRef]);
  return (
    <button
      aria-label="Report a problem"
      className={className ?? 'titlebar__report'}
      onClick={() => openReport()}
      title={`Report a problem (${shortcutLabel('Shift+Cmd+R')})`}
      type="button"
    >
      {MARK}
      {label !== undefined && <span>{label}</span>}
    </button>
  );
}
