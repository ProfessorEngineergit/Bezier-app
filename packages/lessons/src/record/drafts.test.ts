import { describe, expect, it } from 'vitest';
import { isManifest } from '../format/manifest.js';
import { type Draft, manifestFromDraft } from './drafts.js';

const draft: Draft = {
  id: 'draft-1',
  title: '  ',
  level: 'beginner',
  startedAt: '2026-09-28T20:05:25.808Z',
  elapsed: 12.5,
  events: [{ kind: 'key', time: 1, code: 'KeyE', key: 'e', modifiers: [] }],
  states: [{ time: 0, title: 'Start', project: '{}' }],
  viewportType: 'video/webm;codecs=vp8',
};

describe('a draft', () => {
  it('becomes a valid lesson, whole and untrimmed, with a title when it had none', () => {
    const manifest = manifestFromDraft(draft, 12.5);
    expect(isManifest(manifest)).toBe(true);
    expect(manifest.title).toBe('Untitled lesson');
    expect(manifest.cuts).toEqual([{ start: 0, end: 12.5 }]);
    expect(manifest.cameraType).toBeUndefined();
    expect(manifest.completed).toBe(false);
  });

  it('keeps the camera type when there was a camera', () => {
    expect(manifestFromDraft({ ...draft, cameraType: 'video/webm' }, 1).cameraType).toBe(
      'video/webm',
    );
  });
});
