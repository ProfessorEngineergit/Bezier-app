import { describe, expect, it } from 'vitest';
import { inline, parse, plainText, safeHref } from './markdown.js';

describe('the Markdown of an article', () => {
  it('reads headings, paragraphs and lists, and keeps a numbered list in one piece', () => {
    const blocks = parse(
      '## Steps\n\nPress it.\nThen wait.\n\n1. One\n2. Two\n   goes on\n3. Three\n\n- a\n- b',
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'paragraph',
      'ordered',
      'bullets',
    ]);
    const ordered = blocks[2];
    expect(ordered?.kind === 'ordered' && ordered.items.length).toBe(3);
    expect(plainText('1. One\n2. Two\n   goes on')).toBe('One\nTwo goes on');
  });

  it('reads a quote as a note, a fence as code and a picture by its key', () => {
    expect(parse('> It keeps going.')[0]?.kind).toBe('note');
    expect(parse('```\n1. not a list\n```')).toEqual([{ kind: 'code', text: '1. not a list' }]);
    expect(parse('![The box](image:box-one)')).toEqual([{ kind: 'image', key: 'box-one' }]);
  });

  it('reads bold, italic, code, the key of an action and links', () => {
    expect(inline('**a** and *b* and `c`')).toEqual([
      { kind: 'bold', children: [{ kind: 'text', text: 'a' }] },
      { kind: 'text', text: ' and ' },
      { kind: 'italic', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' and ' },
      { kind: 'code', text: 'c' },
    ]);
    expect(inline('Press {{key:extrude}}.')[1]).toEqual({ kind: 'key', action: 'extrude' });
    expect(inline('[docs](doc:extrude)')[0]).toMatchObject({ kind: 'link', href: 'doc:extrude' });
  });

  it('draws no HTML and follows no link that could run something', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,hi')).toBeNull();
    expect(safeHref('https://example.org/a')).toBe('https://example.org/a');
    expect(inline('[x](javascript:alert(1))').some((part) => part.kind === 'link')).toBe(false);
    // HTML is not supported, so markup stays plain text.
    expect(parse('<script>alert(1)</script>')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', text: '<script>alert(1)</script>' }] },
    ]);
  });
});
