/**
 * Glass pill at the top of the canvas showing who else is in the open shared project and whether
 * edits are syncing. A click opens `ProjectChanges`. Renders
 * nothing for unshared projects.
 */

import { useState } from 'react';
import { useCollab } from './CollabProvider.js';
import { ProjectChanges } from './ProjectChanges.js';

export function ProjectPeople() {
  const { openProject } = useCollab();
  const [open, setOpen] = useState(false);
  if (openProject === null) return null;
  const { present, status, readOnly } = openProject;
  const offline = status === 'offline';
  return (
    <div className="collab-presence__anchor">
      <button
        aria-expanded={open}
        className="collab-presence"
        data-offline={offline ? '' : undefined}
        data-testid="project-people"
        onClick={() => setOpen((o) => !o)}
        title="Changes and branches"
        type="button"
      >
        <span className="collab-presence__state">
          {offline
            ? 'Offline. Your changes wait on this device.'
            : readOnly
              ? 'Live, view only'
              : 'Live'}
        </span>
        {present.map((person) => (
          <span
            className="collab-presence__person"
            key={person.device}
            title={`${person.name} is ${person.mode} on ${person.machine}`}
          >
            <b aria-hidden="true">{initials(person.name)}</b>
            <span>
              {person.name} <small>on {person.machine}</small>
            </span>
          </span>
        ))}
      </button>
      {open && <ProjectChanges onClose={() => setOpen(false)} project={openProject} />}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
