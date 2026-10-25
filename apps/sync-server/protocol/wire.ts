/**
 * The HTTP API between app and server, as types. Bytes travel as base64url inside JSON,
 * except object bodies, which are raw so a large chunk is not inflated by a third.
 *
 *   GET    /v1/health                          replicas and their state, no auth
 *   POST   /v1/users                           register public keys
 *   GET    /v1/users/:user                     someone's public keys, to share with them
 *   POST   /v1/auth/challenge                  a nonce to sign
 *   POST   /v1/auth/session                    the signed nonce, for a session token
 *   GET    /v1/vaults                          the vaults I belong to
 *   POST   /v1/vaults                          create one
 *   GET    /v1/vaults/:v                       members, protected branches, invites, usage
 *   PUT    /v1/vaults/:v/meta                  rename (admin)
 *   DELETE /v1/vaults/:v                       delete with everything in it (admin)
 *   PUT    /v1/vaults/:v/profile               my sealed display name in this vault
 *   PUT    /v1/vaults/:v/members/:user         add or change a member (admin)
 *   DELETE /v1/vaults/:v/members/:user         remove one (admin), or leave (self)
 *   POST   /v1/vaults/:v/rotate                new key epoch for the remaining members (admin)
 *   PUT    /v1/vaults/:v/protected             branches only admins may move (admin)
 *   POST   /v1/vaults/:v/invites               create an invite (admin)
 *   DELETE /v1/vaults/:v/invites/:hash         withdraw one (admin)
 *   POST   /v1/vaults/:v/invites/open          read an invite's sealed keyring
 *   POST   /v1/vaults/:v/invites/claim         join with it
 *   POST   /v1/vaults/:v/objects/missing       which of these ids the server lacks
 *   PUT    /v1/vaults/:v/objects/:id           upload (raw body, id = sha256 of body)
 *   GET    /v1/vaults/:v/objects/:id           download
 *   GET    /v1/vaults/:v/refs                  every branch head, sealed
 *   PUT    /v1/vaults/:v/refs/:ref             move one, compare-and-swap on `ifMatch`
 *   DELETE /v1/vaults/:v/refs/:ref             delete one, same rule
 *   GET    /v1/vaults/:v/presence              who has what open right now, sealed
 *   PUT    /v1/vaults/:v/presence/:device      I am here (a heartbeat, gone after its ttl)
 *   DELETE /v1/vaults/:v/presence/:device      I left
 *   GET    /v1/vaults/:v/live/:ch?after=n&wait=1  a live project's edits after n, waiting for one;
 *                                              `fresh=1` starts at the checkpoint
 *   POST   /v1/vaults/:v/live/:ch              send an edit (writer); answers with its number
 *   PUT    /v1/vaults/:v/live/:ch/checkpoint   the whole document after edit n, as an object (writer)
 *   POST   /v1/vaults/:v/views                 create a read-only link (writer)
 *   DELETE /v1/vaults/:v/views/:hash           withdraw one (writer)
 *   POST   /v1/vaults/:v/views/open            the sealed keyring behind a link (link holder)
 *   GET    /v1/mirror/manifest                 everything a mirror needs to catch up (mirror token)
 *   GET    /v1/mirror/vaults/:v/objects/:id    one object, for a mirror
 *
 * A read-only link reaches only the read routes, with `X-Bezier-View: <token>` in place of
 * a session. A mirror uses `Authorization: Mirror <token>` and reaches only /v1/mirror.
 */

export const ROLES = ['reader', 'writer', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const RANK: Readonly<Record<Role, number>> = { reader: 0, writer: 1, admin: 2 };

export function atLeast(role: Role, needed: Role): boolean {
  return RANK[role] >= RANK[needed];
}

export interface RegisterRequest {
  signPublic: string;
  boxPublic: string;
  /** The server's enrollment code, or a vault invite token. One of them is required. */
  enrollment?: string;
  invite?: { vault: string; token: string };
}

export interface PublicUser {
  userId: string;
  signPublic: string;
  boxPublic: string;
}

export interface ChallengeResponse {
  nonce: string;
}

export interface SessionRequest {
  userId: string;
  nonce: string;
  signature: string;
}

export interface SessionResponse {
  token: string;
  expiresAt: string;
}

export interface VaultSummary {
  vault: string;
  role: Role;
  /** This user's copy of the keyring, wrapped to their box key. */
  wrappedKey: string;
  /** Sealed with the vault key: the name and anything else the app wants. */
  meta: string;
  /** The newest key epoch. A keyring with fewer epochs is out of date. */
  epoch: number;
}

export interface MemberInfo {
  userId: string;
  role: Role;
  addedAt: string;
  /** Sealed with the vault key by the member themself: their display name. */
  profile?: string;
}

export interface InviteInfo {
  /** The token hash, which is also how an invite is withdrawn. */
  id: string;
  role: Role;
  expiresAt: string;
  uses: number;
}

export interface ViewInfo {
  /** The token hash, which is also how a link is withdrawn. */
  id: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  /** Sealed with the vault key: what the link was made for. */
  label: string;
}

export interface VaultDetail extends VaultSummary {
  createdAt: string;
  members: MemberInfo[];
  /** Ref ids only admins may move. */
  protected: string[];
  /** Pending invites; only admins see them. */
  invites: InviteInfo[];
  /** Read-only links; writers and admins see them. */
  views: ViewInfo[];
  /** Bytes of sealed objects stored, and the limit, if the server sets one. */
  usage: { bytes: number; limit: number | null };
}

export interface CreateVaultRequest {
  wrappedKey: string;
  meta: string;
}

export interface MemberRequest {
  role: Role;
  wrappedKey: string;
  /** The epoch the wrapped keyring ends at. Refused if a rotation happened meanwhile. */
  epoch: number;
}

export interface RotateRequest {
  /** The epoch the caller rotated from. Refused if it is not the current one. */
  fromEpoch: number;
  /** A freshly wrapped keyring for every remaining member, and nobody else. */
  wrappedKeys: Record<string, string>;
  /** The vault's metadata sealed under the new epoch. */
  meta: string;
}

export interface InviteRequest {
  tokenHash: string;
  role: Role;
  /** The keyring sealed with the link secret. */
  payload: string;
  expiresAt: string;
  uses: number;
  epoch: number;
}

export interface ViewRequest {
  tokenHash: string;
  /** The keyring sealed with the link secret. */
  payload: string;
  expiresAt: string;
  label: string;
  epoch: number;
}

export interface PresenceEntry {
  userId: string;
  device: string;
  /** Sealed with the vault key by the device: who, on which machine, doing what. */
  sealed: string;
  expiresAt: string;
}

export interface PresenceRequest {
  sealed: string;
  /** Seconds until the entry is gone unless renewed. The server caps it. */
  ttl: number;
}

/** An edit to a live project, as a device sends it. Exactly one of `sealed` and `object`. */
export interface LivePost {
  /** Chosen by the device, 24 hex; sending it again does not record it twice. */
  id: string;
  /** The edit sealed with the vault key, base64url, for one up to 64 KiB. */
  sealed?: string;
  /** A larger edit, uploaded first as an object. */
  object?: string;
}

export interface LiveEditEntry {
  seq: number;
  id: string;
  /** The member who sent it. */
  user: string;
  at: string;
  sealed?: string;
  object?: string;
}

export interface LiveCheckpoint {
  /** The last edit the document includes. */
  seq: number;
  /** The document, sealed as an object. */
  object: string;
}

export interface LivePoll {
  /** The last edit number given out. */
  seq: number;
  /** Present when the edits asked for are gone: start from here. */
  checkpoint?: LiveCheckpoint;
  /** In order; possibly not all of them, then ask again from the last one. */
  edits: LiveEditEntry[];
}

export interface MirrorManifest {
  users: { id: string; record: string }[];
  vaults: {
    id: string;
    /** vault.json as stored, base64url. */
    record: string;
    refs: { ref: string; value: string }[];
    objects: string[];
  }[];
}

export interface InviteOpenResponse {
  payload: string;
  role: Role;
}

export interface ClaimRequest {
  token: string;
  wrappedKey: string;
}

export interface MissingRequest {
  ids: string[];
}

export interface MissingResponse {
  missing: string[];
}

export interface RefEntry {
  ref: string;
  /** SHA-256 of the sealed value. What a compare-and-swap names. */
  etag: string;
  value: string;
}

export interface RefUpdate {
  /** The etag the client last saw, or null to create a ref that must not exist yet. */
  ifMatch: string | null;
  value: string;
}

/** 409 body: what is there now, so the client can merge without another round trip. */
export interface RefConflict {
  current: RefEntry | null;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  /** One per storage copy, primary first. Paths and errors stay in the server's log. */
  replicas: { ok: boolean }[];
}

export interface ErrorBody {
  /** Human-readable. */
  message: string;
  detail?: string;
}
