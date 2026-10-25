/** Boundary validation for downloadable lesson checkpoints and portable projects. */
import { type CadDocument, DOCUMENT_SCHEMA_VERSION, type SavedView } from './document.js';
import { readParams } from './features/registry.js';
import type { FeatureRecord } from './features/types.js';

export function parseProjectFile(text: string): CadDocument {
  // A backup holds its imported files, which can be hundreds of megabytes (the Voron's 241 MB).
  if (text.length > 600_000_000) throw new Error('Project files must be smaller than 600 MB.');
  const value: unknown = JSON.parse(text);
  const record = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!record(value) || !record(value.meta) || !Array.isArray(value.features))
    throw new Error('This is not a Bezier project file.');
  const meta = value.meta;
  if (meta.schemaVersion !== DOCUMENT_SCHEMA_VERSION)
    throw new Error('This project uses an unsupported document version.');
  if (
    typeof meta.name !== 'string' ||
    typeof meta.createdAt !== 'string' ||
    typeof meta.modifiedAt !== 'string' ||
    !['mm', 'cm', 'in'].includes(String(meta.displayUnits))
  )
    throw new Error('Project metadata is incomplete.');
  const hidden = meta.hiddenBodies;
  if (
    hidden !== undefined &&
    (!Array.isArray(hidden) || !hidden.every((key): key is string => typeof key === 'string'))
  )
    throw new Error('Project metadata lists hidden bodies it cannot read.');
  const names = meta.bodyNames;
  if (
    names !== undefined &&
    (!record(names) || !Object.values(names).every((name) => typeof name === 'string'))
  )
    throw new Error('Project metadata names bodies in a way it cannot read.');
  const folders = meta.bodyFolders;
  if (
    folders !== undefined &&
    (!record(folders) || !Object.values(folders).every((name) => typeof name === 'string'))
  )
    throw new Error('Project metadata files bodies in a way it cannot read.');
  const variables = meta.variables;
  if (
    variables !== undefined &&
    (!Array.isArray(variables) ||
      !variables.every(
        (entry) =>
          record(entry) && typeof entry.name === 'string' && typeof entry.expression === 'string',
      ))
  )
    throw new Error('Project metadata lists variables it cannot read.');
  const views = meta.savedViews;
  const triple = (v: unknown) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n));
  if (
    views !== undefined &&
    (!Array.isArray(views) ||
      !views.every(
        (view) =>
          record(view) &&
          typeof view.name === 'string' &&
          triple(view.position) &&
          triple(view.target) &&
          typeof view.parallel === 'boolean' &&
          typeof view.zoom === 'number',
      ))
  )
    throw new Error('Project metadata lists saved views it cannot read.');
  if (value.features.length > 2000)
    throw new Error('This project exceeds the 2,000 feature import limit.');
  const ids = new Set<string>();
  const features: FeatureRecord[] = value.features.map((f: unknown) => {
    if (
      !record(f) ||
      typeof f.id !== 'string' ||
      typeof f.type !== 'string' ||
      typeof f.name !== 'string' ||
      !record(f.params)
    )
      throw new Error('A project feature is incomplete.');
    if (!f.id || ids.has(f.id)) throw new Error('Project feature identifiers must be unique.');
    ids.add(f.id);
    if (f.suppressed !== undefined && typeof f.suppressed !== 'boolean')
      throw new Error('Invalid feature suppression state.');
    const expressions = f.expressions;
    if (
      expressions !== undefined &&
      (!record(expressions) ||
        !Object.values(expressions).every((text) => typeof text === 'string'))
    )
      throw new Error(`${f.name}: its expressions cannot be read.`);
    const result = readParams(f.type, f.params);
    if (!result.ok) throw new Error(`${f.name}: ${result.message}`);
    return {
      id: f.id,
      type: f.type,
      name: f.name,
      params: result.params,
      ...(f.suppressed === undefined ? {} : { suppressed: f.suppressed }),
      ...(record(expressions) && Object.keys(expressions).length > 0
        ? { expressions: expressions as Record<string, string> }
        : {}),
    };
  });
  return {
    meta: {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      name: meta.name,
      createdAt: meta.createdAt,
      modifiedAt: meta.modifiedAt,
      displayUnits: meta.displayUnits as 'mm' | 'cm' | 'in',
      ...(Array.isArray(hidden) && hidden.length > 0
        ? { hiddenBodies: hidden.map(String).sort() }
        : {}),
      ...(record(names) && Object.keys(names).length > 0
        ? { bodyNames: names as Record<string, string> }
        : {}),
      ...(record(folders) && Object.keys(folders).length > 0
        ? { bodyFolders: folders as Record<string, string> }
        : {}),
      ...(Array.isArray(variables) && variables.length > 0
        ? {
            variables: (variables as { name: string; expression: string }[]).map((entry) => ({
              name: entry.name,
              expression: entry.expression,
            })),
          }
        : {}),
      ...(Array.isArray(views) && views.length > 0 ? { savedViews: views as SavedView[] } : {}),
    },
    features,
  };
}
