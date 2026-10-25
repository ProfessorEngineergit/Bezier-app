/**
 * Settings → Contribute: links for reporting a problem or finding the source of a feature. Reports
 * start with the version and system prefilled.
 */

import { openExternal } from './open-external.js';
import { Group } from './PrefsControls.js';

/** The repository for pull requests and issues. */
export const REPOSITORY = 'https://github.com/ProfessorEngineergit/bezier';

/** Where each part of the app lives, as repository paths. */
const PLACES: readonly (readonly [string, string, string])[] = [
  [
    'This start page and Settings',
    'apps/studio/src',
    'Projects, folders, search, the page you are on',
  ],
  ['Sketching and the tools', 'packages/ui/src', 'Lines, arcs, constraints, gizmos, panels'],
  ['What you see in the viewport', 'packages/renderer/src', 'Edges, shading, picking, the camera'],
  ['The model itself', 'packages/core/src', 'Features, rebuild, how a face keeps its name'],
  ['The geometry engine', 'packages/kernel/src', 'Open CASCADE: extrude, fillet, booleans, STEP'],
  ['Learn', 'packages/lessons/src', 'Recording, following and editing lessons'],
];

function system(): string {
  const agent = navigator.userAgent;
  if (/Mac/.test(agent)) return 'macOS';
  if (/Windows/.test(agent)) return 'Windows';
  if (/Linux/.test(agent)) return 'Linux';
  return 'Unknown';
}

function issue(kind: 'bug' | 'idea', version: string): string {
  const body =
    kind === 'bug'
      ? `**What happened**\n\n\n**What I expected**\n\n\n**Steps**\n1. \n\n---\nBezier ${version} · ${system()}`
      : `**What I would like**\n\n\n**Why**\n\n\n---\nBezier ${version} · ${system()}`;
  const query = new URLSearchParams({ body, labels: kind === 'bug' ? 'bug' : 'idea' });
  return `${REPOSITORY}/issues/new?${query.toString()}`;
}

export function Contribute({
  version,
  intro = true,
}: {
  version: string;
  /** Show the intro paragraph; the start page's Contribute tab has its own. */
  intro?: boolean;
}) {
  const actions: readonly (readonly [string, string, string])[] = [
    ['Something broke', 'Start a report. Version and system are filled in.', issue('bug', version)],
    ['I have an idea', 'Say what is missing or what should be easier.', issue('idea', version)],
    [
      'A good first fix',
      'Small, described problems that are waiting for someone.',
      `${REPOSITORY}/issues?q=is%3Aopen+label%3A%22good+first+issue%22`,
    ],
    [
      'Read the code',
      'All of it is public. Start with the map of the repository.',
      `${REPOSITORY}/blob/main/docs/architecture.md`,
    ],
  ];
  return (
    <>
      {intro && (
        <p className="prefs-lede">
          It’s not perfect yet. But you can help make it. If something is in your way, that is worth
          knowing, and it takes a minute to say.
        </p>
      )}
      <div className="prefs-actions">
        {actions.map(([title, detail, url]) => (
          <button
            className="prefs-action"
            key={title}
            onClick={() => openExternal(url)}
            type="button"
          >
            <b>{title}</b>
            <span>{detail}</span>
          </button>
        ))}
      </div>
      <Group label="Where it is made" note="Each row opens that folder on GitHub.">
        {PLACES.map(([what, path, detail]) => (
          <button
            className="prefs-row prefs-place"
            key={path}
            onClick={() => openExternal(`${REPOSITORY}/tree/main/${path}`)}
            type="button"
          >
            <span className="prefs-row__label">
              {what}
              <small className="prefs-row__note">{detail}</small>
            </span>
            <code>{path}</code>
          </button>
        ))}
      </Group>
    </>
  );
}
