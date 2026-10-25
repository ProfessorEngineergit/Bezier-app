/**
 * Parser for the article Markdown subset: headings, paragraphs, ordered and bulleted lists, quotes
 * (notes), code, bold, italic, links, pictures and action keys. No HTML, so untrusted articles are
 * safe to render. Rendering lives in `ui/Article.tsx`.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; children: Inline[] }
  | { kind: 'italic'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] }
  /** An action's key binding from the active keymap: `{{key:extrude}}`. */
  | { kind: 'key'; action: string };

export type Block =
  | { kind: 'heading'; level: 2 | 3; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'ordered'; items: Inline[][] }
  | { kind: 'bullets'; items: Inline[][] }
  | { kind: 'note'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'image'; key: string };

/** Allows only web links and `doc:` article links; returns null for anything else. */
export function safeHref(href: string): string | null {
  if (/^doc:[a-z0-9-]+$/.test(href)) return href;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const TOKEN =
  /`([^`]+)`|\*\*(.+?)\*\*|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])|\[([^\]]+)\]\(([^)\s]+)\)|\{\{key:([a-z0-9-]+)\}\}/g;

export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > at) out.push({ kind: 'text', text: text.slice(at, index) });
    const [, code, bold, italic, label, href, action] = match;
    if (code !== undefined) out.push({ kind: 'code', text: code });
    else if (bold !== undefined) out.push({ kind: 'bold', children: inline(bold) });
    else if (italic !== undefined) out.push({ kind: 'italic', children: inline(italic) });
    else if (label !== undefined && href !== undefined) {
      const safe = safeHref(href);
      // An unsafe link is rendered as its label only.
      if (safe === null) out.push(...inline(label));
      else out.push({ kind: 'link', href: safe, children: inline(label) });
    } else if (action !== undefined) out.push({ kind: 'key', action });
    at = index + match[0].length;
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) });
  return out;
}

const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const IMAGE = /^!\[[^\]]*\]\(image:([a-z0-9-]+)\)\s*$/;

export function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0)
      blocks.push({ kind: 'paragraph', children: inline(paragraph.join(' ')) });
    paragraph = [];
  };

  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at] ?? '';
    if (line.trim().startsWith('```')) {
      flush();
      const code: string[] = [];
      at += 1;
      while (at < lines.length && !(lines[at] ?? '').trim().startsWith('```')) {
        code.push(lines[at] ?? '');
        at += 1;
      }
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    const picture = IMAGE.exec(line.trim());
    if (picture?.[1] !== undefined) {
      flush();
      blocks.push({ kind: 'image', key: picture[1] });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading?.[1] !== undefined && heading[2] !== undefined) {
      flush();
      // `#` would compete with the article title, so it maps to level 2 like `##`.
      blocks.push({
        kind: 'heading',
        level: heading[1].length >= 3 ? 3 : 2,
        children: inline(heading[2]),
      });
      continue;
    }
    if (ORDERED.test(line) || BULLET.test(line)) {
      flush();
      const ordered = ORDERED.test(line);
      const items: Inline[][] = [];
      for (; at < lines.length; at += 1) {
        const item = (ordered ? ORDERED : BULLET).exec(lines[at] ?? '');
        if (item?.[1] === undefined) {
          // An indented continuation line of the previous item.
          const more = lines[at] ?? '';
          if (
            /^\s{2,}\S/.test(more) &&
            items.length > 0 &&
            !ORDERED.test(more) &&
            !BULLET.test(more)
          ) {
            items.push(inline(`${plain(items.pop() ?? [])} ${more.trim()}`));
            continue;
          }
          break;
        }
        items.push(inline(item[1]));
      }
      at -= 1;
      blocks.push(ordered ? { kind: 'ordered', items } : { kind: 'bullets', items });
      continue;
    }
    if (line.startsWith('>')) {
      flush();
      const quote: string[] = [];
      for (; at < lines.length && (lines[at] ?? '').startsWith('>'); at += 1)
        quote.push((lines[at] ?? '').replace(/^>\s?/, ''));
      at -= 1;
      blocks.push({ kind: 'note', children: inline(quote.join(' ')) });
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

/** Plain text of inline content, for search and plain-text copies. */
export function plain(parts: readonly Inline[]): string {
  return parts
    .map((part) => {
      switch (part.kind) {
        case 'text':
        case 'code':
          return part.text;
        case 'key':
          return '';
        default:
          return plain(part.children);
      }
    })
    .join('');
}

/** An article body as plain text. */
export function plainText(markdown: string): string {
  return parse(markdown)
    .map((block) => {
      switch (block.kind) {
        case 'heading':
        case 'paragraph':
        case 'note':
          return plain(block.children);
        case 'ordered':
        case 'bullets':
          return block.items.map((item) => plain(item)).join('\n');
        case 'code':
          return block.text;
        default:
          return '';
      }
    })
    .filter((text) => text !== '')
    .join('\n');
}
