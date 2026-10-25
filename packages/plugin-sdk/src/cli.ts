/**
 * bezier-plugin: make, run, check and pack a Bezier plugin.
 *
 *   bezier-plugin new <id> [command|panel|exporter]   a folder with a plugin that works
 *   bezier-plugin dev [folder] [--port 5199]          run it in Bezier, again on every save
 *   bezier-plugin check [folder]                      what the store's review will say
 *   bezier-plugin pack [folder]                       <id>-<version>.bezierplugin
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PLUGIN_ID } from '../../lessons/community/plugins/format/manifest.js';
import TYPES from '../bezier.d.ts?raw';
import { devServer } from './dev-server.js';
import { checkFolder } from './folder.js';
import { scaffold, TEMPLATES, type Template } from './templates.js';

const HELP = `bezier-plugin: make, run, check and pack a Bezier plugin.

  bezier-plugin new <id> [command|panel|exporter]   a folder with a plugin that works
  bezier-plugin dev [folder] [--port 5199]          run it in Bezier, again on every save
  bezier-plugin check [folder]                      what the store's review will say
  bezier-plugin pack [folder]                       <id>-<version>.bezierplugin`;

const [command = 'help', ...rest] = process.argv.slice(2);
const positional = rest.filter((arg, i) => !arg.startsWith('--') && rest[i - 1] !== '--port');
const port = Number(rest[rest.indexOf('--port') + 1] ?? 5199) || 5199;
const say = (line = '') => process.stdout.write(`${line}\n`);

async function main(): Promise<number> {
  switch (command) {
    case 'new': {
      const [id, template = 'command'] = positional;
      if (id === undefined || !PLUGIN_ID.test(id)) {
        say(
          'Give an id of lower-case words joined by dots or dashes: bezier-plugin new ada.gear-maker',
        );
        return 2;
      }
      if (!Object.hasOwn(TEMPLATES, template)) {
        say(`Templates: ${Object.keys(TEMPLATES).join(', ')}`);
        return 2;
      }
      const dir = resolve(id);
      if (existsSync(dir)) {
        say(`${dir} already exists.`);
        return 1;
      }
      mkdirSync(dir);
      const files = { ...scaffold(id, template as Template), 'bezier.d.ts': TYPES };
      for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
      say(`Made ${id}/ (${TEMPLATES[template as Template]}).`);
      say(`Next: cd ${id} && npx bezier-plugin dev`);
      return 0;
    }
    case 'dev': {
      const dir = resolve(positional[0] ?? '.');
      const first = await checkFolder(dir);
      if (first.manifest === null) {
        say(first.refused.join('\n'));
        return 1;
      }
      const server = devServer(dir, async (file) => {
        const checked = await checkFolder(dir);
        say(
          `${file} changed${checked.refused.length > 0 ? `; review would refuse: ${checked.refused.join(' ')}` : ', reloaded'}`,
        );
      });
      server.listen(port, '127.0.0.1', () => {
        say(`Serving ${first.manifest?.name} on http://127.0.0.1:${port}`);
        say('In Bezier: Settings, Community, Writing a plugin: enter this address and press Load.');
      });
      return new Promise(() => {});
    }
    case 'check':
    case 'pack': {
      const dir = resolve(positional[0] ?? '.');
      const checked = await checkFolder(dir);
      for (const line of checked.refused) say(`refused: ${line}`);
      for (const line of checked.findings) say(`a reviewer will look at: ${line}`);
      if (checked.refused.length > 0 || checked.bytes === null || checked.manifest === null)
        return 1;
      if (command === 'check') {
        say(`${checked.manifest.name} ${checked.manifest.pluginVersion}: review would accept it.`);
        return 0;
      }
      const file = `${checked.manifest.id}-${checked.manifest.pluginVersion}.bezierplugin`;
      writeFileSync(join(dir, file), checked.bytes);
      say(`Wrote ${file} (${Math.ceil(checked.bytes.byteLength / 1000)} KB).`);
      return 0;
    }
    default:
      say(HELP);
      return command === 'help' ? 0 : 2;
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    say(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
