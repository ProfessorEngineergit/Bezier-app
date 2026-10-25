import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readDocsConfig } from './config.js';
import { createDocsApp } from './http.js';
import { DocsStore } from './store.js';

// A minimal 1x1 PNG; the server only checks the signature.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==',
  'base64',
);

let dir: string;
let store: DocsStore;
let base: string;
let server: ReturnType<typeof createDocsApp>;
const AUTHOR = 'author-token-author-token';
const OTHER = 'other-token-other-token-x';
const REVIEWER = 'reviewer-token-reviewer-x';

const article = (over: Record<string, unknown> = {}, pictures: Record<string, unknown> = {}) => ({
  article: {
    id: 'wireframe-help',
    title: 'Wireframe help',
    area: 'View',
    summary: 'How to see only the edges.',
    keywords: 'wireframe edges',
    body: '1. Press Display.\n2. Choose Wireframe.',
    ...over,
  },
  images: pictures,
});

const send = (path: string, token: string | null, payload?: unknown) =>
  fetch(base + path, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: {
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'docs-test-'));
  store = new DocsStore(dir);
  store.createAccount('Ada', 'author', 10, AUTHOR);
  store.createAccount('Bo', 'author', 10, OTHER);
  store.createAccount('Rae', 'reviewer', 10, REVIEWER);
  server = createDocsApp({ ...readDocsConfig(), origins: ['*'] }, store, ['badword']);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the wiki server', () => {
  it('publishes a change at once, as a wiki does', async () => {
    const sent = await send('/v1/docs', AUTHOR, article());
    expect(sent.status).toBe(201);
    const live = (await (await send('/v1/docs/wireframe-help', null)).json()) as {
      title: string;
      author: string;
    };
    expect(live).toMatchObject({ title: 'Wireframe help', author: 'Ada' });
  });

  it('lets anyone with a token change anyone’s article, and keeps every version', async () => {
    const changed = await send(
      '/v1/docs',
      OTHER,
      article({ title: 'Wireframe, the edges only', body: '1. Press Display.\n2. Wireframe.' }),
    );
    expect(changed.status).toBe(201);
    const live = (await (await send('/v1/docs/wireframe-help', null)).json()) as {
      title: string;
      author: string;
    };
    expect(live).toMatchObject({ title: 'Wireframe, the edges only', author: 'Bo' });

    const { versions } = (await (await send('/v1/docs/wireframe-help/history', null)).json()) as {
      versions: { seq: number; author: string; status: string }[];
    };
    expect(versions.map((v) => [v.author, v.status])).toEqual([
      ['Bo', 'approved'],
      ['Ada', 'superseded'],
    ]);
    const first = versions[1]?.seq ?? 0;
    const old = (await (await send(`/v1/docs/wireframe-help/versions/${first}`, null)).json()) as {
      title: string;
    };
    expect(old.title).toBe('Wireframe help');
  });

  it('puts an earlier version back, as a change by whoever does it', async () => {
    const { versions } = (await (await send('/v1/docs/wireframe-help/history', null)).json()) as {
      versions: { seq: number }[];
    };
    const first = versions.at(-1)?.seq ?? 0;
    expect((await send('/v1/docs/wireframe-help/restore', null, { seq: first })).status).toBe(401);
    const restored = await send('/v1/docs/wireframe-help/restore', REVIEWER, { seq: first });
    expect(restored.status).toBe(201);
    const live = (await (await send('/v1/docs/wireframe-help', null)).json()) as {
      title: string;
      author: string;
    };
    expect(live).toMatchObject({ title: 'Wireframe help', author: 'Rae' });
    expect((await send('/v1/docs/wireframe-help/restore', AUTHOR, { seq: 999_999 })).status).toBe(
      404,
    );
  });

  it('refuses a picture that is not one, a picture the text does not use, and words it will not have', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
    ).toString('base64');
    const body = '![x](image:one)\n\nText.';
    expect(
      (
        await send(
          '/v1/docs',
          AUTHOR,
          article({ id: 'p1', body }, { one: { data: svg, alt: 'x', arrows: [] } }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await send(
          '/v1/docs',
          AUTHOR,
          article({ id: 'p2' }, { one: { data: PNG.toString('base64'), alt: 'x', arrows: [] } }),
        )
      ).status,
    ).toBe(422);
    expect(
      (await send('/v1/docs', AUTHOR, article({ id: 'p3', body: 'badword here' }))).status,
    ).toBe(422);
    expect(
      (await send('/v1/docs', AUTHOR, article({ id: 'p4', body: 'See https://example.org' })))
        .status,
    ).toBe(422);
    expect((await send('/v1/docs', null, article({ id: 'p5' }))).status).toBe(401);
  });

  it('serves the pictures of every version, with the type their bytes have', async () => {
    const body = 'Look.\n\n![The box](image:box)';
    const pictures = {
      box: {
        data: PNG.toString('base64'),
        alt: 'The box',
        arrows: [{ x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5 }],
      },
    };
    expect(
      (await send('/v1/docs', AUTHOR, article({ id: 'with-picture', body }, pictures))).status,
    ).toBe(201);
    const live = (await (await send('/v1/docs/with-picture', null)).json()) as {
      images: { box: { src: string; arrows: unknown[] } };
    };
    expect(live.images.box.arrows).toHaveLength(1);
    // A later version drops the picture; it is still served for the earlier version.
    await send('/v1/docs', OTHER, article({ id: 'with-picture', body: 'No picture now.' }));
    const served = await send(live.images.box.src, null);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
  });

  it('finds an article by the words in it', async () => {
    const found = (await (await send('/v1/docs?q=help', null)).json()) as {
      articles: { id: string }[];
    };
    expect(found.articles.map((a) => a.id)).toContain('wireframe-help');
    expect(found.articles.map((a) => a.id)).not.toContain('p3');
  });
});
