import { afterEach, describe, expect, it, vi } from 'vitest';
import { filmSources } from './film.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const as = (userAgent: string) => vi.stubGlobal('navigator', { userAgent });

describe('which file of the film is tried first', () => {
  it('tries the VP9 one first on Linux, where the H.264 one cannot be decoded', () => {
    as('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)');
    expect(filmSources('/film/intro.mp4')).toEqual(['/film/intro.webm', '/film/intro.mp4']);
  });

  it('in the Linux app, the file the app serves beside it first', () => {
    as('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)');
    const served = 'http://127.0.0.1:41234/intro.webm';
    expect(filmSources('/film/intro.mp4', served)[0]).toBe(served);
  });

  it('in the Windows app, the file the app serves beside it first, then its own two', () => {
    as('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/141.0');
    const served = 'http://127.0.0.1:41234/intro.webm';
    expect(filmSources('/film/intro.mp4', served)).toEqual([
      served,
      '/film/intro.mp4',
      '/film/intro.webm',
    ]);
  });

  it('tries the H.264 one first on a Mac and on Windows', () => {
    as('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15');
    expect(filmSources('/film/intro.mp4')).toEqual(['/film/intro.mp4', '/film/intro.webm']);
    as('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/141.0');
    expect(filmSources('/film/intro.mp4')).toEqual(['/film/intro.mp4', '/film/intro.webm']);
  });

  it('plays a film from elsewhere as it is, and none when there is none', () => {
    as('Mozilla/5.0 (X11; Linux x86_64)');
    expect(filmSources('https://example.com/a.mp4')).toEqual(['https://example.com/a.mp4']);
    expect(filmSources('')).toEqual([]);
  });
});
