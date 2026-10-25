/**
 * @bezier/core: features, rebuild and stable geometry references. Start with ./README.md, then
 * stable-ref.ts.
 */

export type { CadDocument, DocumentMeta, RebuildResult, SavedView } from './document.js';
export { createEmptyDocument, DOCUMENT_SCHEMA_VERSION } from './document.js';
export type { Evaluated, Variable } from './expressions.js';
export {
  evaluate,
  evaluateVariables,
  lookupIn,
  namesIn,
  variableNameProblem,
} from './expressions.js';
export type {
  FeatureDefinition,
  ParamSpec,
  ParamsOf,
  ParamsSpec,
  RebuildInput,
  RebuildOutput,
} from './features/index.js';
export {
  cacheKey,
  canonicalise,
  defineFeature,
  getFeature,
  listFeatures,
  readParams,
  validateParams,
} from './features/index.js';
export type { FeatureId, FeatureRecord, FeatureStatus, SketchPlane } from './features/types.js';
export * from './journal/index.js';
export { parseProjectFile } from './project-file.js';
export type { BodyList, BodySummary } from './rebuild/bodies.js';
export { listBodies, type PartNames } from './rebuild/bodies.js';
export type { CacheEntry } from './rebuild/cache.js';
export { RebuildCache } from './rebuild/cache.js';
export {
  bezierChainAt,
  ellipseAt,
  sampleEllipse,
  sampleSpline,
  splinePoles,
} from './rebuild/curve-math.js';
export {
  LARGE_MODEL_FACES,
  LIGHTWEIGHT_TESSELLATION,
  type TessellationChoice,
  tessellationFor,
} from './rebuild/detail.js';
export type { NamingSnapshot } from './rebuild/naming.js';
export { FaceNaming } from './rebuild/naming.js';
export { readRef } from './rebuild/parsed-refs.js';
export type { PlaneBasis, PlaneLean, SketchSurface } from './rebuild/plane.js';
export {
  faceSketchBasis,
  leanedBasis,
  leanOf,
  planeBasis,
  planeFacing,
  planeNames,
  planeToWorld,
  restingBasis,
  surfaceBasis,
  tiltedBasis,
  worldToPlane,
} from './rebuild/plane.js';
export type { ProfilesResult, SketchProfile } from './rebuild/profile.js';
export { sketchProfiles } from './rebuild/profile.js';
export type { RebuildDeps } from './rebuild/rebuild.js';
export { rebuild } from './rebuild/rebuild.js';
export type { SketchGeometry, SketchRegion } from './rebuild/regions.js';
export { drawnGeometry, regionAt, sketchRegions } from './rebuild/regions.js';
export type { EdgeRef, FaceRef, FaceTag, StableRef, VertexRef } from './stable-ref.js';
export {
  dependentFaces,
  edgeRef,
  faceRef,
  formatRef,
  InvalidRefError,
  isResolvable,
  parseRef,
  refEquals,
  vertexRef,
} from './stable-ref.js';
