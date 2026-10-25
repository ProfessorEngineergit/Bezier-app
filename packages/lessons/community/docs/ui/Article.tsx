/**
 * Renders an article: Markdown blocks, pictures with arrows, and action keys from the active
 * keymap. No HTML from the article is used; every element is created here from parsed blocks
 * (format/markdown.ts).
 */

import type { ReactNode } from 'react';
import type { DocArticle } from '../format/article.js';
import { type Block, type Inline, parse } from '../format/markdown.js';
import { AnnotatedImage } from './AnnotatedImage.js';
import { useDocsHost } from './context.js';

function Inlines({
  parts,
  onOpen,
}: {
  parts: readonly Inline[];
  onOpen: (id: string) => void;
}): ReactNode {
  const host = useDocsHost();
  return parts.map((part, index) => {
    // Inline parts have no identity besides their position.
    const key = index;
    switch (part.kind) {
      case 'text':
        return part.text;
      case 'bold':
        return (
          <strong key={key}>
            <Inlines onOpen={onOpen} parts={part.children} />
          </strong>
        );
      case 'italic':
        return (
          <em key={key}>
            <Inlines onOpen={onOpen} parts={part.children} />
          </em>
        );
      case 'code':
        return <code key={key}>{part.text}</code>;
      case 'key': {
        const caps = host.keyOf(part.action);
        return caps === null ? (
          <span className="wiki-key wiki-key--none" key={key}>
            no key set
          </span>
        ) : (
          <span className="wiki-key" key={key}>
            {caps.map((cap) => (
              <kbd key={cap}>{cap}</kbd>
            ))}
          </span>
        );
      }
      case 'link': {
        const target = part.href.startsWith('doc:') ? part.href.slice(4) : null;
        return (
          <button
            className="wiki-link"
            key={key}
            onClick={() => (target === null ? host.openLink(part.href) : onOpen(target))}
            type="button"
          >
            <Inlines onOpen={onOpen} parts={part.children} />
          </button>
        );
      }
      default:
        return null;
    }
  });
}

function Blocks({
  article,
  blocks,
  onOpen,
}: {
  article: DocArticle;
  blocks: readonly Block[];
  onOpen: (id: string) => void;
}) {
  return blocks.map((block, index) => {
    const key = index;
    switch (block.kind) {
      case 'heading':
        return block.level === 2 ? (
          <h2 key={key}>
            <Inlines onOpen={onOpen} parts={block.children} />
          </h2>
        ) : (
          <h3 key={key}>
            <Inlines onOpen={onOpen} parts={block.children} />
          </h3>
        );
      case 'paragraph':
        return (
          <p key={key}>
            <Inlines onOpen={onOpen} parts={block.children} />
          </p>
        );
      case 'ordered':
        return (
          <ol key={key}>
            {block.items.map((item, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a step is identified by its number
              <li key={at}>
                <Inlines onOpen={onOpen} parts={item} />
              </li>
            ))}
          </ol>
        );
      case 'bullets':
        return (
          <ul key={key}>
            {block.items.map((item, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: items are identified by position
              <li key={at}>
                <Inlines onOpen={onOpen} parts={item} />
              </li>
            ))}
          </ul>
        );
      case 'note':
        return (
          <aside className="wiki-note" key={key}>
            <Inlines onOpen={onOpen} parts={block.children} />
          </aside>
        );
      case 'code':
        return (
          <pre key={key}>
            <code>{block.text}</code>
          </pre>
        );
      case 'image': {
        const image = article.images[block.key];
        return image === undefined ? (
          <div className="doc-figure__missing" key={key}>
            A picture is missing here.
          </div>
        ) : (
          <AnnotatedImage image={image} key={key} />
        );
      }
      default:
        return null;
    }
  });
}

export function ArticleBody({
  article,
  onOpen,
}: {
  article: DocArticle;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="doc-body wiki-prose">
      <Blocks article={article} blocks={parse(article.body)} onOpen={onOpen} />
    </div>
  );
}
