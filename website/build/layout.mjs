/**
 * Shared page frame: header with tabs, footer, and the developer wiki's side navigation.
 * Each page has a single accent button (brand rule).
 */

export const SITE = 'https://bezier-cad.xyz';
export const APP_URL = 'https://app.bezier-cad.xyz';
const REPOSITORY = 'https://github.com/ProfessorEngineergit/bezier';

const TABS = [
  { id: 'product', label: 'Product', href: '/' },
  { id: 'download', label: 'Download', href: '/download/' },
  { id: 'learn', label: 'Learn', href: '/learn/' },
  { id: 'developers', label: 'Developers', href: '/developers/' },
];

const GITHUB = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>`;

function head({ title, description, path }) {
  const full = title === 'Bezier' ? 'Bezier: CAD you’ll want to use' : `${title} · Bezier`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${full}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${SITE}${path}">
<meta property="og:title" content="${full}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${SITE}/assets/hero/hero-dark.webp">
<meta name="theme-color" content="#09090a">
<link rel="icon" href="/assets/mark.png">
<link rel="preload" href="/assets/archivo.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/site.js" defer></script>
</head>`;
}

function bar(tab) {
  const tabs = TABS.map(
    (entry) =>
      `<a class="tab" href="${entry.href}"${entry.id === tab ? ' aria-current="page"' : ''}>${entry.label}</a>`,
  ).join('');
  // The product hero and the download page have their own accent button.
  const download =
    tab === 'download'
      ? ''
      : `<a class="button${tab === 'product' ? '' : ' button--accent'} bar__download" href="/download/">Download</a>`;
  return `<header class="bar">
  <a class="bar__brand" href="/" aria-label="Bezier, home"><img src="/assets/mark.png" alt="" width="28" height="28"><span>bezier</span></a>
  <nav class="tabs" aria-label="Site">${tabs}</nav>
  <div class="bar__end">
    <a class="bar__github" href="${REPOSITORY}" rel="noopener" aria-label="The code on GitHub">${GITHUB}</a>
    ${download}
  </div>
</header>`;
}

const FOOTER = `<footer class="footer">
  <div class="footer__cols">
    <div><strong>Bezier</strong><a href="/">Product</a><a href="/download/">Download</a><a href="${APP_URL}">Open in the browser</a><a href="/download/#beta">Beta</a></div>
    <div><strong>Learn</strong><a href="/learn/">Getting started</a><a href="/learn/#lessons">Lessons</a><a href="/learn/#assistants">Working with an assistant</a></div>
    <div><strong>Developers</strong><a href="/developers/plugins/">Plugin SDK</a><a href="/developers/mcp/">MCP</a><a href="/developers/mcp/server/">Your own server</a><a href="${REPOSITORY}">Source on GitHub</a></div>
    <div><strong>About</strong><a href="${REPOSITORY}/blob/main/LICENSING.md">Licence</a><a href="${REPOSITORY}/blob/main/SECURITY.md">Security</a><a href="/imprint/">Imprint</a><a href="/privacy/">Privacy</a></div>
  </div>
  <p class="footer__line">Bezier is free for people. All of its code is public on GitHub. No account, no tracking on this site.</p>
</footer>`;

export function layout({ title, description, path, tab, body }) {
  return `${head({ title, description, path })}
<body data-tab="${tab}">
<a class="skip" href="#main">Skip to content</a>
${bar(tab)}
<main id="main">
${body}
</main>
${FOOTER}
</body>
</html>
`;
}

export function wikiLayout({ html, title, headings, path, source, nav, icons }) {
  const groups = [...new Set(nav.map((entry) => entry.group))];
  const side = groups
    .map(
      (group) =>
        `<p class="wiki__group">${icons(`{{icon:${group === 'MCP' ? 'mcp' : 'plugin'}:18}}`)}${group}</p>${nav
          .filter((entry) => entry.group === group)
          .map(
            (entry) =>
              `<a href="${entry.path}"${entry.path === path ? ' aria-current="page"' : ''}>${entry.title}</a>`,
          )
          .join('')}`,
    )
    .join('');
  const toc =
    headings.length > 1
      ? `<nav class="wiki__toc" aria-label="On this page"><p>On this page</p>${headings
          .map((h) => `<a href="#${h.id}">${h.text}</a>`)
          .join('')}</nav>`
      : '';
  const body = `<div class="wiki">
  <nav class="wiki__side" aria-label="Developer docs"><a class="wiki__home" href="/developers/">All of developers</a>${side}</nav>
  <article class="wiki__text">${html}<p class="wiki__source"><a href="${source}" rel="noopener">This page on GitHub</a></p></article>
  ${toc}
</div>`;
  return layout({
    title,
    description: `${title}: Bezier developer documentation.`,
    path,
    tab: 'developers',
    body,
  });
}
