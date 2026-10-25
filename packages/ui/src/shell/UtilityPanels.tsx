/**
 * Panels opened from the right rail. Each is a stateless view over `ViewSettings` plus a change
 * callback, so the panel and viewport cannot disagree; anything stateful is passed in as a
 * callback.
 */

import type { ReactNode } from 'react';
import { Choice, Popover, Toggle } from './Popover.js';
import { CameraSection, DisplaySection, UnitsSection } from './ViewPanelSections.js';
import type { ViewSettings } from './view-settings.js';

export interface PanelProps {
  settings: ViewSettings;
  onChange: (patch: Partial<ViewSettings>) => void;
  onClose: () => void;
}

/**
 * Sections of the view panel: one fixed-size panel with tabs (audit D5), opened by the right-rail
 * icon on its section. The fixed size keeps it from moving when switching tabs.
 */
export type ViewTab = 'camera' | 'display' | 'units';

export const VIEW_TABS: readonly { id: ViewTab; label: string }[] = [
  { id: 'camera', label: 'View' },
  { id: 'display', label: 'Display' },
  { id: 'units', label: 'Units & Grid' },
];

/** App colour theme: fixed, or following the OS. */
export type ThemeChoice = 'system' | 'light' | 'dark';

export type ScrollDeviceChoice = 'auto' | 'mouse' | 'trackpad';

/** Render detail while modelling. */
export type DetailChoice = 'auto' | 'full' | 'light';

export interface ViewPanelProps extends PanelProps {
  /** The section shown. */
  active: ViewTab;
  /**
   * `app` outside the modelling view (Visualize, Drawings), where model shading, edges and grid
   * have no effect and are hidden (audit D5).
   */
  scope?: 'model' | 'app';
  /** Sections offered, in order; all three by default. */
  tabs?: readonly ViewTab[];
  /** A tab was chosen. */
  onTab?: (tab: ViewTab) => void;
  /** Theme; the same preference as in Settings, offered here while looking at the model. */
  theme?: ThemeChoice;
  onTheme?: (theme: ThemeChoice) => void;
  /** Lower detail for large models; the same preference as in Settings. */
  detail?: DetailChoice;
  onDetail?: (detail: DetailChoice) => void;
  /** Sharp vs. smooth while the view moves, 0 to 100 (`SMOOTHNESS_STOPS`). */
  smoothness?: number;
  onSmoothness?: (smoothness: number) => void;
  /**
   * Camera input device. Browsers do not report it, so the viewport guesses; `scrollSeen` is the
   * current guess, shown next to Automatic.
   */
  scrollDevice?: ScrollDeviceChoice;
  scrollSeen?: 'mouse' | 'trackpad' | null;
  onScrollDevice?: (device: ScrollDeviceChoice) => void;
  onView: (view: 'default' | 'front' | 'back' | 'top' | 'bottom' | 'right' | 'left') => void;
  /** Frames the model without changing the view direction. */
  onFit: () => void;
  /** The document's saved views, below the standard ones (audit F-034). Rendered by the app. */
  savedViews?: ReactNode;
}

export function ViewPanel({
  active,
  scope = 'model',
  tabs = VIEW_TABS.map((tab) => tab.id),
  onTab,
  onClose,
  settings,
  onChange,
  onView,
  onFit,
  savedViews,
  theme,
  onTheme,
  detail,
  onDetail,
  smoothness,
  onSmoothness,
  scrollDevice,
  scrollSeen,
  onScrollDevice,
}: ViewPanelProps) {
  const title = VIEW_TABS.find((tab) => tab.id === active)?.label ?? 'View';
  const offered = VIEW_TABS.filter((tab) => tabs.includes(tab.id));
  const header =
    onTab === undefined || offered.length < 2 ? undefined : (
      <div aria-label="Sections" className="view-panel__tabs" role="tablist">
        {offered.map((tab) => (
          <button
            aria-selected={tab.id === active}
            key={tab.id}
            onClick={() => onTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    );

  return (
    <Popover header={header} onClose={onClose} side="right" title={title}>
      <div className="view-panel__body" data-scope={scope}>
        {active === 'camera' && (
          <CameraSection
            onChange={onChange}
            onFit={onFit}
            onView={onView}
            savedViews={savedViews}
            settings={settings}
            {...(scrollDevice === undefined ? {} : { scrollDevice })}
            {...(scrollSeen === undefined ? {} : { scrollSeen })}
            {...(onScrollDevice === undefined ? {} : { onScrollDevice })}
            {...(smoothness === undefined ? {} : { smoothness })}
            {...(onSmoothness === undefined ? {} : { onSmoothness })}
          />
        )}
        {active === 'display' && (
          <DisplaySection
            appOnly={scope === 'app'}
            onChange={onChange}
            settings={settings}
            {...(theme === undefined ? {} : { theme })}
            {...(onTheme === undefined ? {} : { onTheme })}
            {...(detail === undefined ? {} : { detail })}
            {...(onDetail === undefined ? {} : { onDetail })}
          />
        )}
        {active === 'units' && (
          <UnitsSection numbersOnly={scope === 'app'} onChange={onChange} settings={settings} />
        )}
      </div>
    </Popover>
  );
}

export interface ScreenshotPanelProps extends PanelProps {
  onCapture: () => void;
}

export function ScreenshotPanel({ settings, onChange, onCapture, onClose }: ScreenshotPanelProps) {
  return (
    <Popover onClose={onClose} side="right" title="Screenshot">
      <Toggle
        checked={settings.shotGrid}
        label="Grid"
        onChange={(shotGrid) => onChange({ shotGrid })}
      />
      <Toggle
        checked={settings.shotEdges}
        label="Body edges"
        onChange={(shotEdges) => onChange({ shotEdges })}
      />
      <Toggle
        checked={settings.shotTransparent}
        disabled
        hint="Needs an alpha framebuffer"
        label="Transparency"
        onChange={(shotTransparent) => onChange({ shotTransparent })}
      />

      <Choice
        label="Resolution"
        onChange={(value) => onChange({ shotScale: Number(value) as ViewSettings['shotScale'] })}
        options={[
          { value: '1', label: '1× viewport' },
          { value: '2', label: '2× viewport' },
          { value: '4', label: '4× viewport' },
        ]}
        value={String(settings.shotScale)}
      />

      <div className="panel__buttons">
        <button className="panel__primary" onClick={onCapture} type="button">
          Capture
        </button>
      </div>
    </Popover>
  );
}

/** An entry in the operation history. */
export interface HistoryEntry {
  seq: number;
  at: string;
  description: string;
}

export function HistoryPanel({
  entries,
  onClose,
}: {
  entries: readonly HistoryEntry[];
  onClose: () => void;
}) {
  return (
    <Popover onClose={onClose} side="right" title="History">
      {entries.length === 0 ? (
        <p className="popover__note">
          Nothing yet. Once you start modelling, every step shows up here in the order it happened.
        </p>
      ) : (
        <ol className="history">
          {entries.map((entry) => (
            <li key={entry.seq}>
              <span className="history__what">{entry.description}</span>
              <span className="history__when">{time(entry.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </Popover>
  );
}

/** Time-of-day part of an ISO timestamp. */
function time(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ''
    : at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export type PanelChildren = ReactNode;
