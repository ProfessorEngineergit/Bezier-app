/**
 * Live projects: each one an ordered list of edits, and nothing else the server has to
 * understand (ADR 0015 in the app's repository). A device sends an edit, the server gives
 * it the next number and hands it to every device that is waiting; each device applies
 * the edits in that order and builds the model itself.
 *
 * Everything in an edit is sealed with the vault key. The server sees which member sent
 * it, when, and how large it is; never what it changes. A channel's id is keyed as a
 * branch id is, so the server cannot tell which project it belongs to either.
 *
 * On disk: one small file per edit, written atomically like everything here, and a
 * checkpoint, a whole sealed document as an object, that some device writes now and then
 * so a device joining late does not replay a thousand edits. Edits well behind the
 * checkpoint are deleted; a device that was away longer starts from the checkpoint.
 */

import { isHexId } from '../protocol/bytes.ts';
import type { LiveCheckpoint, LiveEditEntry, LivePoll, LivePost } from '../protocol/wire.ts';
import { HttpError } from './auth.ts';
import type { Store } from './store.ts';

/** Edits kept behind the latest checkpoint, for devices that were away a short while. */
const KEEP_BEHIND = 500;

/** Largest edit sent inline. A larger one (an imported file) goes as an object first. */
export const MAX_INLINE = 64 * 1024;

/** How long a poll waits for something new before answering with nothing. */
const MAX_WAIT_MS = 25_000;

/** Edits handed out in one answer; a device far behind asks again. */
const PAGE = 200;

interface Channel {
  /** The last number given out. */
  seq: number;
  /** The lowest number still on disk as a single edit. */
  first: number;
  checkpoint: LiveCheckpoint | null;
  /** Edit id to number: how a resent edit is recognised and not recorded twice. */
  ids: Map<string, number>;
  waiters: Set<() => void>;
}

export class Live {
  readonly #store: Store;
  readonly #channels = new Map<string, Promise<Channel>>();

  constructor(store: Store) {
    this.#store = store;
  }

  /** Records an edit. Sending the same edit again answers with its number, once recorded. */
  async append(vault: string, channel: string, user: string, body: LivePost): Promise<number> {
    if (!isHexId(body.id, 24)) throw new HttpError(400, 'That is not an edit id.');
    const sealed = typeof body.sealed === 'string' ? body.sealed : null;
    const object = typeof body.object === 'string' ? body.object : null;
    if ((sealed === null) === (object === null)) {
      throw new HttpError(400, 'An edit is either sealed inline or an object, not both.');
    }
    if (sealed !== null && (sealed.length > MAX_INLINE * 1.4 || !/^[\w-]+$/.test(sealed))) {
      throw new HttpError(400, 'An inline edit is malformed or too large; send it as an object.');
    }
    if (object !== null && !isHexId(object, 64))
      throw new HttpError(400, 'That is not an object id.');
    if (object !== null && !(await this.#store.hasObject(vault, object))) {
      throw new HttpError(400, 'Upload the edit before sending it.');
    }
    return this.#store.exclusive(key(vault, channel), async () => {
      const ch = await this.#channel(vault, channel);
      const known = ch.ids.get(body.id);
      if (known !== undefined) return known;
      const seq = ch.seq + 1;
      const entry: LiveEditEntry = {
        seq,
        id: body.id,
        user,
        at: new Date().toISOString(),
        ...(sealed !== null ? { sealed } : object !== null ? { object } : {}),
      };
      await this.#store.writeJson(`${dir(vault, channel)}/${seq}.json`, entry);
      ch.seq = seq;
      if (ch.first === 0) ch.first = seq;
      ch.ids.set(body.id, seq);
      for (const wake of ch.waiters) wake();
      ch.waiters.clear();
      return seq;
    });
  }

  /**
   * Everything after `after`: the edits, or the checkpoint and the edits after it when
   * the ones asked for are gone. With `wait`, holds the answer until there is something
   * or the wait is over, so a device learns of an edit as soon as it is made.
   */
  async read(
    vault: string,
    channel: string,
    after: number,
    wait: boolean,
    fresh = false,
  ): Promise<LivePoll> {
    let ch = await this.#channel(vault, channel);
    if (wait && !fresh && ch.seq <= after) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, MAX_WAIT_MS);
        // A wait alone must not keep the process running once the server has closed.
        timer.unref();
        function done() {
          clearTimeout(timer);
          ch.waiters.delete(done);
          resolve();
        }
        ch.waiters.add(done);
      });
      ch = await this.#channel(vault, channel);
    }
    // A device with nothing (`fresh`) always starts at the checkpoint: the edits alone would
    // not give it the document the project started as.
    const behind =
      ch.checkpoint !== null &&
      (fresh || after < ch.first - 1 || (ch.first === 0 && after < ch.checkpoint.seq));
    const from = behind ? (ch.checkpoint?.seq ?? 0) : after;
    const edits: LiveEditEntry[] = [];
    for (let seq = from + 1; seq <= ch.seq && edits.length < PAGE; seq++) {
      const entry = await this.#store.readJson<LiveEditEntry>(`${dir(vault, channel)}/${seq}.json`);
      // A hole means the edits were trimmed while this was read; the device asks again.
      if (entry === null) break;
      edits.push(entry);
    }
    return {
      seq: ch.seq,
      ...(behind && ch.checkpoint !== null ? { checkpoint: ch.checkpoint } : {}),
      edits,
    };
  }

  /**
   * A whole document as it stands after edit `seq`, uploaded as an object. Taken only if
   * it is newer than the one there; edits far enough behind it are then deleted.
   */
  async checkpoint(vault: string, channel: string, body: LiveCheckpoint): Promise<void> {
    if (!isHexId(body.object, 64)) throw new HttpError(400, 'That is not an object id.');
    if (!(await this.#store.hasObject(vault, body.object))) {
      throw new HttpError(400, 'Upload the checkpoint before naming it.');
    }
    await this.#store.exclusive(key(vault, channel), async () => {
      const ch = await this.#channel(vault, channel);
      const seq = Number(body.seq);
      if (!Number.isInteger(seq) || seq < 0 || seq > ch.seq) {
        throw new HttpError(400, 'That checkpoint is ahead of the edits.');
      }
      if (ch.checkpoint !== null && seq <= ch.checkpoint.seq) return;
      const checkpoint = { seq, object: body.object };
      await this.#store.writeJson(`${dir(vault, channel)}/checkpoint.json`, checkpoint);
      ch.checkpoint = checkpoint;
      const until = seq - KEEP_BEHIND;
      for (let s = ch.first; s > 0 && s <= until; s++) {
        await this.#store.remove(`${dir(vault, channel)}/${s}.json`);
        ch.first = s + 1;
      }
      for (const [id, s] of ch.ids) if (s < ch.first) ch.ids.delete(id);
    });
  }

  async #channel(vault: string, channel: string): Promise<Channel> {
    if (!isHexId(channel, 32)) throw new HttpError(400, 'That is not a project channel.');
    const k = key(vault, channel);
    let loading = this.#channels.get(k);
    if (loading === undefined) {
      loading = this.#load(vault, channel);
      this.#channels.set(k, loading);
      loading.catch(() => this.#channels.delete(k));
    }
    return loading;
  }

  async #load(vault: string, channel: string): Promise<Channel> {
    const checkpoint = await this.#store.readJson<LiveCheckpoint>(
      `${dir(vault, channel)}/checkpoint.json`,
    );
    const numbers = (await this.#store.names(dir(vault, channel)))
      .map((name) => /^(\d+)\.json$/.exec(name)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
    const ids = new Map<string, number>();
    for (const seq of numbers) {
      const entry = await this.#store.readJson<LiveEditEntry>(`${dir(vault, channel)}/${seq}.json`);
      if (entry !== null) ids.set(entry.id, seq);
    }
    return {
      seq: Math.max(numbers.at(-1) ?? 0, checkpoint?.seq ?? 0),
      first: numbers[0] ?? 0,
      checkpoint,
      ids,
      waiters: new Set(),
    };
  }

  /** Forgets what is in memory for a vault that was deleted. */
  forget(vault: string): void {
    for (const k of this.#channels.keys()) if (k.startsWith(`${vault}/`)) this.#channels.delete(k);
  }
}

function key(vault: string, channel: string): string {
  return `${vault}/${channel}`;
}

function dir(vault: string, channel: string): string {
  return `vaults/${vault}/live/${channel}`;
}
