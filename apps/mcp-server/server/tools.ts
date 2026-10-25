/**
 * What an assistant can ask Bezier, as MCP tools, resources and one prompt.
 *
 * Docs tools work without a window (articles, keymaps, the computer-use guide); app tools ask the
 * connected window (app-link.ts) about the current model.
 *
 * Read-only apart from settings. The model is edited on screen, so every step goes through the
 * same tools, history and undo. A feature-writing or script tool would be a second, less tested
 * edit path and an attack surface.
 */

import type { AppLink, AppMethod } from './app-link.ts';
import { type AgentDocs, computerUseGuide, readArticle, searchDocs, withKeys } from './docs.ts';
import { arg, type Catalogue, type Prompt, type Resource, type Tool, text } from './protocol.ts';

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const VIEWS = ['current', 'front', 'back', 'top', 'bottom', 'left', 'right', 'iso'] as const;

export function catalogue(docs: AgentDocs, app: AppLink): Catalogue {
  /** The user's keymap as reported by the window; Bezier's own until then. */
  let preset = 'native';

  const ask = async (method: AppMethod, params: Record<string, unknown> = {}) => {
    const value = await app.call(method, params);
    return value as Record<string, unknown>;
  };
  const json = (value: unknown) => text(JSON.stringify(value, null, 1), value);

  const tools: Tool[] = [
    {
      name: 'docs_search',
      description:
        'Search Bezier’s own help articles. Use before operating the app: articles name each control as the screen does and give its key.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words, e.g. "fillet edge" or "orbit view".' },
          limit: { type: 'number', minimum: 1, maximum: 20 },
        },
        required: ['query'],
      },
      annotations: { title: 'Search the docs', ...READ },
      run: async (args) => {
        const found = searchDocs(
          docs,
          arg(args, 'query', 'string') ?? '',
          arg(args, 'limit', 'number') ?? 8,
        );
        const lines = found.map((a) => `- ${a.id}: ${a.title} (${a.area}). ${a.summary}`);
        return text(lines.length === 0 ? 'Nothing matched. Try other words.' : lines.join('\n'), {
          results: found.map(({ id, title, area, summary }) => ({ id, title, area, summary })),
        });
      },
    },
    {
      name: 'docs_read',
      description:
        'Read one help article with its steps and keys for the person’s keymap. With pictures, each comes as an image with where its arrows point.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'An id from docs_search, e.g. "extrude".' },
          pictures: { type: 'boolean', description: 'Include the pictures (default true).' },
        },
        required: ['id'],
      },
      annotations: { title: 'Read an article', ...READ },
      run: async (args) => {
        const id = arg(args, 'id', 'string');
        const article = docs.articles.find((entry) => entry.id === id);
        if (article === undefined) throw new Error(`There is no article ${id}. Use docs_search.`);
        return {
          content: readArticle(docs, article, preset, arg(args, 'pictures', 'boolean') ?? true),
        };
      },
    },
    {
      name: 'keymap',
      description:
        'Every keyboard action and its key. Defaults to the keymap the connected window uses. Keys cannot miss; prefer them to clicks.',
      inputSchema: {
        type: 'object',
        properties: {
          preset: {
            type: 'string',
            description: 'native, fusion360, solidworks, onshape, blender…',
          },
        },
      },
      annotations: { title: 'Keyboard shortcuts', ...READ },
      run: async (args) => {
        const chosen = arg(args, 'preset', 'string') ?? preset;
        const rows = docs.keymap.actions.map(
          (action) =>
            `${action.group} · ${action.label} (${action.id}): ${action.keys[chosen] ?? 'no key'}`,
        );
        return text(`Keymap: ${chosen}\n${rows.join('\n')}`);
      },
    },
    {
      name: 'computer_use_guide',
      description:
        'How to operate Bezier by screenshots, pointer and keyboard with this server alongside. Read once at the start.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { title: 'Guide to operating Bezier', ...READ },
      run: async () => text(computerUseGuide()),
    },
    {
      name: 'app_connect',
      description:
        'Whether a Bezier window is connected, and if not, the pairing code to give the person. Call this first when an app tool says no window is connected.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { title: 'Connect to Bezier', ...READ },
      run: async () => {
        const info = app.connected;
        if (info !== null) return json({ connected: true, ...info });
        return text(
          `No Bezier window is connected. Ask the person to open Bezier, then Settings → MCP & Automation, switch on “Let assistants connect” and enter the code ${app.code}.`,
          { connected: false, code: app.code },
        );
      },
    },
    {
      name: 'app_status',
      description:
        'What the window shows now: workspace, open project, whether a sketch is being edited, the selection, window size and the keymap in use. Call it whenever unsure what mode the app is in.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { title: 'App status', ...READ },
      run: async () => {
        const status = await ask('status');
        if (typeof status.keymap === 'string') preset = status.keymap;
        return json(status);
      },
    },
    {
      name: 'project_read',
      description:
        'The open model: every step of its history with its state (ok, failed and why, suppressed), parameters, expressions, variables, bodies with their size, and recent edits. The way to check that an action worked.',
      inputSchema: {
        type: 'object',
        properties: {
          detail: {
            type: 'string',
            enum: ['summary', 'full'],
            description: 'summary (default) leaves out each step’s parameters.',
          },
        },
      },
      annotations: { title: 'Read the model', ...READ },
      run: async (args) =>
        json(await ask('project', { detail: arg(args, 'detail', 'string') ?? 'summary' })),
    },
    {
      name: 'selection_read',
      description: 'What is selected, by stable reference (e.g. F:extrude-1:side-2) and by body.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { title: 'Read the selection', ...READ },
      run: async () => json(await ask('selection')),
    },
    {
      name: 'viewport_screenshot',
      description:
        'A PNG of the model alone, without the interface, from the current view or a named one. Works while dialogs are open. A named view moves the person’s camera there.',
      inputSchema: {
        type: 'object',
        properties: {
          view: { type: 'string', enum: [...VIEWS] },
          scale: {
            type: 'number',
            minimum: 0.25,
            maximum: 2,
            description: 'Size, 1 = as on screen.',
          },
        },
      },
      annotations: { title: 'Look at the model', ...READ, idempotentHint: false },
      run: async (args) => {
        const shot = await ask('screenshot', {
          view: arg(args, 'view', 'string') ?? 'current',
          scale: arg(args, 'scale', 'number') ?? 1,
        });
        if (typeof shot.png !== 'string') throw new Error('The window sent no picture.');
        return {
          content: [
            { type: 'image', data: shot.png, mimeType: 'image/png' },
            {
              type: 'text',
              text: `View: ${String(shot.view)}, ${String(shot.width)}×${String(shot.height)} px.`,
            },
          ],
        };
      },
    },
    {
      name: 'ui_map',
      description:
        'Every visible control in the window: role, name, key, whether it is pressed or disabled, and its rectangle in CSS pixels with the device pixel ratio. For clicking the right place when operating by sight.',
      inputSchema: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: 'Only controls whose name contains this.' },
        },
      },
      annotations: { title: 'Map of the interface', ...READ },
      run: async (args) => json(await ask('ui', { filter: arg(args, 'filter', 'string') ?? '' })),
    },
    {
      name: 'settings_read',
      description: 'Every setting, its value now and the values it can take.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { title: 'Read settings', ...READ },
      run: async () => json(await ask('settings.read')),
    },
    {
      name: 'settings_write',
      description:
        'Change settings, e.g. {"theme": "dark", "quality": "low"}. Values are checked by Bezier; the person sees each change and can put it back.',
      inputSchema: {
        type: 'object',
        properties: { changes: { type: 'object', description: 'Setting name to new value.' } },
        required: ['changes'],
      },
      annotations: {
        title: 'Change settings',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      run: async (args) => {
        const changes = args.changes;
        if (changes === null || typeof changes !== 'object')
          throw new Error('changes must be an object.');
        return json(await ask('settings.write', { changes }));
      },
    },
    {
      name: 'performance_read',
      description:
        'Frame rate and frame times measured for a moment, where recent edits spent their time (journal, rebuild, display), the size of what is drawn, memory and the graphics card.',
      inputSchema: {
        type: 'object',
        properties: { sampleMs: { type: 'number', minimum: 250, maximum: 5000 } },
      },
      annotations: { title: 'Measure performance', ...READ, idempotentHint: false },
      run: async (args) =>
        json(await ask('performance', { sampleMs: arg(args, 'sampleMs', 'number') ?? 1000 })),
    },
  ];

  const resources: Resource[] = [
    {
      uri: 'bezier://guide/computer-use',
      name: 'computer-use',
      description: 'Operating Bezier by screenshots, pointer and keyboard.',
      mimeType: 'text/markdown',
      read: async () => [
        { uri: 'bezier://guide/computer-use', mimeType: 'text/markdown', text: computerUseGuide() },
      ],
    },
    ...docs.articles.map(
      (article): Resource => ({
        uri: `bezier://docs/${article.id}`,
        name: article.id,
        description: `${article.title}: ${article.summary}`,
        mimeType: 'text/markdown',
        read: async () => [
          {
            uri: `bezier://docs/${article.id}`,
            mimeType: 'text/markdown',
            text: `# ${article.title}\n\n${withKeys(article.body, docs, preset)}`,
          },
        ],
      }),
    ),
  ];

  const prompts: Prompt[] = [
    {
      name: 'operate-bezier',
      description:
        'Work in Bezier by sight, with the docs, the interface map and the model to check against.',
      text:
        'You will operate Bezier, a parametric CAD app, through the screen. First call computer_use_guide and app_status. ' +
        'Before each task, docs_search and docs_read the article for it. Locate controls with ui_map, prefer keys from keymap, ' +
        'type numbers into fields instead of dragging. After every step call project_read and confirm the new step is ok before going on. ' +
        'Use viewport_screenshot with a named view to look at the result. Never repeat a click that did nothing: read app_status first.',
    },
  ];

  return {
    tools: () => tools,
    resources: () => resources,
    prompts: () => prompts,
    instructions:
      'Bezier is local-first parametric CAD. This server gives you its docs, the live state of a connected Bezier window ' +
      '(model, selection, interface map, viewport pictures, performance) and its settings. It does not edit the model: ' +
      'do that on screen, then verify with project_read. Start with computer_use_guide, then app_status; if no window is ' +
      'connected, app_connect gives the pairing code for the person.',
  };
}
