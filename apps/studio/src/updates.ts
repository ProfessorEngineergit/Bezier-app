/** What Settings → Updates shows about a newer version. */

export interface Release {
  version: string;
  /** What changed, as written in the release notes. */
  notes: string;
  /** The release page on GitHub, where the installers are. */
  url: string;
  published: string;
}

export const releasePage = (version: string): string =>
  `https://github.com/ProfessorEngineergit/Bezier-app/releases/tag/v${version}`;

/** The update the updater found, as the page needs it. */
export function releaseOf(update: { version: string; body?: string; date?: string }): Release {
  return {
    version: update.version,
    notes: (update.body ?? '').trim(),
    url: releasePage(update.version),
    published: update.date ?? '',
  };
}
