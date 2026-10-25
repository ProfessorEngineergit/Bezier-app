/**
 * Geometry failures are expected: every B-Rep kernel fails on real input (fillets on tangent
 * faces, booleans on coincident surfaces, self-intersecting offsets). Nothing in `@bezier/kernel`
 * throws for a geometry failure; operations return a `KernelResult`. Programmer errors, such as
 * passing a disposed handle, still throw.
 */

export type KernelErrorCode =
  /** The operation ran but produced geometry that is not a valid solid. */
  | 'invalid-result'
  /** Boolean failed, usually coincident or near-tangent faces. */
  | 'boolean-failed'
  /** Fillet or chamfer could not be built at the requested size. */
  | 'blend-failed'
  /** The requested radius/distance does not fit the local geometry. */
  | 'radius-too-large'
  /** Offset or shell self-intersected. */
  | 'self-intersection'
  /** A sketch profile was not closed, or crossed itself. */
  | 'open-profile'
  /** Import or export failed to parse or write. */
  | 'io-failed'
  /** The kernel ran out of memory. */
  | 'out-of-memory'
  /** Something went wrong that we have not classified yet. */
  | 'unknown';

export interface KernelError {
  code: KernelErrorCode;
  /** Human-readable, safe to show the user. */
  message: string;
  /** Raw text from OCCT, if any. For bug reports, never shown in the UI. */
  detail?: string;
}

export type KernelResult<T> = { ok: true; value: T } | { ok: false; error: KernelError };

export function ok<T>(value: T): KernelResult<T> {
  return { ok: true, value };
}

export function err<T>(code: KernelErrorCode, message: string, detail?: string): KernelResult<T> {
  return { ok: false, error: detail === undefined ? { code, message } : { code, message, detail } };
}

/** Whether retrying with a gentler parameter (e.g. a smaller radius) might work. */
export function isRecoverable(error: KernelError): boolean {
  switch (error.code) {
    case 'radius-too-large':
    case 'blend-failed':
    case 'self-intersection':
      return true;
    default:
      return false;
  }
}
