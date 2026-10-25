/**
 * The editor schema: exactly the blocks and marks article Markdown supports (format/markdown.ts),
 * so the editor and the Markdown stay interchangeable.
 */

import { type MarkSpec, type NodeSpec, Schema } from 'prosemirror-model';

type Nodes =
  | 'doc'
  | 'paragraph'
  | 'heading'
  | 'ordered_list'
  | 'bullet_list'
  | 'list_item'
  | 'note'
  | 'code_block'
  | 'figure'
  | 'text'
  | 'key';
type Marks = 'link' | 'strong' | 'em' | 'code';

const nodes: Record<Nodes, NodeSpec> = {
  doc: { content: 'block+' },
  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM: () => ['p', 0],
  },
  heading: {
    attrs: { level: { default: 2 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [
      { tag: 'h2', attrs: { level: 2 } },
      { tag: 'h3', attrs: { level: 3 } },
    ],
    toDOM: (node) => [`h${node.attrs.level === 3 ? 3 : 2}`, 0],
  },
  ordered_list: {
    content: 'list_item+',
    group: 'block',
    parseDOM: [{ tag: 'ol' }],
    toDOM: () => ['ol', 0],
  },
  bullet_list: {
    content: 'list_item+',
    group: 'block',
    parseDOM: [{ tag: 'ul' }],
    toDOM: () => ['ul', 0],
  },
  // One paragraph per item, since a step is one Markdown line.
  list_item: {
    content: 'paragraph',
    defining: true,
    parseDOM: [{ tag: 'li' }],
    toDOM: () => ['li', 0],
  },
  note: {
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'aside' }, { tag: 'blockquote' }],
    toDOM: () => ['aside', { class: 'wiki-note' }, 0],
  },
  code_block: {
    content: 'text*',
    marks: '',
    code: true,
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
    toDOM: () => ['pre', ['code', 0]],
  },
  /** An article picture by key; rendered with its arrows by `FigureView` (views.ts). */
  figure: {
    attrs: { key: {} },
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,
    toDOM: (node) => ['figure', { 'data-key': node.attrs.key }],
    parseDOM: [
      {
        tag: 'figure[data-key]',
        getAttrs: (dom) => ({ key: (dom as HTMLElement).dataset.key }),
      },
    ],
  },
  text: { group: 'inline' },
  /** An action's key binding, shown from the active keymap. */
  key: {
    attrs: { action: {} },
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    toDOM: (node) => ['kbd', { 'data-action': node.attrs.action }],
    parseDOM: [
      {
        tag: 'kbd[data-action]',
        getAttrs: (dom) => ({ action: (dom as HTMLElement).dataset.action }),
      },
    ],
  },
};

const marks: Record<Marks, MarkSpec> = {
  link: {
    attrs: { href: {} },
    inclusive: false,
    parseDOM: [
      { tag: 'a[href]', getAttrs: (dom) => ({ href: (dom as HTMLElement).getAttribute('href') }) },
    ],
    toDOM: (mark) => ['a', { href: mark.attrs.href, class: 'wiki-link' }, 0],
  },
  strong: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
    toDOM: () => ['strong', 0],
  },
  em: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }],
    toDOM: () => ['em', 0],
  },
  code: {
    excludes: '_',
    parseDOM: [{ tag: 'code' }],
    toDOM: () => ['code', 0],
  },
};

export const schema = new Schema<Nodes, Marks>({ nodes, marks });
