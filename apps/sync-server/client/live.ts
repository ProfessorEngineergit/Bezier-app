/**
 * One live project on the wire: send an edit, wait for the next ones, write and read a
 * checkpoint. Everything is sealed here with the vault key before it leaves the device
 * and opened here when it comes back; the server only ever holds ciphertext in order
 * (server/live.ts).
 *
 * Knows nothing of what an edit means: the app gives it JSON-able operations and gets
 * them back. `live-sync.ts` keeps a project current with it.
 */

import { concat, fromB64, fromUtf8, toB64, utf8 } from '../protocol/bytes.ts';
import { openObject, openValue, refId, sealObject, sealValue } from '../protocol/crypto.ts';
import type { LiveEditEntry, LivePoll } from '../protocol/wire.ts';
import type { Connection } from './connection.ts';
import type { LiveEdit, Sequenced } from './live-state.ts';
import type { VaultHandle } from './vault-client.ts';

/** Above this an edit travels as an object: an imported file can be megabytes. */
const INLINE_LIMIT = 48 * 1024;
const CHUNK = 4 * 1024 * 1024;

/** Someone else's edit, or this device's, as it came back in the server's order. */
export interface ArrivedEdit<Op> extends Sequenced<Op> {
  /** The member who made it. */
  readonly user: string;
  readonly at: string;
}

export interface Arrived<Doc, Op> {
  /** The last edit number given out. */
  readonly seq: number;
  /** When the edits asked for are gone: the whole document after `checkpoint.seq`. */
  readonly checkpoint?: { readonly seq: number; readonly document: Doc };
  readonly edits: readonly ArrivedEdit<Op>[];
}

/** How a document becomes bytes and back. The app's is its project file format. */
export interface DocumentCodec<Doc> {
  encode(document: Doc): Uint8Array;
  decode(bytes: Uint8Array): Doc;
}

/** The server-side id of a project's live channel: keyed, like a branch id. */
export function liveChannelId(vault: VaultHandle, project: string): Promise<string> {
  return refId(vault.keyring, `live:${project}`);
}

export class LiveChannel<Doc, Op> {
  readonly #conn: Connection;
  readonly #vault: VaultHandle;
  readonly #channel: string;
  readonly #codec: DocumentCodec<Doc>;

  private constructor(
    conn: Connection,
    vault: VaultHandle,
    channel: string,
    codec: DocumentCodec<Doc>,
  ) {
    this.#conn = conn;
    this.#vault = vault;
    this.#channel = channel;
    this.#codec = codec;
  }

  static async open<Doc, Op>(
    conn: Connection,
    vault: VaultHandle,
    project: string,
    codec: DocumentCodec<Doc>,
  ): Promise<LiveChannel<Doc, Op>> {
    return new LiveChannel(conn, vault, await liveChannelId(vault, project), codec);
  }

  get #path(): string {
    return `/v1/vaults/${this.#vault.id}/live/${this.#channel}`;
  }

  /** Sends an edit; answers with its number in the server's order. */
  async send(edit: LiveEdit<Op>): Promise<number> {
    const sealed = await sealValue(this.#vault.keyring, { ops: edit.ops }, 'live-edit');
    const body =
      sealed.length <= INLINE_LIMIT
        ? { id: edit.id, sealed: toB64(sealed) }
        : { id: edit.id, object: await this.#putBlob(utf8(JSON.stringify({ ops: edit.ops }))) };
    const { seq } = (await this.#conn.call('POST', this.#path, body)) as { seq: number };
    return seq;
  }

  /**
   * The edits after `after`. With `wait`, the server holds the answer until there is one
   * or about half a minute has passed; `signal` ends the wait early.
   */
  async poll(after: number, wait: boolean, signal?: AbortSignal): Promise<Arrived<Doc, Op>> {
    return this.#poll(`?after=${after}${wait ? '&wait=1' : ''}`, signal);
  }

  /** From nothing: the checkpoint and the edits after it. Null if the project is not live. */
  async start(): Promise<
    (Arrived<Doc, Op> & { checkpoint: { seq: number; document: Doc } }) | null
  > {
    const res = await this.#poll('?after=0&fresh=1');
    return res.checkpoint === undefined ? null : { ...res, checkpoint: res.checkpoint };
  }

  /** Makes a project live, starting from `document`. */
  async create(document: Doc): Promise<void> {
    await this.checkpoint(0, document);
  }

  async #poll(query: string, signal?: AbortSignal): Promise<Arrived<Doc, Op>> {
    const res = (await this.#conn.call(
      'GET',
      `${this.#path}${query}`,
      undefined,
      true,
      signal,
    )) as LivePoll;
    const checkpoint =
      res.checkpoint === undefined
        ? undefined
        : {
            seq: res.checkpoint.seq,
            document: this.#codec.decode(await this.#getBlob(res.checkpoint.object)),
          };
    const edits: ArrivedEdit<Op>[] = [];
    for (const entry of res.edits) edits.push(await this.#open(entry));
    return { seq: res.seq, ...(checkpoint === undefined ? {} : { checkpoint }), edits };
  }

  /** Stores the whole document as it stands after edit `seq`. */
  async checkpoint(seq: number, document: Doc): Promise<void> {
    const object = await this.#putBlob(this.#codec.encode(document));
    await this.#conn.call('PUT', `${this.#path}/checkpoint`, { seq, object });
  }

  async #open(entry: LiveEditEntry): Promise<ArrivedEdit<Op>> {
    let value: unknown;
    if (entry.sealed !== undefined) {
      value = await openValue(this.#vault.keyring, fromB64(entry.sealed), 'live-edit');
    } else {
      value = JSON.parse(fromUtf8(await this.#getBlob(entry.object ?? '')));
    }
    const ops = (value as { ops?: unknown }).ops;
    // A member's edit is someone else's input: the shape is checked here, the content by
    // the app's own `apply`, which refuses what does not fit the document.
    if (!Array.isArray(ops)) throw new Error('A live edit could not be read.');
    return { seq: entry.seq, id: entry.id, user: entry.user, at: entry.at, ops: ops as Op[] };
  }

  /** Bytes as sealed objects: one per 4 MiB and an index naming them in order. */
  async #putBlob(bytes: Uint8Array): Promise<string> {
    const chunks: string[] = [];
    for (let at = 0; at < bytes.length || chunks.length === 0; at += CHUNK) {
      chunks.push(await this.#upload(concat(Uint8Array.of(0), bytes.subarray(at, at + CHUNK))));
    }
    return this.#upload(
      concat(Uint8Array.of(1), utf8(JSON.stringify({ size: bytes.length, chunks }))),
    );
  }

  async #upload(plain: Uint8Array): Promise<string> {
    const { id, sealed } = await sealObject(this.#vault.keyring, plain);
    await this.#conn.putObject(this.#vault.id, id, sealed);
    return id;
  }

  async #getBlob(id: string): Promise<Uint8Array> {
    const index = await this.#get(id);
    if (index[0] !== 1) throw new Error('A live object could not be read.');
    const { size, chunks } = JSON.parse(fromUtf8(index.subarray(1))) as {
      size: number;
      chunks: string[];
    };
    const out = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      const part = (await this.#get(chunk)).subarray(1);
      out.set(part, at);
      at += part.length;
    }
    return out;
  }

  async #get(id: string): Promise<Uint8Array> {
    return openObject(this.#vault.keyring, id, await this.#conn.getObject(this.#vault.id, id));
  }
}
