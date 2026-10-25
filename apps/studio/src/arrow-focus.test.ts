import { describe, expect, it } from 'vitest';
import { nextInGrid, nextInList, nextOnScreen } from './arrow-focus.js';

// Three columns, the last row short: 0 1 2 / 3 4
const grid = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 400, y: 0 },
  { x: 0, y: 180 },
  { x: 200, y: 180 },
];

describe('arrow keys on the start page', () => {
  it('stops at the ends of a list', () => {
    expect(nextInList(3, 2, 'ArrowDown')).toBe(2);
    expect(nextInList(3, 0, 'ArrowUp')).toBe(0);
    expect(nextInList(3, 1, 'Home')).toBe(0);
    expect(nextInList(3, 1, 'End')).toBe(2);
  });

  it('enters a list from outside at the nearer end', () => {
    expect(nextInList(3, -1, 'ArrowDown')).toBe(0);
    expect(nextInList(3, -1, 'ArrowUp')).toBe(2);
  });

  it('moves within a row and stops at its end', () => {
    expect(nextInGrid(grid, 0, 'ArrowRight')).toBe(1);
    expect(nextInGrid(grid, 2, 'ArrowRight')).toBe(-1);
    expect(nextInGrid(grid, 3, 'ArrowLeft')).toBe(-1);
  });

  it('goes down to the nearest card when the row below is short', () => {
    expect(nextInGrid(grid, 1, 'ArrowDown')).toBe(4);
    expect(nextInGrid(grid, 2, 'ArrowDown')).toBe(4);
    expect(nextInGrid(grid, 4, 'ArrowUp')).toBe(1);
  });
});

describe('arrow keys across the whole page', () => {
  // A sidebar of three rows, a list of two beside it, and a row of two cards below the list.
  const boxes = [
    { x: 0, y: 0, width: 150, height: 30 }, // 0 All Projects
    { x: 0, y: 40, width: 150, height: 30 }, // 1 Learn
    { x: 0, y: 80, width: 150, height: 30 }, // 2 Community
    { x: 200, y: 0, width: 150, height: 30 }, // 3 General
    { x: 200, y: 40, width: 150, height: 30 }, // 4 Appearance
    { x: 200, y: 200, width: 100, height: 100 }, // 5 card
    { x: 320, y: 200, width: 100, height: 100 }, // 6 card
  ];

  it('goes left from a list to the sidebar row it is level with', () => {
    expect(nextOnScreen(boxes, 3, 'ArrowLeft')).toBe(0);
    expect(nextOnScreen(boxes, 4, 'ArrowLeft')).toBe(1);
  });

  it('goes right from the sidebar to what is beside it', () => {
    expect(nextOnScreen(boxes, 1, 'ArrowRight')).toBe(4);
    expect(nextOnScreen(boxes, 2, 'ArrowRight')).toBe(4);
  });

  it('goes down and up within a column and stops at its ends', () => {
    expect(nextOnScreen(boxes, 0, 'ArrowDown')).toBe(1);
    expect(nextOnScreen(boxes, 2, 'ArrowDown')).toBe(-1);
    expect(nextOnScreen(boxes, 1, 'ArrowUp')).toBe(0);
    expect(nextOnScreen(boxes, 0, 'ArrowUp')).toBe(-1);
  });

  it('does not count what only overlaps the current one as next', () => {
    const stacked = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 10, y: 10, width: 100, height: 100 },
    ];
    expect(nextOnScreen(stacked, 0, 'ArrowRight')).toBe(-1);
  });
});
