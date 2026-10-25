/**
 * Registers every feature by importing its module (ADR 0008). Keep this file free of logic.
 */

import './extrude.js';
import './face-extrude.js';
import './cylinder-radius.js';
import './revolve.js';
import './loft.js';
import './sweep.js';
import './wrap.js';
import './sketch.js';
import './fillet.js';
import './chamfer.js';
import './remove-faces.js';
import './move.js';
import './move-parts.js';
import './rotate.js';
import './align.js';
import './joint.js';
import './transform-copy.js';
import './shell.js';
import './remove-body.js';
import './combine.js';
import './scale.js';
import './split-body.js';
import './import-step.js';
import './hole.js';
import './mirror.js';
import './pattern.js';
import './reference-mesh.js';
import './reference-image.js';

export type { ParamError, ParamSpec, ParamsOf, ParamsSpec } from './params.js';
export { canonicalise, validateParams } from './params.js';
export type {
  FeatureDefinition,
  FeatureId,
  RebuildInput,
  RebuildOutput,
} from './registry.js';
export {
  cacheKey,
  clearRegistryForTesting,
  defineFeature,
  getFeature,
  listFeatures,
  readParams,
} from './registry.js';
