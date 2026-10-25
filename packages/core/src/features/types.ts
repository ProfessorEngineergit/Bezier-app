/**
 * How a feature is stored in a document. Generic: the registry knows each type and schema
 * (ADR 0008), so adding a feature does not touch this file.
 */

export type FeatureId = string;

/** Origin planes a sketch can be placed on. */
export type SketchPlane = 'XY' | 'XZ' | 'YZ';

/**
 * One history entry. `params` is untyped until `readParams()` validates it against the schema for
 * `type`.
 */
export interface FeatureRecord {
  id: FeatureId;
  /** Registry type; may be unknown to this build. */
  type: string;
  /** Display name in the tree. */
  name: string;
  params: Readonly<Record<string, unknown>>;
  /** Kept in the history but skipped by the rebuild. */
  suppressed?: boolean;
  /**
   * Parameter expressions by key. The evaluated result overrides the stored number, which is kept
   * for when the expression is removed. Absent when none.
   */
  expressions?: Readonly<Record<string, string>>;
}

/** What happened to one feature during a rebuild. */
export type FeatureStatus =
  | { state: 'ok' }
  /** The kernel refused; the feature is skipped. */
  | { state: 'failed'; message: string }
  /** A referenced entity no longer exists. */
  | { state: 'dangling'; message: string; lostRefs: readonly string[] }
  /** Skipped because a dependency failed. */
  | { state: 'blocked'; message: string }
  /** Suppressed by the user. */
  | { state: 'suppressed' }
  /** Unknown feature type (ADR 0008). */
  | { state: 'unknown-type'; message: string };
