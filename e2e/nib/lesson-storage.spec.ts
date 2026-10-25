import { fileURLToPath } from 'node:url';
import { expect, test } from '../fixtures.js';

const modulePath = (file: string) =>
  `/@fs${fileURLToPath(new URL(file, import.meta.url)).replaceAll('\\', '/')}`;

test('lesson posters round-trip as bytes and failed transactions roll back without a second rejection', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(
    async (paths) => {
      const database: typeof import('../../packages/lessons/src/store/database.js') = await import(
        paths.database
      );
      const library: typeof import('../../packages/lessons/src/store/library.js') = await import(
        paths.library
      );
      const id = crypto.randomUUID();
      await library.putPoster(id, new Blob(['poster bytes'], { type: 'image/jpeg' }));
      const poster = await library.getPoster(id);
      const spec = { name: `transaction-${id}`, version: 1, stores: { entries: {} } };
      let failed = '';
      try {
        await database.transact(spec, 'entries', 'readwrite', async (store) => {
          await database.request(store('entries').put('first write', 'key'));
          throw new Error('Cancel the edit');
        });
      } catch (error) {
        failed = error instanceof Error ? error.message : '';
      }
      const count = await database.transact(spec, 'entries', 'readonly', (store) =>
        database.request(store('entries').count()),
      );
      let cloneFailure = '';
      try {
        await database.transact(spec, 'entries', 'readwrite', (store) =>
          database.request(store('entries').put(() => undefined, 'invalid')),
        );
      } catch (error) {
        cloneFailure = error instanceof DOMException ? error.name : '';
      }
      return { poster: await poster?.text(), type: poster?.type, failed, count, cloneFailure };
    },
    {
      database: modulePath('../../packages/lessons/src/store/database.ts'),
      library: modulePath('../../packages/lessons/src/store/library.ts'),
    },
  );
  expect(result).toEqual({
    poster: 'poster bytes',
    type: 'image/jpeg',
    failed: 'Cancel the edit',
    count: 0,
    cloneFailure: 'DataCloneError',
  });
});
