import { afterEach, describe, expect, it, vi } from 'vitest';
import { readServerParts, serverBase } from './server-parts.js';

const answer = (body: BodyInit, type = 'application/json') =>
  new Response(body, { headers: { 'content-type': type } });

describe('the address of a parts server', () => {
  it('is HTTPS, or plain only on this machine', () => {
    expect(serverBase('https://parts.example.org/screws')?.href).toBe(
      'https://parts.example.org/screws/',
    );
    expect(serverBase('http://localhost:8080')).not.toBeNull();
    expect(serverBase('http://parts.example.org')).toBeNull();
    expect(serverBase('file:///etc/passwd')).toBeNull();
    expect(serverBase('https://user:secret@parts.example.org')).toBeNull();
    expect(serverBase('nonsense')).toBeNull();
  });
});

describe('reading a parts server', () => {
  afterEach(() => vi.unstubAllGlobals());
  const serve = (files: Record<string, () => Response>) => {
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL, init: RequestInit) => {
        asked.push(url.href);
        expect(init.credentials).toBe('omit');
        expect(init.redirect).toBe('error');
        return files[url.pathname]?.() ?? new Response('', { status: 404 });
      }),
    );
    return asked;
  };

  it('never leaves the folder, whatever the list says', async () => {
    const asked = serve({
      '/parts.json': () =>
        answer(
          JSON.stringify({
            parts: [
              { name: 'Good', model: 'good.step', picture: 'good.png' },
              { name: 'Up', model: '../../secret.step' },
              { name: 'Away', model: 'https://other.example/x.step' },
              { name: 'Hidden', model: '.env' },
              { name: 'Vector', model: 'v.step', picture: 'p.svg' },
            ],
          }),
        ),
      '/good.png': () => answer(new Blob(['x']), 'image/png'),
      '/p.svg': () => answer('<svg onload="alert(1)"/>', 'image/svg+xml'),
    });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:picture' }));
    const parts = await readServerParts('https://parts.example.org');
    expect(parts.map((part) => part.name)).toEqual(['Good', 'Vector']);
    expect(parts[0]?.picture).toBe('blob:picture');
    expect(parts[1]?.picture).toBeNull();
    expect(asked.every((url) => url.startsWith('https://parts.example.org/'))).toBe(true);
  });

  it('refuses a list that is too large before reading it', async () => {
    serve({
      '/parts.json': () =>
        new Response('{}', { headers: { 'content-length': String(1024 * 1024 * 2) } }),
    });
    await expect(readServerParts('https://parts.example.org')).rejects.toThrow('larger');
  });

  it('says so when there is no list', async () => {
    serve({ '/parts.json': () => answer('{}') });
    await expect(readServerParts('https://parts.example.org')).rejects.toThrow('parts.json');
  });
});
