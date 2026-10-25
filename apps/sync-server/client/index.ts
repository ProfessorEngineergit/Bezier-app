/**
 * @bezier/sync: what the app uses to work with a Bezier server. The server itself is in
 * ../server and runs on its own (../README.md); `@bezier/sync/server` exports it for tests.
 */

export type { Identity } from '../protocol/identity.ts';
export {
  backupIdentity,
  exportIdentity,
  importIdentity,
  newIdentity,
  restoreIdentity,
} from '../protocol/identity.ts';
export type { Role } from '../protocol/wire.ts';
export { BrowserStore } from './browser-store.ts';
export { Connection, SyncError } from './connection.ts';
export type { DocumentConflict, DocumentLike } from './document-merge.ts';
export { asDocument, mergeDocuments } from './document-merge.ts';
export type { Graph, GraphRow } from './graph.ts';
export { layoutGraph } from './graph.ts';
export type { Arrived, ArrivedEdit, DocumentCodec } from './live.ts';
export { LiveChannel, liveChannelId } from './live.ts';
export type { LiveEdit, LiveModel, Sequenced } from './live-state.ts';
export { LiveState } from './live-state.ts';
export type { LiveSnapshot, LiveStatus, LiveSyncOptions } from './live-sync.ts';
export { LiveSync } from './live-sync.ts';
export { MemoryCache } from './memory-cache.ts';
export type { Conflict, Tree, TreeEntry } from './merge.ts';
export type { PresenceMode, PresenceState, Present } from './presence.ts';
export {
  describePresence,
  HEARTBEAT_MS,
  newDeviceId,
  othersOn,
  PresenceClient,
} from './presence.ts';
export type { Branch, Commit, MergeOutcome, ObjectCache, PushResult } from './repository.ts';
export { Repository } from './repository.ts';
export type { Member, VaultHandle, VaultInfo } from './vault-client.ts';
export { parseInviteLink, VaultClient } from './vault-client.ts';
export type { OpenedView, ViewLink } from './view-links.ts';
export {
  createViewLink,
  listViewLinks,
  openViewLink,
  parseViewLink,
  withdrawViewLink,
} from './view-links.ts';
export type { BranchState, ChangeResult } from './workspace.ts';
export { fileNameFor, projectName, Workspace } from './workspace.ts';
