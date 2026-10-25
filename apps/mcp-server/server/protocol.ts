/**
 * The Model Context Protocol, as much of it as Bezier speaks, without a library.
 *
 * Serves both eras: a client of the stateless revision (2026-07-28) sends its version in each
 * request's `_meta` and may call `server/discover`; an older client opens with `initialize` and
 * is served under the revision it asked for.
 *
 * No dependencies, since this process reads users' models. Transports (stdio.ts, http.ts) only
 * move lines of JSON.
 */

export const MODERN = '2026-07-28';
export const SUPPORTED = [MODERN, '2025-11-25', '2025-06-18', '2025-03-26'] as const;

const VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';
const SERVER_INFO_KEY = 'io.modelcontextprotocol/serverInfo';

export type Content =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface ToolResult {
  content: Content[];
  structuredContent?: unknown;
  isError?: boolean;
}

export interface ToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
  run(args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ResourceContents {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

export interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  read(): Promise<ResourceContents[]>;
}

export interface Prompt {
  name: string;
  description: string;
  text: string;
}

export interface Catalogue {
  tools(): readonly Tool[];
  resources(): readonly Resource[];
  prompts(): readonly Prompt[];
  /** What the agent should know before its first call. */
  instructions: string;
  /** Told about each call, for the audit line on stderr. */
  onCall?: (tool: string, ok: boolean, ms: number) => void;
}

interface Request {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type Reply = Record<string, unknown> | null;

/** A JSON-RPC error with an MCP code; thrown from handlers, turned into a reply here. */
export class RpcError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

const INVALID_PARAMS = -32602;
const METHOD_NOT_FOUND = -32601;
const UNSUPPORTED_VERSION = -32022;

export const SERVER_INFO = { name: 'bezier', title: 'Bezier', version: '0.1.0' };

/** Lists change only when the app connects or leaves; a short freshness hint keeps that visible. */
const CACHE = { ttlMs: 5_000, cacheScope: 'private' } as const;

export class McpServer {
  /** The legacy revision an `initialize` chose, for this process (stdio) or caller (HTTP). */
  private legacy: string | null = null;
  private readonly catalogue: Catalogue;

  constructor(catalogue: Catalogue) {
    this.catalogue = catalogue;
  }

  /** One line in, at most one line out. Notifications get no reply. */
  async handle(raw: unknown): Promise<Reply> {
    const request = raw as Partial<Request>;
    if (request === null || typeof request !== 'object' || typeof request.method !== 'string') {
      return error(null, -32600, 'Not a JSON-RPC request.');
    }
    const id = request.id;
    const isNotification = id === undefined;
    try {
      const result = await this.dispatch(request.method, request.params ?? {});
      if (isNotification || result === undefined) return null;
      return { jsonrpc: '2.0', id, result };
    } catch (thrown) {
      if (isNotification) return null;
      if (thrown instanceof RpcError) return error(id, thrown.code, thrown.message, thrown.data);
      return error(id, -32603, thrown instanceof Error ? thrown.message : 'Internal error.');
    }
  }

  private async dispatch(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    if (method === 'initialize') return this.initialize(params);
    if (method.startsWith('notifications/')) return undefined;
    const modern = this.modernVersion(params);
    if (method === 'ping') return {};
    const done = (result: Record<string, unknown>) =>
      modern
        ? {
            resultType: 'complete',
            ...result,
            _meta: { [SERVER_INFO_KEY]: SERVER_INFO },
          }
        : result;
    switch (method) {
      case 'server/discover':
        return done({
          supportedVersions: [...SUPPORTED],
          capabilities: CAPABILITIES,
          instructions: this.catalogue.instructions,
          ttlMs: 3_600_000,
          cacheScope: 'public',
        });
      case 'tools/list':
        return done({
          tools: this.catalogue.tools().map(({ run: _run, annotations, ...tool }) => ({
            ...tool,
            title: annotations.title,
            annotations,
          })),
          ...CACHE,
        });
      case 'tools/call':
        return done(await this.call(params));
      case 'resources/list':
        return done({
          resources: this.catalogue.resources().map(({ read: _read, ...resource }) => resource),
          ...CACHE,
        });
      case 'resources/templates/list':
        return done({ resourceTemplates: [], ...CACHE });
      case 'resources/read': {
        const uri = params.uri;
        const found = this.catalogue.resources().find((resource) => resource.uri === uri);
        if (found === undefined) throw new RpcError(INVALID_PARAMS, `There is no ${String(uri)}.`);
        return done({ contents: await found.read(), ...CACHE });
      }
      case 'prompts/list':
        return done({
          prompts: this.catalogue
            .prompts()
            .map(({ name, description }) => ({ name, description, arguments: [] })),
          ...CACHE,
        });
      case 'prompts/get': {
        const prompt = this.catalogue.prompts().find((entry) => entry.name === params.name);
        if (prompt === undefined) throw new RpcError(INVALID_PARAMS, 'There is no such prompt.');
        return done({
          description: prompt.description,
          messages: [{ role: 'user', content: { type: 'text', text: prompt.text } }],
        });
      }
      default:
        throw new RpcError(METHOD_NOT_FOUND, `Bezier has no ${method}.`);
    }
  }

  private initialize(params: Record<string, unknown>): Record<string, unknown> {
    const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
    // A legacy client gets the revision it asked for when it is one we speak, else the newest
    // legacy one; it then decides whether it can go on.
    const legacy = SUPPORTED.filter((version) => version !== MODERN);
    this.legacy = (legacy as readonly string[]).includes(asked) ? asked : (legacy[0] ?? asked);
    return {
      protocolVersion: this.legacy,
      capabilities: CAPABILITIES,
      serverInfo: SERVER_INFO,
      instructions: this.catalogue.instructions,
    };
  }

  /** True for a request of the stateless revision; refuses a version nobody here speaks. */
  private modernVersion(params: Record<string, unknown>): boolean {
    const meta = params._meta;
    const asked =
      meta !== null && typeof meta === 'object'
        ? (meta as Record<string, unknown>)[VERSION_KEY]
        : undefined;
    if (asked === undefined) return false;
    if (asked !== MODERN) {
      throw new RpcError(UNSUPPORTED_VERSION, 'Unsupported protocol version', {
        supported: [...SUPPORTED],
        requested: asked,
      });
    }
    return true;
  }

  private async call(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const tool = this.catalogue.tools().find((entry) => entry.name === params.name);
    if (tool === undefined) throw new RpcError(INVALID_PARAMS, `There is no tool ${params.name}.`);
    const args = params.arguments;
    const given =
      args !== null && typeof args === 'object' ? (args as Record<string, unknown>) : {};
    const started = Date.now();
    try {
      const result = await tool.run(given);
      this.catalogue.onCall?.(tool.name, result.isError !== true, Date.now() - started);
      return { ...result };
    } catch (thrown) {
      this.catalogue.onCall?.(tool.name, false, Date.now() - started);
      // A tool that fails is a result the agent reads and can act on, not a protocol error.
      return {
        content: [{ type: 'text', text: thrown instanceof Error ? thrown.message : 'Failed.' }],
        isError: true,
      };
    }
  }
}

const CAPABILITIES = {
  tools: { listChanged: false },
  resources: { listChanged: false, subscribe: false },
  prompts: { listChanged: false },
};

function error(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown,
): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

/** A text result, the common case. */
export const text = (value: string, structured?: unknown): ToolResult =>
  structured === undefined
    ? { content: [{ type: 'text', text: value }] }
    : { content: [{ type: 'text', text: value }], structuredContent: structured };

/** Reads an argument of a given type, or throws a message the agent can fix its call from. */
export function arg<T extends 'string' | 'number' | 'boolean'>(
  args: Record<string, unknown>,
  name: string,
  type: T,
): (T extends 'string' ? string : T extends 'number' ? number : boolean) | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== type) throw new Error(`${name} must be a ${type}.`);
  return value as never;
}
