import { describe, expect, it } from 'vitest';
import { fetchLatest, isNewer, parseRelease, parseVersion } from './updates.js';

describe('versions', () => {
  it('reads three numbers, with or without v and a suffix', () => {
    expect(parseVersion('0.2.0')).toEqual([0, 2, 0]);
    expect(parseVersion('v1.10.3')).toEqual([1, 10, 3]);
    expect(parseVersion('0.3.0-beta.1')).toEqual([0, 3, 0]);
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
  });

  it('compares numbers, not text', () => {
    expect(isNewer('0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('0.10.0', '0.9.0')).toBe(true);
    expect(isNewer('1.0.0', '0.99.99')).toBe(true);
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('0.1.0', '0.2.0')).toBe(false);
    expect(isNewer('nonsense', '0.1.0')).toBe(false);
    expect(isNewer('0.2.0', 'development')).toBe(false);
  });
});

describe('the release GitHub sends', () => {
  const answer = {
    tag_name: 'v0.2.0',
    name: 'Bezier 0.2.0',
    body: ' What changed\n',
    html_url: 'https://github.com/ProfessorEngineergit/Bezier-app/releases/tag/v0.2.0',
    published_at: '2026-11-01T10:00:00Z',
  };

  it('keeps the fields the update page shows', () => {
    expect(parseRelease(answer)).toEqual({
      version: '0.2.0',
      name: 'Bezier 0.2.0',
      notes: 'What changed',
      url: answer.html_url,
      published: '2026-11-01T10:00:00Z',
    });
  });

  it('refuses an answer without a version, and a page that is not on GitHub', () => {
    expect(parseRelease({ ...answer, tag_name: 'nightly' })).toBeNull();
    expect(parseRelease({ ...answer, html_url: 'https://example.com/x' })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });

  it('reports a failed request instead of guessing', async () => {
    const failing = (async () => new Response('', { status: 403 })) as typeof fetch;
    await expect(fetchLatest(failing)).rejects.toThrow('403');
    const good = (async () => new Response(JSON.stringify(answer))) as typeof fetch;
    await expect(fetchLatest(good)).resolves.toMatchObject({ version: '0.2.0' });
  });
});
