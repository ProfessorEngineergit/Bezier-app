/**
 * A report as a GitHub issue: the user's title and body, plus version, system, app location and
 * the log tail. The issue is prefilled via URL, which has a length limit, so the log is truncated
 * to fit; the full report is also offered for copying.
 */

/** Max URL length browsers and GitHub accept, with headroom. */
const ADDRESS_LIMIT = 6000;

/** Report kinds in user-facing words, each with its issue label. */
export const KINDS = [
  { id: 'problem', label: 'Problem', filed: 'bug' },
  { id: 'rough', label: 'Rough edge', filed: 'usability' },
  { id: 'idea', label: 'Idea', filed: 'enhancement' },
] as const;
export type Kind = (typeof KINDS)[number]['id'];

export interface ReportInput {
  repository: string;
  kind?: Kind;
  title: string;
  what: string;
  version: string;
  system: string;
  where: string;
  log: string;
  /** Machine and project facts (`diagnostics.ts`), one per line. */
  diagnostics?: readonly string[];
  /** Project activity, one per line (`activity-log.ts`), when the user opted in. */
  activity?: readonly string[];
  /** Whether a picture is attached (pasted into the issue by hand). */
  picture: boolean;
}

function kindLabel(kind: Kind | undefined): string {
  const found = KINDS.find((entry) => entry.id === kind);
  return found === undefined ? '' : `${found.label} · `;
}

export function reportBody(input: ReportInput, logLines?: number): string {
  const log = input.log.split('\n').filter(Boolean);
  const kept = logLines === undefined ? log : log.slice(-logLines);
  return [
    input.what.trim() === '' ? '_(no description)_' : input.what.trim(),
    input.picture ? '\n_A picture was copied: paste it here._' : '',
    '\n---',
    `${kindLabel(input.kind)}Bezier ${input.version} · ${input.system} · ${input.where}`,
    input.diagnostics === undefined || input.diagnostics.length === 0
      ? ''
      : `\n<details><summary>This machine</summary>\n\n${input.diagnostics.map((line) => `- ${line}`).join('\n')}\n</details>`,
    input.activity === undefined || input.activity.length === 0
      ? ''
      : `\n<details><summary>What was done</summary>\n\n\`\`\`\n${input.activity.join('\n')}\n\`\`\`\n</details>`,
    kept.length === 0
      ? ''
      : `\n<details><summary>Log</summary>\n\n\`\`\`\n${kept.join('\n')}\n\`\`\`\n</details>`,
  ]
    .filter((part) => part !== '')
    .join('\n');
}

/** The new-issue URL, with the log shortened until it fits. */
export function reportUrl(input: ReportInput, trimmed = false): string {
  const make = (lines?: number) => {
    const query = new URLSearchParams({
      title: input.title.trim() === '' ? 'Report from the app' : input.title.trim(),
      body: reportBody(input, lines),
      labels: ['report', KINDS.find((entry) => entry.id === input.kind)?.filed]
        .filter((label) => label !== undefined)
        .join(','),
    });
    return `${input.repository}/issues/new?${query.toString()}`;
  };
  let lines = input.log.split('\n').filter(Boolean).length;
  let url = make(lines);
  while (url.length > ADDRESS_LIMIT && lines > 0) {
    lines = Math.floor(lines / 2);
    url = make(lines);
  }
  if (trimmed) return url;
  // Still too long: keep the end of the activity, which led to the problem.
  let tail = input.activity?.length ?? 0;
  while (url.length > ADDRESS_LIMIT && tail > 4 && input.activity !== undefined) {
    tail = Math.floor(tail / 2);
    url = reportUrl({ ...input, activity: input.activity.slice(-tail) }, true);
  }
  return url;
}
