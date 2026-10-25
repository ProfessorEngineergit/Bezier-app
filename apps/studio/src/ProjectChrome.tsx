/**
 * Project UI drawn over the canvas that is not geometry: the export menu behind its title-bar
 * button, and the collaborators in a shared project.
 *
 * Project notices are registered with the shell's notification feed here, keeping their
 * app-owned lifetime while the title bar renders them.
 */

import type { Notice } from '@bezier/ui';
import { useNotificationSource } from '@bezier/ui';
import { ProjectPeople } from './collab/ProjectPeople.js';
import { ExportMenu } from './ExportMenu.js';
import type { ExportFormat } from './use-export.js';

export interface ProjectChromeProps {
  exportOpen: boolean;
  onCloseExport: () => void;
  onExport: (format: ExportFormat, onlySelected: boolean) => void;
  /** Number of picked bodies, so the menu can offer exporting just those. */
  selectedBodies: number;
  /** Whether a sketch is open or selected, for DXF and SVG. */
  hasSketch: boolean;
  notices: readonly Notice[];
  onDismiss: (id: string) => void;
}

export function ProjectChrome({
  exportOpen,
  onCloseExport,
  onExport,
  selectedBodies,
  hasSketch,
  notices,
  onDismiss,
}: ProjectChromeProps) {
  useNotificationSource(notices, onDismiss);

  return (
    <>
      <ProjectPeople />
      {exportOpen && (
        // Anchored to the right edge, under the button that opened it.
        <div className="menu__anchor menu__anchor--right">
          <ExportMenu
            hasSketch={hasSketch}
            onClose={onCloseExport}
            onPick={onExport}
            selectedBodies={selectedBodies}
          />
        </div>
      )}
    </>
  );
}
