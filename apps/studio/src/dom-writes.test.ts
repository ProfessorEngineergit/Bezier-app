import { describe, expect, it } from 'vitest';
import { px, setAttr, setStyle } from './dom-writes.js';

/** An element that counts what is written to it. */
function counted() {
  const writes: string[] = [];
  const element = {
    style: { setProperty: (name: string, value: string) => writes.push(`${name}=${value}`) },
    setAttribute: (name: string, value: string) => writes.push(`@${name}=${value}`),
  };
  return { element: element as unknown as HTMLElement, writes };
}

describe('writes once a frame', () => {
  it('writes a value once and not again while it stays the same', () => {
    const { element, writes } = counted();
    setStyle(element, 'transform', 'translate(1px, 2px)');
    setStyle(element, 'transform', 'translate(1px, 2px)');
    setAttr(element, 'x1', '4');
    setAttr(element, 'x1', '4');
    expect(writes).toEqual(['transform=translate(1px, 2px)', '@x1=4']);
  });

  it('writes again when the value changes, and keeps style and attribute apart', () => {
    const { element, writes } = counted();
    setStyle(element, 'left', '3px');
    setAttr(element, 'left', '3px');
    setStyle(element, 'left', '4px');
    expect(writes).toEqual(['left=3px', '@left=3px', 'left=4px']);
  });

  it('puts screen positions on whole pixels', () => {
    expect(px(10.5)).toBe('11px');
    expect(px(-2.4)).toBe('-2px');
  });
});
