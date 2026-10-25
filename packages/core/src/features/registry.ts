/**
 * The feature contract and registry. Each feature is one file declaring its parameters, face tags
 * and rebuild; nothing else switches on feature type (ADR 0008).
 */

import type { EvolutionData, GeometryKernel, KernelResult, Profile, ShapeId } from '@bezier/kernel';
import type { PlaneBasis } from '../rebuild/plane.js';
import type { StableRef } from '../stable-ref.js';
import { canonicalise, type ParamsOf, type ParamsSpec, validateParams } from './params.js';

export type FeatureId = string;

/** What a feature is handed when it rebuilds. */
export interface RebuildInput {
  /** The solid built so far, or null if nothing has been created yet. */
  body: ShapeId | null;
  /**
   * Resolves a stable reference to a live handle for this pass. Async because edges need a kernel
   * call. Returns null when the geometry is gone; the feature must then fail, not guess.
   */
  resolve(ref: StableRef): Promise<ShapeId | null>;
  /**
   * One profile per closed region of a sketch, optionally narrowed to `regions` keys (empty means
   * all). Null if the feature is not a solved sketch.
   */
  profiles(feature: FeatureId, regions?: readonly string[]): readonly Profile[] | null;
  /** The plane a sketch feature stands on, or null if it is not a solved sketch. */
  sketchPlane?(feature: FeatureId): PlaneBasis | null;
  /**
   * The sketch's curves as one sweep path, or a message saying why they are not one. Null if the
   * feature is not a solved sketch.
   */
  path?(feature: FeatureId): Profile | string | null;
  /** Shows an outline of slow work, such as a large import, before it finishes. Optional. */
  preview?(shape: ShapeId): Promise<void>;
}

export interface RebuildOutput {
  /** The body after this feature ran; null when it contributes no solid (e.g. a sketch). */
  body: ShapeId | null;
  /** Which faces the operation changed; null for features that create geometry from nothing. */
  evolution: EvolutionData | null;
  /**
   * Set when the feature removed the last body (ADR 0012). Distinct from a null body, which means
   * "no new solid, keep the current one".
   */
  cleared?: true;
}

export interface FeatureDefinition<S extends ParamsSpec = ParamsSpec> {
  /** The discriminator, saved in documents. */
  readonly type: string;
  /** Shown in the feature tree and the toolbar. */
  readonly label: string;
  /** Drives validation, the property panel and the cache key. */
  readonly params: S;
  /**
   * Face tags this feature produces. A compatibility promise: saved references such as
   * `F:extrude-1:side-2` must keep meaning the same face.
   */
  readonly faceTags: readonly string[];
  /**
   * Per-feature rebuild deadline, overriding the default. Only for work that scales with input,
   * such as large imports; a generous value delays detecting a hung kernel.
   */
  deadlineMs?(params: ParamsOf<S>): number;
  /**
   * Names new faces in kernel order instead of by measurement. Only for geometry that cannot
   * change, like imports, where measuring is most of the work (25 s of area and centre plus 57 s
   * of exact extents on the Voron assembly).
   */
  namesInOrder?(params: ParamsOf<S>): boolean;
  /** Builds the geometry. The only place a feature may call the kernel. */
  rebuild(
    kernel: GeometryKernel,
    params: ParamsOf<S>,
    input: RebuildInput,
  ): Promise<KernelResult<RebuildOutput>>;
}

/** Populated once at module load by `./index.ts`, then read-only. */
const definitions = new Map<string, FeatureDefinition>();

/** Vite keeps this registry module alive while re-evaluating an edited feature module. */
const hotReloading = (import.meta as ImportMeta & { readonly hot?: unknown }).hot !== undefined;

/**
 * Declares and registers a feature, returning the definition. The `const` type parameter keeps
 * `choice` options as literal types for `params` inference.
 */
export function defineFeature<const S extends ParamsSpec>(
  definition: FeatureDefinition<S>,
): FeatureDefinition<S> {
  if (definitions.has(definition.type) && !hotReloading) {
    throw new Error(`feature type "${definition.type}" is already registered`);
  }
  definitions.set(definition.type, definition as unknown as FeatureDefinition);
  return definition;
}

export function getFeature(type: string): FeatureDefinition | undefined {
  return definitions.get(type);
}

/** All registered features. */
export function listFeatures(): readonly FeatureDefinition[] {
  return [...definitions.values()];
}

/** Test-only. */
export function clearRegistryForTesting(): void {
  definitions.clear();
}

/**
 * Validates a saved feature's parameters against its schema, giving a readable error instead of a
 * kernel exception for old, hand-edited or corrupt documents.
 */
export function readParams(
  type: string,
  raw: unknown,
): { ok: true; params: Record<string, unknown> } | { ok: false; message: string } {
  const definition = definitions.get(type);
  if (definition === undefined) {
    // Forward compatibility: report an unknown feature without discarding it.
    return {
      ok: false,
      message: `This document uses a feature this version does not know: "${type}".`,
    };
  }

  const result = validateParams(definition.params, raw);
  if (result.ok) return { ok: true, params: result.params };

  return {
    ok: false,
    message: result.errors.map((e) => e.message).join(' '),
  };
}

/**
 * A feature's rebuild cache key: type, canonical params and the upstream key, so an upstream change
 * invalidates everything downstream (ADR 0007).
 */
export function cacheKey(
  type: string,
  params: Record<string, unknown>,
  upstreamKey: string,
): string {
  const definition = definitions.get(type);
  if (definition === undefined) return `${type}|unknown|${upstreamKey}`;
  return `${type}|${canonicalise(definition.params, params)}|${upstreamKey}`;
}
