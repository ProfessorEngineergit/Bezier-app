/**
 * Plugin call handlers and the permission each requires.
 *
 * `NEEDS` is the security model: unlisted methods do not exist, and listed ones run only when the
 * user granted their permission.
 */

import { storageGet, storageRemove, storageSet } from '../client/installed.js';
import type { Permission } from '../format/manifest.js';
import type { Running } from './bridge.js';
import type { PluginHost } from './contract.js';

const NEEDS: Record<string, Permission | null> = {
  'project.read': 'project:read',
  // A parsed view of the same model; exposes nothing beyond project.read.
  'model.read': 'project:read',
  'project.create': 'project:create',
  'selection.read': 'selection:read',
  'ui.command': 'ui:command',
  'ui.panel': 'ui:panel',
  'files.export': 'files:export',
  'files.import': 'files:import',
  'storage.get': 'storage',
  'storage.set': 'storage',
  'storage.remove': 'storage',
  // A notice labelled with the plugin's name; harmless and rate-limited like other calls.
  notify: null,
};

const MAX_PROJECT = 50_000_000;
const MAX_FILE = 100_000_000;
const MAX_COMMANDS = 20;

const text = (value: unknown, max: number, what: string): string => {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${what} is not valid.`);
  return value;
};

/** Sanitises a file name: no path separators, leading dots or control characters. */
const fileName = (value: unknown): string => {
  const name = text(value, 120, 'The file name').replace(/[\\/:*?"<>|\p{Cc}]/gu, '-');
  return name.replace(/^\.+/, '') || 'export';
};

export async function handleCall(
  host: PluginHost,
  running: Running,
  method: string,
  args: unknown[],
): Promise<unknown> {
  if (!Object.hasOwn(NEEDS, method)) throw new Error(`There is no ${method}.`);
  const needed = NEEDS[method];
  if (needed !== null && needed !== undefined && !running.plugin.granted.includes(needed)) {
    throw new Error(`This plugin was not given ${needed}.`);
  }
  const me = running.identity;
  const id = running.plugin.id;
  switch (method) {
    case 'project.read':
      return host.snapshot();
    case 'model.read':
      return host.model();
    case 'project.create':
      return host.openAsProject(
        text(args[0], MAX_PROJECT, 'The project'),
        text(args[1], 120, 'The name'),
      );
    case 'selection.read':
      return host.selection();
    case 'ui.command': {
      if (running.commands.length >= MAX_COMMANDS) throw new Error('A plugin may add 20 commands.');
      const commandId = text(args[0], 40, 'The command');
      const remove = host.addCommand(me, text(args[1], 60, 'The command title'), () =>
        running.port.postMessage({ type: 'command', id: commandId }),
      );
      running.commands.push(remove);
      return null;
    }
    case 'ui.panel':
      if (args[0] === true) running.panel.show(text(args[1], 60, 'The panel title') || me.name);
      else running.panel.hide();
      return null;
    case 'files.export': {
      const name = fileName(args[0]);
      const type = text(args[1], 100, 'The file type');
      const data = args[2];
      const blob =
        typeof data === 'string'
          ? new Blob([data], { type })
          : data instanceof Uint8Array || data instanceof ArrayBuffer
            ? new Blob([data as BlobPart], { type })
            : null;
      if (blob === null || blob.size > MAX_FILE) throw new Error('The file is not valid.');
      const size =
        blob.size < 1_000_000
          ? `${Math.ceil(blob.size / 1000)} KB`
          : `${(blob.size / 1e6).toFixed(1)} MB`;
      if (!(await host.confirm(me, `${me.name} wants to save “${name}” (${size}).`, 'Save')))
        return false;
      host.saveFile(name, blob);
      return true;
    }
    case 'files.import': {
      const accept = text(args[0], 100, 'The file types');
      if (!(await host.confirm(me, `${me.name} asks you to choose a file.`, 'Choose file')))
        return null;
      const file = await host.pickFile(accept);
      if (file === null) return null;
      if (file.size > MAX_FILE) throw new Error('That file is too large.');
      return { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
    }
    case 'storage.get':
      return storageGet(id, text(args[0], 200, 'The key'));
    case 'storage.set':
      await storageSet(id, text(args[0], 200, 'The key'), text(args[1], 1_000_000, 'The value'));
      return null;
    case 'storage.remove':
      await storageRemove(id, text(args[0], 200, 'The key'));
      return null;
    case 'notify':
      host.notify(me, text(args[0], 200, 'The message'));
      return null;
    default:
      throw new Error(`There is no ${method}.`);
  }
}
