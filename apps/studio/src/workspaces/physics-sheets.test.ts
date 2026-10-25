import { describe, expect, it } from 'vitest';
import { SHEET_MARGIN, TITLE_H } from './DrawingTitleBlock.js';
import { sheetSize } from './drawing-sheet.js';
import { newSheet, parseDrawingBook } from './drawing-sheets.js';
import { physicsLayout, wrap } from './physics-layout.js';
import { type PhysicsContent, parsePhysics } from './physics-sheets.js';

const PNG = 'data:image/png;base64,AAAA';

function content(patch: Partial<PhysicsContent> = {}): PhysicsContent {
  return {
    study: 'Static Stress 1',
    created: '2026-10-14',
    notes: '',
    layout: 'grid',
    main: 3,
    legend: { label: 'Von Mises Stress', unit: 'MPa', min: 0, max: 2.4, palette: 'rainbow' },
    readings: [['Max stress', '2.4 MPa']],
    setup: [['Material', 'PLA']],
    views: ['Front', 'Top', 'Right', 'Iso'].map((label) => ({
      label,
      image: PNG,
      shown: true,
      aspect: 1.6,
    })),
    show: { legend: true, readings: true, setup: true, notes: true },
    ...patch,
  };
}

describe('physics drawings are drawing sheets', () => {
  it('come back from the stored book with their content', () => {
    const drawing = newSheet('Bracket');
    const physics = { ...newSheet('Bracket', 2), physics: content() };
    const book = { version: 1, active: physics.id, sheets: [drawing, physics] };
    const read = parseDrawingBook(JSON.stringify(book));
    expect(read.sheets[0]?.physics).toBeUndefined();
    expect(read.sheets[1]?.physics).toEqual(content());
  });

  it('keep only pictures that are pictures', () => {
    const stored = content({
      views: [{ label: 'Front', image: 'javascript:alert(1)', shown: true, aspect: 1 }],
    });
    expect(parsePhysics(stored)?.views).toEqual([]);
  });

  it('are refused as a whole when the content is not content at all', () => {
    const broken = { ...newSheet('Bracket'), physics: 'not content' };
    const book = { version: 1, active: broken.id, sheets: [broken] };
    expect(() => parseDrawingBook(JSON.stringify(book))).toThrow();
  });
});

describe('physics layout', () => {
  it('puts four pictures two by two inside the frame, left of the column and above the title block', () => {
    const [width, height] = sheetSize('A3');
    const layout = physicsLayout(content(), width, height);
    expect(layout.views).toHaveLength(4);
    for (const view of layout.views) {
      expect(view.x).toBeGreaterThanOrEqual(SHEET_MARGIN);
      expect(view.x + view.width).toBeLessThanOrEqual(layout.column.x);
      expect(view.y + view.height).toBeLessThanOrEqual(height - SHEET_MARGIN - TITLE_H);
    }
    expect(layout.column.y + layout.column.height).toBeLessThanOrEqual(
      height - SHEET_MARGIN - TITLE_H,
    );
    expect(new Set(layout.views.map((v) => Math.round(v.y))).size).toBe(2);
  });

  it('makes the chosen picture the large one, and leaves out hidden ones', () => {
    const [width, height] = sheetSize('A3');
    const views = content().views.map((v, i) => ({ ...v, shown: i !== 1 }));
    const layout = physicsLayout(content({ layout: 'feature', main: 3, views }), width, height);
    expect(layout.views.map((v) => v.index)).toEqual([3, 0, 2]);
    const [big, small] = layout.views;
    expect((big?.width ?? 0) * (big?.height ?? 0)).toBeGreaterThan(
      (small?.width ?? 0) * (small?.height ?? 0) * 3,
    );
  });

  it('wraps notes at spaces', () => {
    expect(wrap('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });
});

describe('physics preview', () => {
  it('draws a rectangle for every shown picture and one for the column', async () => {
    const { physicsPreview } = await import('./physics-layout.js');
    const [width, height] = sheetSize('A3');
    const views = content().views.map((v, i) => ({ ...v, shown: i !== 2 }));
    const preview = physicsPreview(content({ views }), width, height);
    expect(preview.map((v) => v.name)).toEqual(['Front', 'Top', 'Iso', 'column']);
    for (const view of preview) expect(view.lines[0]?.points).toHaveLength(10);
  });
});
