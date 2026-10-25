/**
 * Converts article Markdown to an editor document and back. Parsing uses the same reader as
 * rendering (format/markdown.ts), so the editor matches what readers see and round trips are
 * lossless.
 */

import type { Mark, Node } from 'prosemirror-model';
import { type Block, type Inline, parse } from '../format/markdown.js';
import { schema } from './schema.js';

function inlineNodes(parts: readonly Inline[], marks: readonly Mark[] = []): Node[] {
  const out: Node[] = [];
  for (const part of parts) {
    switch (part.kind) {
      case 'text':
        if (part.text !== '') out.push(schema.text(part.text, marks));
        break;
      case 'code':
        if (part.text !== '')
          out.push(schema.text(part.text, [...marks, schema.marks.code.create()]));
        break;
      case 'bold':
        out.push(...inlineNodes(part.children, [...marks, schema.marks.strong.create()]));
        break;
      case 'italic':
        out.push(...inlineNodes(part.children, [...marks, schema.marks.em.create()]));
        break;
      case 'link':
        out.push(
          ...inlineNodes(part.children, [...marks, schema.marks.link.create({ href: part.href })]),
        );
        break;
      case 'key':
        out.push(schema.nodes.key.create({ action: part.action }));
        break;
    }
  }
  return out;
}

const paragraph = (parts: readonly Inline[]) =>
  schema.nodes.paragraph.create(null, inlineNodes(parts));

function blockNode(block: Block): Node {
  switch (block.kind) {
    case 'heading':
      return schema.nodes.heading.create({ level: block.level }, inlineNodes(block.children));
    case 'paragraph':
      return paragraph(block.children);
    case 'ordered':
    case 'bullets':
      return (
        block.kind === 'ordered' ? schema.nodes.ordered_list : schema.nodes.bullet_list
      ).create(
        null,
        block.items.map((item) => schema.nodes.list_item.create(null, paragraph(item))),
      );
    case 'note':
      return schema.nodes.note.create(null, inlineNodes(block.children));
    case 'code':
      return schema.nodes.code_block.create(null, block.text === '' ? [] : schema.text(block.text));
    case 'image':
      return schema.nodes.figure.create({ key: block.key });
  }
}

export function fromMarkdown(markdown: string): Node {
  const blocks = parse(markdown).map(blockNode);
  return schema.nodes.doc.create(
    null,
    blocks.length > 0 ? blocks : [schema.nodes.paragraph.create()],
  );
}

/** Mark nesting order, outermost first; marks close in reverse. */
const RANK = ['link', 'strong', 'em', 'code'];

function inlineMarkdown(parent: Node): string {
  let out = '';
  const open: Mark[] = [];
  const close = (mark: Mark) => {
    if (mark.type.name === 'link') return `](${String(mark.attrs.href)})`;
    if (mark.type.name === 'strong') return '**';
    if (mark.type.name === 'em') return '*';
    return '`';
  };
  const start = (mark: Mark) => {
    if (mark.type.name === 'link') return '[';
    if (mark.type.name === 'strong') return '**';
    if (mark.type.name === 'em') return '*';
    return '`';
  };
  const closeTo = (keep: number) => {
    while (open.length > keep) {
      const mark = open.pop();
      if (mark !== undefined) out += close(mark);
    }
  };
  parent.forEach((child) => {
    const wanted = [...child.marks].sort(
      (a, b) => RANK.indexOf(a.type.name) - RANK.indexOf(b.type.name),
    );
    // Keep the common prefix of open marks and close the rest, innermost first.
    let same = 0;
    while (same < open.length && same < wanted.length && open[same]?.eq(wanted[same] as Mark))
      same += 1;
    closeTo(same);
    for (const mark of wanted.slice(same)) {
      out += start(mark);
      open.push(mark);
    }
    if (child.isText) out += child.text ?? '';
    else if (child.type.name === 'key') out += `{{key:${String(child.attrs.action)}}}`;
  });
  closeTo(0);
  return out;
}

export function toMarkdown(doc: Node): string {
  const blocks: string[] = [];
  doc.forEach((block) => {
    switch (block.type.name) {
      case 'heading':
        blocks.push(`${block.attrs.level === 3 ? '###' : '##'} ${inlineMarkdown(block)}`);
        break;
      case 'ordered_list':
      case 'bullet_list': {
        const lines: string[] = [];
        block.forEach((item, _offset, index) => {
          const text = item.firstChild === null ? '' : inlineMarkdown(item.firstChild);
          lines.push(`${block.type.name === 'ordered_list' ? `${index + 1}.` : '-'} ${text}`);
        });
        blocks.push(lines.join('\n'));
        break;
      }
      case 'note':
        blocks.push(`> ${inlineMarkdown(block)}`);
        break;
      case 'code_block':
        blocks.push(`\`\`\`\n${block.textContent}\n\`\`\``);
        break;
      case 'figure':
        blocks.push(`![](image:${String(block.attrs.key)})`);
        break;
      default: {
        const text = inlineMarkdown(block);
        // Empty paragraphs do not exist in Markdown.
        if (text.trim() !== '') blocks.push(text);
      }
    }
  });
  return blocks.join('\n\n');
}
