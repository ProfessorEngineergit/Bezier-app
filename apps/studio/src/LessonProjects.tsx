/**
 * Projects built while following lessons, shown on the Learn page below the lessons. They use the
 * start page's project cards and open like any project, but are not listed among the projects.
 * "Save as Project" in a card's menu copies one there (lesson-project.ts).
 */

import type { DocumentInfo } from './boot.js';
import type { CardDragHandlers } from './card-drag.js';
import { DashboardCard } from './DashboardCard.js';
import type { ProjectAction } from './project-menu.js';

/** Drag handlers that do nothing: lesson projects cannot be dropped into folders. */
const FIXED: CardDragHandlers = {
  count: 1,
  accepts: () => false,
  onStart: () => undefined,
  onTarget: () => undefined,
  onDrop: () => undefined,
  onEnd: () => undefined,
};

export function LessonProjects({
  documents,
  thumbnails,
  onOpen,
  onRename,
  onAction,
  selected,
  onToggleSelected,
}: {
  /** Selected with a modifier or a rectangle, as on the projects page. */
  selected: ReadonlySet<string>;
  onToggleSelected: (id: string) => void;
  documents: readonly DocumentInfo[];
  thumbnails: Readonly<Record<string, string>>;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onAction: (action: ProjectAction, doc: DocumentInfo, origin?: { x: number; y: number }) => void;
}) {
  if (documents.length === 0) return null;
  return (
    <section aria-label="Your lesson projects" className="library__section library__section--after">
      <header className="library__head">
        <h2>Your Lesson Projects</h2>
        <span className="library__count">
          {documents.length === 1 ? '1 project' : `${documents.length} projects`}
        </span>
      </header>
      <div className="library__grid">
        {documents.map((doc) => (
          <DashboardCard
            doc={doc}
            drag={FIXED}
            dragging={false}
            key={doc.id}
            onAction={(action, origin) => onAction(action, doc, origin)}
            onOpen={() => onOpen(doc.id)}
            onRename={(name) => onRename(doc.id, name)}
            onToggleSelected={() => onToggleSelected(doc.id)}
            selected={selected.has(doc.id)}
            {...(thumbnails[doc.id] === undefined ? {} : { thumbnail: thumbnails[doc.id] })}
          />
        ))}
      </div>
    </section>
  );
}
