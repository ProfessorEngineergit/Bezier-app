/** Public entry point: `createLessons` (built from a `LessonHost`) and the components to mount. */

export { forgetInvite, redeemInvite } from '../community/client/alpha.js';
export {
  type Channel,
  chosenChannel,
  currentChannel,
  type Gate,
  reaches,
  setChannel,
} from '../community/client/channel.js';
export {
  type Invite,
  type InviteFailure,
  inviteFailureText,
  setInviteKey,
} from '../community/client/invite.js';
export {
  type CommunityStore,
  checkStore as checkCommunityStore,
  setStoreAddress as setCommunityAddress,
  setStoreOn as setCommunityOn,
} from '../community/client/store.js';
export {
  savedToken as savedDocsToken,
  saveToken as saveDocsToken,
} from '../community/docs/client/token.js';
export {
  type Arrow,
  DOC_AREAS,
  type DocArea,
  type DocArticle,
  type DocImage,
  pictureMismatch,
  problemWith,
} from '../community/docs/format/article.js';
export { findArticles } from '../community/docs/format/search.js';
export type { DocsHost } from '../community/docs/ui/context.js';
export { WikiRoot } from '../community/docs/ui/WikiRoot.js';
export { useWiki, type Wiki } from '../community/docs/ui/wiki-state.js';
export { listInstalled as listInstalledPlugins } from '../community/plugins/client/installed.js';
export {
  isPluginManifest,
  manifestProblem,
  type PluginManifest,
} from '../community/plugins/format/manifest.js';
export { DEVELOPMENT, PluginRuntime } from '../community/plugins/runtime/bridge.js';
export type {
  PluginHost,
  PluginIdentity,
  PluginPanel,
} from '../community/plugins/runtime/contract.js';
export {
  countingEnabled as communityCounting,
  setCounting as setCommunityCounting,
} from '../community/recognition/app/counting.js';
export { ChannelTag } from '../community/ui/ChannelTag.js';
export { Community } from '../community/ui/Community.js';
export type { CommunityKind } from '../community/ui/CommunityFrame.js';
export {
  CommunityLessons,
  useCommunityLessonsAvailable,
} from '../community/ui/CommunityLessons.js';
export { CommunityIcon, WikiIcon } from '../community/ui/icons.js';
export { useChannel } from '../community/ui/useChannel.js';
export { useInvite } from '../community/ui/useInvite.js';
export { useCommunityStore } from '../community/ui/useStore.js';
export { LessonsHome } from './app/LessonsHome.js';
export { LessonsOverlay } from './app/LessonsOverlay.js';
export { createLessons, type Lessons } from './app/lessons.js';
export type { ColorScheme, HostEdit, HostViewport, LessonHost } from './host/contract.js';
export { LearnIcon } from './ui/LearnIcon.js';
