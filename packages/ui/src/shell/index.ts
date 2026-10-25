/**
 * The shell: the frame the application is drawn inside. See ./Workspace.tsx for the layout and
 * ./Rail.tsx for the two-column rail that carries the commands.
 */

export type { CategoryId, Command } from './commands.js';
export { allCommands, CATEGORIES, nextVariant, readyCount, variantsOf } from './commands.js';
export type { EditorShortcut } from './editor-shortcuts.js';
export { EDITOR_SHORTCUTS } from './editor-shortcuts.js';
export {
  activeKeymap,
  KEY_ACTIONS,
  KEYMAP_PRESETS,
  type KeyAction,
  type KeyActionGroup,
  type KeymapPresetId,
  keyConflicts,
  resolveKeymap,
  setActiveKeymap,
} from './keymap.js';
export type { NotificationCenterProps } from './NotificationCenter.js';
export { NotificationCenter } from './NotificationCenter.js';
export { useNotificationFeed, useNotificationSource } from './notification-feed.js';
export type { Notice, Tone } from './notification-types.js';
export { Choice, Field, Popover, SegmentedChoice, Toggle } from './Popover.js';
export type { RailGroup, RailItem, RailProps } from './Rail.js';
export { Rail } from './Rail.js';
export { LEFT_RAIL, leftRailFor, QUICK_SETTINGS, RIGHT_RAIL } from './RailContents.js';
export { Slider, type SliderProps } from './Slider.js';
export type { StatusStripProps } from './StatusStrip.js';
export { StatusStrip } from './StatusStrip.js';
export type { Modifier, ParsedShortcut, Shortcut } from './shortcut.js';
export {
  isApple,
  matchesShortcut,
  parseShortcut,
  shortcutCaps,
  shortcutLabel,
} from './shortcut.js';
export type { TitleBarProps, WorkspaceMode } from './TitleBar.js';
export { TitleBar } from './TitleBar.js';
export { Toasts, type ToastsProps } from './Toasts.js';
export type { RunningTask } from './task-progress.js';
export { describeTask, formatPercent, formatRate, formatRemaining } from './task-progress.js';
export type {
  DetailChoice,
  HistoryEntry,
  PanelProps,
  ScreenshotPanelProps,
  ScrollDeviceChoice,
  ThemeChoice,
  ViewPanelProps,
  ViewTab,
} from './UtilityPanels.js';
export {
  HistoryPanel,
  ScreenshotPanel,
  VIEW_TABS,
  ViewPanel,
} from './UtilityPanels.js';
export { SMOOTHNESS_STOPS, SmoothnessSlider } from './ViewPanelSections.js';
export type { NumberFormat, Unit, ViewSettings } from './view-settings.js';
export {
  applyGridLock,
  DEFAULT_VIEW_SETTINGS,
  formatArea,
  formatLength,
  formatVolume,
  toDisplay,
  toMillimetres,
  UNIT_LABELS,
} from './view-settings.js';
export type { WorkspaceProps } from './Workspace.js';
export { Workspace } from './Workspace.js';
