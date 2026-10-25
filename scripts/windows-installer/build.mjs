// Renders the Windows installer images into apps/desktop/src-tauri/installer/*.bmp.
//
//   node scripts/windows-installer/build.mjs
//
// NSIS: header 150x57, sidebar 164x314. MSI: banner 493x58, dialog 493x312. Both need 24-bit BMP,
// so each image is rendered as PNG and converted with macOS `sips`; run on a Mac and commit.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = join(root, 'apps/desktop/src-tauri/installer');
const nib = pathToFileURL(join(root, 'scripts/dmg-background/art/nib.png')).href;
const logo = pathToFileURL(join(root, 'apps/desktop/src-tauri/icons/128x128@2x.png')).href;
const font = pathToFileURL(join(root, 'apps/studio/public/fonts/archivo-variable.woff2')).href;

const style = `
  @font-face { font-family: Archivo; src: url(${font}); font-weight: 100 900; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Archivo, sans-serif; overflow: hidden; }
`;

/** Dark ground with Nib looking in from the bottom and the name over him. */
const dark = (w, h, nibWidth, nibLeft, nibTop, text) => `
  <style>${style}
    body { width: ${w}px; height: ${h}px; background: radial-gradient(ellipse at 50% 85%, #26262b, #0c0c0e 70%); position: relative; }
    img { position: absolute; width: ${nibWidth}px; left: ${nibLeft}px; top: ${nibTop}px; }
    p { position: absolute; color: #f2f2f4; font-weight: 700; letter-spacing: -0.01em; ${text} }
  </style>
  <img src="${nib}"><p>Bezier</p>`;

/** Light header strip: logo on white with the name beside it. */
const light = (w, h, side) => `
  <style>${style}
    body { width: ${w}px; height: ${h}px; background: #fff; display: flex; align-items: center; justify-content: ${side}; gap: 10px; padding: 0 12px; }
    img { height: ${h - 14}px; }
    p { color: #151518; font-weight: 700; font-size: ${Math.round(h * 0.34)}px; letter-spacing: -0.01em; }
  </style>
  <img src="${logo}"><p>Bezier</p>`;

const pictures = {
  'sidebar.bmp': [
    164,
    314,
    dark(164, 314, 250, -48, 96, 'left: 16px; top: 20px; font-size: 26px;'),
  ],
  'header.bmp': [150, 57, light(150, 57, 'flex-end')],
  'wix-dialog.bmp': [
    493,
    312,
    dark(493, 312, 330, 150, 54, 'left: 28px; top: 26px; font-size: 40px;'),
  ],
  'wix-banner.bmp': [493, 58, light(493, 58, 'flex-end')],
};

/**
 * Converts a top-down BMP (negative height, as `sips` writes it) to bottom-up. The installers
 * render top-down files upside down or reject them.
 */
function bottomUp(file) {
  const bmp = readFileSync(file);
  const start = bmp.readUInt32LE(10);
  const width = bmp.readInt32LE(18);
  const height = bmp.readInt32LE(22);
  if (height > 0) return;
  const rows = -height;
  const stride = Math.ceil((width * 3) / 4) * 4;
  const turned = Buffer.from(bmp);
  for (let row = 0; row < rows; row++) {
    bmp.copy(
      turned,
      start + (rows - 1 - row) * stride,
      start + row * stride,
      start + (row + 1) * stride,
    );
  }
  turned.writeInt32LE(rows, 22);
  writeFileSync(file, turned);
}

const temp = mkdtempSync(join(tmpdir(), 'bezier-installer-'));
const browser = await chromium.launch();
for (const [name, [width, height, html]] of Object.entries(pictures)) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  // Load from disk, not `setContent`: a page without a URL cannot load file:// resources.
  const sheet = join(temp, name.replace('.bmp', '.html'));
  writeFileSync(sheet, html);
  await page.goto(pathToFileURL(sheet).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const png = join(temp, name.replace('.bmp', '.png'));
  await page.screenshot({ path: png });
  await page.close();
  execFileSync('sips', ['-s', 'format', 'bmp', png, '--out', join(out, name)], { stdio: 'ignore' });
  bottomUp(join(out, name));
  console.log(`${name} ${width}x${height} ${readFileSync(join(out, name)).length} bytes`);
}
await browser.close();
