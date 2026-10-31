import { describe, expect, it } from 'vitest';
import { releaseOf, releasePage } from './updates.js';

describe('the update the updater found', () => {
  it('keeps the version, the notes and a link to the release page', () => {
    expect(
      releaseOf({ version: '0.2.0', body: ' What changed\n', date: '2026-11-01T10:00:00Z' }),
    ).toEqual({
      version: '0.2.0',
      notes: 'What changed',
      url: 'https://github.com/ProfessorEngineergit/Bezier-app/releases/tag/v0.2.0',
      published: '2026-11-01T10:00:00Z',
    });
  });

  it('copes with a release that has no notes or date', () => {
    expect(releaseOf({ version: '1.0.0' })).toMatchObject({ notes: '', published: '' });
    expect(releasePage('1.0.0')).toContain('/tag/v1.0.0');
  });
});
