/**
 * Draft badges as SVG, to agree on the system before anything is modelled.
 *
 * Flat versions of the badges for small sizes. The family is the shape
 * (lessons a disc, plugins a hex, learning a rounded plate), the tier is the
 * material. The real badges are glass, ray traced in Blender
 * (blender/badges.py); these follow their colours.
 *
 *   node community/recognition/drafts/generate.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = dirname(fileURLToPath(import.meta.url));

/**
 * The tiers' materials as flat colours, light to dark: [highlight, body, shadow, mark].
 * The same four as the ray-traced badges (blender/badges.py), for sizes where a
 * render would be unreadable: embeds, lists, 24 px icons.
 */
const TIERS = {
  quartz: ['#ffffff', '#dfe5ee', '#9aa3b2', '#7d8594'],
  sapphire: ['#c9dbff', '#4f7fe0', '#1d3a8a', '#eef3ff'],
  emerald: ['#c8f7dc', '#2fae6e', '#0d5a35', '#f2c45a'],
  diamond: ['#ffffff', '#e9ecf2', '#b9a06a', '#d4a33a'],
};

/** The engraved mark of each badge, drawn in a 100×100 box around the centre. */
const MARKS = {
  // Lessons
  extrude: '<path d="M38 64h24V44H38z M38 44l8-8h24l-8 8 M62 64l8-8V36"/>',
  chapter: '<path d="M32 50h36 M38 42v16 M50 42v16 M62 42v16"/><circle cx="50" cy="50" r="3"/>',
  stepin: '<path d="M36 62V38l16 12z M58 38h8v24h-8"/>',
  teacher:
    '<circle cx="42" cy="44" r="6"/><circle cx="60" cy="48" r="5"/><path d="M32 64c2-8 18-8 20 0 M52 64c2-6 14-6 16 0"/>',
  // Plugins
  plugin: '<path d="M40 40h8v-6h4v6h8v8h6v4h-6v8H40z"/>',
  installs: '<path d="M50 34v24 M40 48l10 10 10-10 M36 66h28"/>',
  offline:
    '<path d="M36 58c8-10 20-10 28 0 M42 52c5-5 11-5 16 0"/><circle cx="50" cy="62" r="2"/><path d="M34 34l32 32"/>',
  clean: '<path d="M38 52l8 8 16-18"/><circle cx="50" cy="50" r="18"/>',
  // Learners
  firststep:
    '<path d="M44 62c-6 0-6-10-2-14s10-2 10 4-2 10-8 10z M58 46c-4 0-5-7-2-9s7-1 7 3-1 6-5 6z"/>',
  streak: '<circle cx="50" cy="50" r="16"/><path d="M50 34a16 16 0 0 1 16 16" stroke-width="6"/>',
  levelup: '<path d="M36 64h8v-8h8v-8h8v-8h8"/>',
  remix: '<path d="M36 44h22l-6-6 M64 56H42l6 6"/>',
};

/** Stock shapes: the family. */
const STOCK = {
  disc: () => '<circle cx="50" cy="50" r="44"/>',
  hex: () => '<path d="M50 6l38 22v44L50 94 12 72V28z"/>',
  plate: () => '<rect x="8" y="8" width="84" height="84" rx="22"/>',
};

const BADGES = [
  ['extrude', 'disc', 'First lesson'],
  ['chapter', 'disc', 'Chapter maker'],
  ['stepin', 'disc', 'Stepped into'],
  ['teacher', 'disc', 'Teacher'],
  ['plugin', 'hex', 'First plugin'],
  ['installs', 'hex', 'Installed'],
  ['offline', 'hex', 'Offline hero'],
  ['clean', 'hex', 'Clean review'],
  ['firststep', 'plate', 'First step'],
  ['streak', 'plate', 'Streak'],
  ['levelup', 'plate', 'Level up'],
  ['remix', 'plate', 'Made it mine'],
];

function badge(mark, stock, tier) {
  const [hi, body, shadow, engrave] = TIERS[tier];
  const id = `${mark}-${tier}`;
  const shape = STOCK[stock]();
  // A machined part lit from the top left: a radial body, a darker chamfer ring,
  // a soft specular sweep, and the mark cut in with a highlight on its lower edge.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200" role="img" aria-label="${mark} ${tier}">
  <defs>
    <radialGradient id="b-${id}" cx="34%" cy="28%" r="80%">
      <stop offset="0" stop-color="${hi}"/><stop offset=".55" stop-color="${body}"/><stop offset="1" stop-color="${shadow}"/>
    </radialGradient>
    <linearGradient id="r-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${hi}"/><stop offset=".5" stop-color="${shadow}"/><stop offset="1" stop-color="${body}"/>
    </linearGradient>
    <linearGradient id="s-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="c-${id}">${shape}</clipPath>
  </defs>
  <g transform="translate(0 2)" opacity=".35" fill="#000">${shape}</g>
  <g fill="url(#r-${id})">${shape}</g>
  <g transform="translate(50 50) scale(.86) translate(-50 -50)" fill="url(#b-${id})">${shape}</g>
  <g clip-path="url(#c-${id})"><ellipse cx="40" cy="22" rx="52" ry="26" fill="url(#s-${id})"/></g>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.5">
    <g transform="translate(0 .9)" stroke="${hi}" opacity=".7">${MARKS[mark]}</g>
    <g stroke="${engrave}">${MARKS[mark]}</g>
  </g>
</svg>
`;
}

mkdirSync(join(out, 'svg'), { recursive: true });
const cells = [];
for (const [mark, stock, name] of BADGES) {
  const row = Object.keys(TIERS).map((tier) => {
    const file = `svg/${mark}-${tier}.svg`;
    writeFileSync(join(out, file), badge(mark, stock, tier));
    return `<img src="${file}" alt="${name}, ${tier}" width="96" height="96">`;
  });
  cells.push(`<tr><th>${name}<small>${stock}</small></th><td>${row.join('</td><td>')}</td></tr>`);
}

writeFileSync(
  join(out, 'gallery.html'),
  `<!doctype html><meta charset="utf-8"><title>Badge drafts</title>
<style>
  body { margin: 0; padding: 32px; background: #141416; color: #e0e0e0; font: 13px ui-sans-serif, system-ui; }
  table { border-spacing: 20px 12px; } th { text-align: left; font-weight: 600; width: 140px; }
  small { display: block; color: #6a6c6e; font-weight: 400; }
  thead th { color: #909090; font-weight: 400; text-align: center; }
</style>
<h1 style="font-size:20px">Flat badges for small sizes: family by shape, tier by material</h1>
<table><thead><tr><th></th>${Object.keys(TIERS)
    .map((t) => `<th>${t}</th>`)
    .join('')}</tr></thead><tbody>${cells.join('\n')}</tbody></table>`,
);
console.log(`Wrote ${BADGES.length * Object.keys(TIERS).length} badges and gallery.html`);
