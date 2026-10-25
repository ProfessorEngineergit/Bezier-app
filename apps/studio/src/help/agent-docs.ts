/**
 * Serializes the help articles for the MCP server (`apps/mcp-server/`), so an agent knows control
 * names, locations and shortcuts. `agent-docs.test.ts` fails when the generated file is stale.
 *
 * Keys stay as `{{key:action}}` with a table for every preset, since the user may use any keymap;
 * the server resolves them once a window is connected.
 */

import { KEY_ACTIONS, KEYMAP_PRESETS, resolveKeymap } from '@bezier/ui';
import { CATEGORIES } from '../settings-catalog.js';
import { ARTICLES } from './articles/index.js';

export interface AgentDocs {
  format: 'bezier-agent-docs';
  version: 1;
  articles: readonly {
    id: string;
    title: string;
    area: string;
    summary: string;
    keywords: string;
    body: string;
    /** By name: file under `apps/studio/public`, alt text and arrow positions. */
    images: Readonly<
      Record<
        string,
        {
          file: string;
          alt: string;
          arrows: readonly { x1: number; y1: number; x2: number; y2: number }[];
        }
      >
    >;
    actions: readonly string[];
    features: readonly string[];
    settings: readonly string[];
    places: readonly string[];
  }[];
  keymap: {
    presets: readonly { id: string; label: string }[];
    /** Every action with its key per preset; presets without a binding are omitted. */
    actions: readonly { id: string; label: string; group: string; keys: Record<string, string> }[];
  };
  settings: readonly { id: string; label: string; group: string }[];
}

export function agentDocs(): AgentDocs {
  const maps = KEYMAP_PRESETS.map((preset) => [preset.id, resolveKeymap(preset.id, {})] as const);
  return {
    format: 'bezier-agent-docs',
    version: 1,
    articles: ARTICLES.map((article) => ({
      id: article.id,
      title: article.title,
      area: article.area,
      summary: article.summary,
      keywords: article.keywords,
      body: article.body,
      images: Object.fromEntries(
        Object.entries(article.images).map(([name, image]) => [
          name,
          { file: image.src, alt: image.alt, arrows: image.arrows },
        ]),
      ),
      actions: article.actions ?? [],
      features: article.features ?? [],
      settings: article.settings ?? [],
      places: article.places ?? [],
    })),
    keymap: {
      presets: KEYMAP_PRESETS.map(({ id, label }) => ({ id, label })),
      actions: KEY_ACTIONS.map((action) => ({
        id: action.id,
        label: action.label,
        group: action.group,
        keys: Object.fromEntries(
          maps.flatMap(([preset, map]) => {
            const key = map.get(action.id);
            return key === undefined ? [] : [[preset, key]];
          }),
        ),
      })),
    },
    settings: CATEGORIES.map(({ id, label, group }) => ({ id, label, group })),
  };
}
