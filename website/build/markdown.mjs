/**
 * Minimal Markdown-to-HTML for the developer pages (docs/sdk, docs/mcp). Supports only what those
 * pages use: headings, paragraphs, lists, tables, fenced code, quotes, links, inline code, bold and
 * italics.
 *
 * Links to other wiki pages are rewritten to site paths; other repository links point to GitHub.
 */

import { dirname, join, normalize } from 'node:path';

const escapeHtml = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

/**
 * @param {string} source Markdown
 * @param {{ file: string, pages: Map<string, string>, repository: string }} context
 *   `file` the Markdown's path in the repository; `pages` maps repository paths to site paths.
 */
export function markdown(source, context) {
  const link = (href) => {
    if (/^(https?:|mailto:|#)/.test(href)) return href;
    const [path, hash = ''] = href.split('#');
    const target = normalize(join(dirname(context.file), path));
    const page = context.pages.get(target);
    if (page !== undefined) return page + (hash ? `#${hash}` : '');
    return `${context.repository}/blob/main/${target}${hash ? `#${hash}` : ''}`;
  };
  const inline = (text) =>
    escapeHtml(text)
      .replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, words, href) => {
        const to = link(href.replaceAll('&amp;', '&'));
        const external = /^https?:/.test(to) ? ' rel="noopener"' : '';
        return `<a href="${to}"${external}>${words}</a>`;
      });

  const lines = source.replace(/\r/g, '').split('\n');
  const out = [];
  const headings = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i += 1;
      out.push(
        `<pre class="code"${language ? ` data-language="${escapeHtml(language)}"` : ''}><code>${escapeHtml(code.join('\n'))}</code></pre>`,
      );
      continue;
    }
    const heading = /^(#{1,4}) (.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const html = inline(heading[2]);
      const id = slug(heading[2]);
      if (level === 2) headings.push({ id, text: html.replace(/<[^>]+>/g, '') });
      out.push(`<h${level} id="${id}">${html}</h${level}>`);
      i += 1;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (row) =>
        row
          .replace(/^\||\|$/g, '')
          .split(/(?<!\\)\|/)
          .map((cell) => inline(cell.trim()));
      const [head, , ...body] = rows;
      const headCells = cells(head);
      const empty = headCells.every((cell) => cell === '');
      out.push(
        `<div class="table"><table>${empty ? '' : `<thead><tr>${headCells.map((c) => `<th>${c}</th>`).join('')}</tr></thead>`}<tbody>${body
          .map(
            (row) =>
              `<tr>${cells(row)
                .map((c) => `<td>${c}</td>`)
                .join('')}</tr>`,
          )
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    if (/^(\d+\.|-) /.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^(\d+\.|-) |^ {2,}\S/.test(lines[i])) {
        if (/^(\d+\.|-) /.test(lines[i])) items.push(lines[i].replace(/^(\d+\.|-) /, ''));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (line.startsWith('>')) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith('>'))
        quote.push(lines[i++].replace(/^> ?/, ''));
      out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const paragraph = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#|```|\||>|(\d+\.|-) )/.test(lines[i])
    ) {
      paragraph.push(lines[i++]);
    }
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  const title = /^# (.*)$/m.exec(source)?.[1] ?? '';
  return { html: out.join('\n'), title, headings };
}
