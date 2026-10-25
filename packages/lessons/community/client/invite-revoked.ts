/**
 * Revoked invitation ids, written by `pnpm invite revoke <id>`. Revocation only takes effect with
 * the next app release; for a sooner end, issue codes with an expiry (`pnpm invite new --days`).
 */
export const REVOKED_INVITES: readonly string[] = ['c8abbfa0a6e6'];
