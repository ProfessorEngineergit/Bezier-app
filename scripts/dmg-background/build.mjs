// Renders the macOS .dmg window background, aligned with the icon positions Finder uses.
//
//   node scripts/dmg-background/build.mjs            writes apps/desktop/src-tauri/dmg/background.png
//   node scripts/dmg-background/build.mjs --guides   writes a copy with icon boxes to a temp folder
//
// Nib comes from art/nib.png (render-nib.py). Layout is in points like Finder; the PNG is written
// at 2x with a 144 dpi pHYs chunk so Finder shows it at window size on Retina screens.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32 } from 'node:zlib';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const confPath = join(root, 'apps/desktop/src-tauri/tauri.conf.json');
const outPath = join(root, 'apps/desktop/src-tauri/dmg/background.png');
const fontPath = join(root, 'apps/studio/public/fonts/archivo-variable.woff2');
const nibPath = join(here, 'art/nib.png');

// Window size in points. Icon positions are icon centres (128 pt, label below), measured from the
// top left of the content area. The visible height varies: 392 pt with a plain title bar, about
// 324 pt with tab and path bars, so everything important stays above y = 320.
const WIN = { width: 660, height: 420 };
const APP = { x: 134, y: 124 };
const APPLICATIONS = { x: 526, y: 124 };
const ICON = 128;
// Finder always draws labels in black, so a light plate sits behind each. `dy` is the label
// centre's offset below the icon centre; `widths` fit the app and Applications labels.
const LABEL = { dy: 83, height: 24, widths: [86, 112] };

// The layout is duplicated in tauri.conf.json; fail if the two disagree.
const dmg = JSON.parse(readFileSync(confPath, 'utf8')).bundle.macOS.dmg;
const same = (a, b) => a && a.x === b.x && a.y === b.y;
if (
  !dmg ||
  !same(dmg.appPosition, APP) ||
  !same(dmg.applicationFolderPosition, APPLICATIONS) ||
  dmg.windowSize?.width !== WIN.width ||
  dmg.windowSize?.height !== WIN.height
) {
  console.error(
    `${confPath} (bundle.macOS.dmg) does not match the layout in build.mjs; change both together.`,
  );
  process.exit(1);
}

const guides = process.argv.includes('--guides');
const fontUrl = pathToFileURL(fontPath).href;
const nibUrl = pathToFileURL(nibPath).href;

// The arrow is drawn as a Bézier curve with visible handles. It stops short of the folder so it
// does not cover the alias badge in the icon's lower left.
const GAP_BEFORE_FOLDER = 36;
const a0 = { x: APP.x + ICON / 2 + 16, y: APP.y - 6 };
const a1 = { x: APPLICATIONS.x - ICON / 2 - GAP_BEFORE_FOLDER, y: APPLICATIONS.y - 6 };
const h0 = { x: a0.x + 40, y: a0.y - 62 };
const h1 = { x: a1.x - 40, y: a1.y - 62 };
// The arrowhead follows the end tangent, from the second handle to the end point.
const tip = (Math.atan2(a1.y - h1.y, a1.x - h1.x) * 180) / Math.PI;

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: "Archivo Brand"; src: url("${fontUrl}"); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${WIN.width}px; height: ${WIN.height}px; overflow: hidden; background: #09090a; }
.stage { position: relative; width: ${WIN.width}px; height: ${WIN.height}px;
  background:
    radial-gradient(360px 250px at 50% 72%, rgb(201 201 207 / 17%), transparent 70%),
    radial-gradient(520px 300px at 50% 0%, rgb(255 255 255 / 5%), transparent 70%),
    linear-gradient(#171718, #09090a); }
.grid { position: absolute; inset: 0;
  background-image: radial-gradient(circle, rgb(255 255 255 / 11%) 0.8px, transparent 1.2px);
  background-size: 22px 22px; background-position: 11px 11px;
  -webkit-mask-image: radial-gradient(closest-side at 50% 52%, #000 25%, transparent 100%);
  mask-image: radial-gradient(closest-side at 50% 52%, #000 25%, transparent 100%); }
h1 { position: absolute; left: 0; right: 0; top: 22px; text-align: center;
  font: 620 21px / 1 "Archivo Brand", sans-serif; letter-spacing: 0.01em; color: #f2f2f4; }
h1 span { color: #909090; font-weight: 500; }
svg.arrow { position: absolute; inset: 0; overflow: visible; }
img.nib { position: absolute; visibility: hidden; }
.plate { position: absolute; height: ${LABEL.height}px; border-radius: ${LABEL.height / 2}px;
  background: linear-gradient(rgb(230 230 234 / 86%), rgb(205 205 211 / 82%));
  box-shadow: 0 1px 0 rgb(255 255 255 / 35%) inset, 0 6px 14px rgb(0 0 0 / 35%); }
.box { position: absolute; width: ${ICON}px; height: ${ICON}px; border: 1px dashed #f0f;
  display: ${guides ? 'block' : 'none'}; }
</style>
<div class="stage">
  <div class="grid"></div>
  <h1>Drag Bezier to <span>Applications</span></h1>
  <svg class="arrow" width="${WIN.width}" height="${WIN.height}" viewBox="0 0 ${WIN.width} ${WIN.height}">
    <defs><linearGradient id="silver" x1="0" x2="1">
      <stop offset="0" stop-color="#8d8d95"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="1" stop-color="#c9c9cf"/>
    </linearGradient></defs>
    <g stroke="#8d8d95" stroke-width="1" stroke-dasharray="2 3" opacity="0.55">
      <line x1="${a0.x}" y1="${a0.y}" x2="${h0.x}" y2="${h0.y}"/><line x1="${a1.x}" y1="${a1.y}" x2="${h1.x}" y2="${h1.y}"/>
    </g>
    <path d="M${a0.x} ${a0.y} C${h0.x} ${h0.y} ${h1.x} ${h1.y} ${a1.x} ${a1.y}" fill="none"
      stroke="url(#silver)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M-12 -8 L0 0 L-12 8" transform="translate(${a1.x} ${a1.y}) rotate(${tip})" fill="none"
      stroke="#c9c9cf" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <g fill="#09090a" stroke="#c9c9cf" stroke-width="1.4">
      <circle cx="${a0.x}" cy="${a0.y}" r="3.6"/>
      <rect x="${h0.x - 3}" y="${h0.y - 3}" width="6" height="6" rx="1"/>
      <rect x="${h1.x - 3}" y="${h1.y - 3}" width="6" height="6" rx="1"/>
    </g>
  </svg>
  <div class="plate" style="width:${LABEL.widths[0]}px; left:${APP.x - LABEL.widths[0] / 2}px; top:${APP.y + LABEL.dy - LABEL.height / 2}px"></div>
  <div class="plate" style="width:${LABEL.widths[1]}px; left:${APPLICATIONS.x - LABEL.widths[1] / 2}px; top:${APPLICATIONS.y + LABEL.dy - LABEL.height / 2}px"></div>
  <img class="nib" src="${nibUrl}">
  <div class="box" style="left:${APP.x - ICON / 2}px; top:${APP.y - ICON / 2}px"></div>
  <div class="box" style="left:${APPLICATIONS.x - ICON / 2}px; top:${APPLICATIONS.y - ICON / 2}px"></div>
</div>`;

// Nib is positioned by his opaque pixels (alpha > 128), not the image bounds, so the faint
// contact shadow does not shift him. His feet fall below the window edge.
const NIB = { centreX: 336, bottom: 412, height: 272 };

// The opaque bounds are read from a canvas; file:// images taint it without this flag.
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: WIN, deviceScaleFactor: 2 });
const dir = mkdtempSync(join(tmpdir(), 'dmg-bg-'));
const file = join(dir, 'index.html');
writeFileSync(file, html);
await page.goto(pathToFileURL(file).href);
await page.evaluate(async (nib) => {
  await document.fonts.load('620 21px "Archivo Brand"');
  const img = document.querySelector('img.nib');
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width,
    x1 = 0,
    y0 = c.height,
    y1 = 0;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 128) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  const s = nib.height / (y1 - y0);
  img.style.width = `${c.width * s}px`;
  img.style.left = `${nib.centreX - ((x0 + x1) / 2) * s}px`;
  img.style.top = `${nib.bottom - y1 * s}px`;
  img.style.visibility = 'visible';
}, NIB);

const shot = await page.screenshot({ type: 'png' });
await browser.close();

// Inserts a pHYs chunk (pixels per metre), which Finder uses to treat the image as 2x.
// 144 dpi = 5669 per metre.
function withDpi(png, perMetre) {
  const body = Buffer.alloc(9);
  body.writeUInt32BE(perMetre, 0);
  body.writeUInt32BE(perMetre, 4);
  body.writeUInt8(1, 8);
  const type = Buffer.from('pHYs');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, body])) >>> 0);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const chunk = Buffer.concat([len, type, body, crc]);
  const at = 8 + 25; // signature, then the 25-byte IHDR chunk
  return Buffer.concat([png.subarray(0, at), chunk, png.subarray(at)]);
}

const out = guides ? join(dir, 'background-guides.png') : outPath;
writeFileSync(out, withDpi(shot, 5669));
console.log('wrote', out);
