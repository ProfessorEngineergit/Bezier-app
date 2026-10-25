import { expect, it } from 'vitest';
import { newSheet, parseDrawingBook } from './drawing-sheets.js';

it('reopens distinct sheet settings and source selections', () => {
  const one = newSheet('Housing');
  const two = newSheet('Housing', 2);
  two.options.author = 'Bahrian';
  two.bodies = ['body-two'];
  two.sketches = ['sketch-one'];
  const book = { version: 1, active: two.id, sheets: [one, two] };
  expect(parseDrawingBook(JSON.stringify(book))).toEqual(book);
});
it('rejects invalid persisted dimensions, duplicate ids and missing active sheets', () => {
  const sheet = newSheet('Housing');
  expect(() =>
    parseDrawingBook(JSON.stringify({ version: 1, active: sheet.id, sheets: [sheet, sheet] })),
  ).toThrow();
  expect(() =>
    parseDrawingBook(JSON.stringify({ version: 1, active: 'missing', sheets: [sheet] })),
  ).toThrow();
  sheet.options.scale = 0;
  expect(() =>
    parseDrawingBook(JSON.stringify({ version: 1, active: sheet.id, sheets: [sheet] })),
  ).toThrow();
});

it('retains movable annotation fields and still reads legacy dimensions', () => {
  const sheet = newSheet('Plate');
  sheet.dimensions = [
    { a: [10, 10], b: [20, 10], text: '10' },
    {
      a: [20, 20],
      b: [30, 20],
      text: '10 ±0.1',
      view: 'top',
      kind: 'aligned',
      offset: -12,
      along: 3,
      measured: 10,
    },
  ];
  const book = { version: 1, active: sheet.id, sheets: [sheet] };
  expect(parseDrawingBook(JSON.stringify(book))).toEqual(book);
  sheet.dimensions[1] = { a: [20, 20], b: [30, 20], text: '10', offset: Infinity };
  expect(() => parseDrawingBook(JSON.stringify(book))).toThrow();
});
