/**
 * Builds the static website into website/dist.
 *
 *   node website/build/build.mjs
 *
 * Pages are HTML fragments in website/pages with metadata in a first-line comment. The developer
 * wiki is rendered from docs/sdk and docs/mcp. `{{icon:name}}` inserts a brand icon. Download data
 * comes from dist/releases.json (see deploy/releases.mjs); an empty one is written if missing.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glassSvg } from '../../docs/brand/icons/glass.mjs';
import { ICONS } from '../../docs/brand/icons/icons.mjs';
import { layout, wikiLayout } from './layout.mjs';
import { markdown } from './markdown.mjs';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(site, '..');
const dist = join(site, 'dist');
export const REPOSITORY = 'https://github.com/ProfessorEngineergit/bezier';

/** Developer wiki pages: source Markdown, site path and side-navigation group. */
const WIKI = [
  { file: 'docs/sdk/README.md', path: '/developers/plugins/', group: 'Plugins' },
  { file: 'docs/sdk/api.md', path: '/developers/plugins/api/', group: 'Plugins' },
  { file: 'docs/sdk/cookbook.md', path: '/developers/plugins/cookbook/', group: 'Plugins' },
  { file: 'docs/sdk/publishing.md', path: '/developers/plugins/publishing/', group: 'Plugins' },
  { file: 'docs/mcp/README.md', path: '/developers/mcp/', group: 'MCP' },
  { file: 'docs/mcp/tools.md', path: '/developers/mcp/tools/', group: 'MCP' },
  { file: 'docs/mcp/server.md', path: '/developers/mcp/server/', group: 'MCP' },
];

let iconCount = 0;
const icons = (html) =>
  html.replace(/\{\{icon:([a-z-]+)(?::(\d+))?\}\}/g, (_, name, size) => {
    const drawing = ICONS[name];
    if (drawing === undefined) throw new Error(`No icon ${name} in docs/brand/icons.`);
    iconCount += 1;
    return (
      glassSvg(drawing, { id: `i${iconCount}`, size: Number(size ?? 28) })
        .replace('<svg ', '<svg aria-hidden="true" class="icon" ')
        // The CSP forbids inline styles; SVG inherits the colour anyway.
        .replace(' style="color:inherit"', '')
    );
  });

function write(path, html) {
  const file = join(dist, path.endsWith('/') ? `${path}index.html` : path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

export function build() {
  const keepReleases = join(dist, 'releases.json');
  const releases = existsSync(keepReleases) ? readFileSync(keepReleases, 'utf8') : null;
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  cpSync(join(site, 'assets'), join(dist, 'assets'), { recursive: true });
  cpSync(
    join(root, 'apps/studio/public/fonts/archivo-variable.woff2'),
    join(dist, 'assets/archivo.woff2'),
  );
  cpSync(join(root, 'docs/brand/logo/bezier-app-icon-dark.png'), join(dist, 'assets/mark.png'));
  cpSync(join(root, 'docs/assets/screenshots/macos'), join(dist, 'assets/shots'), {
    recursive: true,
  });
  cpSync(join(root, 'docs/assets/hero'), join(dist, 'assets/hero'), { recursive: true });
  cpSync(join(site, 'static'), dist, { recursive: true });
  writeFileSync(
    keepReleases,
    releases ?? `${JSON.stringify({ generatedAt: null, stable: null }, null, 2)}\n`,
  );

  for (const name of readdirSync(join(site, 'pages')).sort()) {
    const source = readFileSync(join(site, 'pages', name), 'utf8');
    const meta = JSON.parse(/^<!--\s*(\{.*\})\s*-->/.exec(source)?.[1] ?? 'null');
    if (meta === null) throw new Error(`${name} has no first-line comment with its title.`);
    write(meta.path, layout({ ...meta, body: icons(source.replace(/^<!--.*-->\n/, '')) }));
  }

  const pages = new Map(WIKI.map((entry) => [entry.file, entry.path]));
  for (const entry of WIKI) {
    const page = markdown(readFileSync(join(root, entry.file), 'utf8'), {
      file: entry.file,
      pages,
      repository: REPOSITORY,
    });
    write(
      entry.path,
      wikiLayout({
        ...page,
        path: entry.path,
        source: `${REPOSITORY}/blob/main/${entry.file}`,
        nav: WIKI.map((other) => ({ ...other, title: titleOf(other.file) })),
        icons,
      }),
    );
  }
  return dist;
}

const titleOf = (file) => /^# (.*)$/m.exec(readFileSync(join(root, file), 'utf8'))?.[1] ?? file;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Built ${build()}`);
}
