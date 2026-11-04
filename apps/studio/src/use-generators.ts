/**
 * Parts made from their numbers: gears, springs, plain solids, and what follows a path. The command
 * builds one with the feature's defaults and opens it in the inspector, where the numbers are
 * changed. A pipe or a rib starts on the latest open sketch; the inspector can change that too.
 */

import { type FeatureId, getFeature } from '@bezier/core';
import type { Session, SessionView } from './session.js';
import { addOrExplain } from './use-geometry.js';

const NAMES = {
  gear: 'Gear',
  spring: 'Spring',
  pipe: 'Pipe',
  rib: 'Rib',
  'snap-fit': 'Snap fit',
  'fit-test': 'Fit test',
  box: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
  cone: 'Cone',
  torus: 'Torus',
} as const;

type Generator = keyof typeof NAMES;

export const isGenerator = (id: string): id is Generator => id in NAMES;

/** Plain solids are one feature, told apart by their shape. */
const PLAIN: readonly Generator[] = ['box', 'cylinder', 'sphere', 'cone', 'torus'];
const featureOf = (id: Generator) => (PLAIN.includes(id) ? 'primitive' : id);

/** The feature's own default for every number and choice. */
function defaultsOf(id: Generator): Record<string, unknown> {
  const spec = getFeature(featureOf(id))?.params ?? {};
  const values: Record<string, unknown> = {};
  for (const [name, param] of Object.entries(spec)) {
    if ('default' in param) values[name] = param.default;
  }
  return values;
}

export function addGenerated(
  type: Generator,
  {
    run,
    view,
    say,
    setSelectedFeature,
  }: {
    run: (change: (session: Session) => Promise<SessionView>) => unknown;
    view: SessionView | null;
    say: (message: string) => void;
    setSelectedFeature: (id: FeatureId | null) => void;
  },
): void {
  const params = defaultsOf(type);
  if (featureOf(type) === 'primitive') params.shape = type;
  if (type === 'pipe' || type === 'rib') {
    const path = (view?.document.features ?? [])
      .filter((f) => f.type === 'sketch' && (view?.sketches.get(f.id)?.regions.length ?? 0) === 0)
      .at(-1)?.id;
    if (path === undefined) {
      say(`A ${NAMES[type].toLowerCase()} follows a path: draw an open line in a sketch first.`);
      return;
    }
    params.path = path;
  }
  const id = `${type}-${String(Date.now())}`;
  void run(async (session) => {
    const built = await addOrExplain(session, say, id, NAMES[type], {
      op: 'addFeature',
      id,
      type: featureOf(type),
      name: NAMES[type],
      index: session.document.features.length,
      params,
    });
    setSelectedFeature(id);
    return built;
  });
}
