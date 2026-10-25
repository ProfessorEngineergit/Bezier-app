import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLeaderboardApp, standings } from './leaderboard.js';

describe('the leaderboard', () => {
  it('adds what each author has had listed by the points table, and ranks by it', () => {
    const board = standings({
      lessons: () => [
        { author: 'Ada', count: 2 },
        { author: 'Bo', count: 1 },
      ],
      plugins: () => [{ author: 'Bo', count: 1 }],
      docs: () => [{ author: 'Cy', count: 4 }],
    });
    expect(board.map((s) => [s.name, s.points])).toEqual(
      [
        ['Ada', 100],
        ['Bo', 100],
        ['Cy', 120],
      ].sort(
        (a, b) => (b[1] as number) - (a[1] as number) || String(a[0]).localeCompare(String(b[0])),
      ),
    );
    expect(board[0]).toMatchObject({ name: 'Cy', articles: 4, level: 'Extrude' });
  });

  it('breaks a tie by name and shows nobody with nothing listed', () => {
    const board = standings({
      lessons: () => [{ author: 'Zed', count: 1 }],
      plugins: () => [{ author: 'Abe', count: 1 }],
      docs: () => [],
    });
    expect(board.map((s) => s.name)).toEqual(['Abe', 'Zed']);
  });
});

describe('who may read the leaderboard from a page', () => {
  const sources = {
    lessons: () => [{ author: 'Ada', count: 1 }],
    plugins: () => [],
    docs: () => [],
  };
  const listed = createLeaderboardApp(sources, ['tauri://localhost', 'http://tauri.localhost']);
  const open = createLeaderboardApp(sources);
  const base = { listed: '', open: '' };

  beforeAll(async () => {
    for (const [key, server] of [
      ['listed', listed],
      ['open', open],
    ] as const) {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      base[key] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    }
  });
  afterAll(() => {
    listed.close();
    open.close();
  });

  const get = (url: string, origin?: string, method = 'GET') =>
    fetch(url, { method, headers: origin ? { Origin: origin } : {} });

  it('answers the desktop app by its own origin, on every platform', async () => {
    for (const origin of ['tauri://localhost', 'http://tauri.localhost']) {
      const res = await get(`${base.listed}/v1/authors`, origin);
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      expect(res.headers.get('vary')).toBe('Origin');
      expect((await res.json()).authors[0].name).toBe('Ada');
    }
  });

  it('gives an origin it does not list the data but no permission to read it', async () => {
    const res = await get(`${base.listed}/v1/authors`, 'https://elsewhere.example');
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers a preflight for a listed origin, and only with GET', async () => {
    const res = await get(`${base.listed}/v1/authors`, 'tauri://localhost', 'OPTIONS');
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('tauri://localhost');
    expect(res.headers.get('access-control-allow-methods')).toBe('GET');
    const foreign = await get(`${base.listed}/v1/authors`, 'https://elsewhere.example', 'OPTIONS');
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('with no list, lets any page read it', async () => {
    const res = await get(`${base.open}/v1/authors`, 'https://elsewhere.example');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
