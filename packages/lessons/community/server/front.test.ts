import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { createFront } from './front.js';

const echo = (name: string) =>
  createServer((request, response) => response.end(`${name} ${request.url}`));

const front = createFront({ lessons: echo('lessons'), plugins: echo('plugins') });
await new Promise<void>((resolve) => front.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(front.address() as AddressInfo).port}`;
const get = async (path: string) => {
  const response = await fetch(base + path);
  return { status: response.status, text: await response.text() };
};

afterAll(() => front.close());

describe('the store address', () => {
  it('hands each part its own path, without the part in front', async () => {
    expect((await get('/lessons/v1/info')).text).toBe('lessons /v1/info');
    expect((await get('/plugins/v1/plugins?q=gear')).text).toBe('plugins /v1/plugins?q=gear');
    expect((await get('/lessons')).text).toBe('lessons /');
  });

  it('answers nothing else, and is not fooled by a name that only starts the same', async () => {
    expect((await get('/v1/info')).status).toBe(404);
    expect((await get('/lessonsx/v1/info')).status).toBe(404);
  });
});
