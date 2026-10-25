import { ChannelTag, useChannel } from '@bezier/lessons';
import { SmoothnessSlider } from '@bezier/ui';
import { useEffect, useMemo, useState } from 'react';
import { arrowThroughList } from './arrow-focus.js';
import { McpSettings } from './automation/McpSettings.js';
import { ChannelSettings } from './ChannelSettings.js';
import { CommunitySettings } from './CommunitySettings.js';
import { CollaborationSettings } from './collab/CollaborationSettings.js';
import { Contribute } from './PreferencesContribute.js';
import { NavigationSettings, ShortcutSettings } from './PreferencesInput.js';
import { NibSettings } from './PreferencesNib.js';
import {
  Choices,
  Group,
  Planned,
  Row,
  Segmented,
  Select,
  Swatches,
  Switch,
} from './PrefsControls.js';
import {
  type AppPrefs,
  DEFAULT_PREFS,
  type OpenView,
  type Quality,
  SELECTION_COLOURS,
  type StartPage,
  type StartupWorkspace,
} from './preferences.js';
import { CATEGORIES, type SettingsTab, settingsMatching } from './settings-catalog.js';

export type { AppPrefs } from './preferences.js';
export { DEFAULT_PREFS, QUALITY_DEFLECTION } from './preferences.js';

interface Props {
  prefs: AppPrefs;
  onChange: (next: AppPrefs) => void;
  version: string;
  /** The section shown. Owned by the start page, whose search can jump to one. */
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  /**
   * Words from the start page search (`settings: …`) that filter the sections. There is no search
   * field here; the page has one (`library-search.ts`).
   */
  filter: readonly string[];
}
type Setter = <K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) => void;

export function PreferencesPage({ prefs, onChange, version, tab, onTab, filter }: Props) {
  const set: Setter = (key, value) => onChange({ ...prefs, [key]: value });
  const channel = useChannel();
  const visible = useMemo(() => settingsMatching(filter, channel), [filter, channel]);
  useEffect(() => {
    if (visible.length > 0 && !visible.some((item) => item.id === tab))
      onTab(visible[0]?.id ?? 'general');
  }, [tab, visible, onTab]);

  return (
    <section aria-label="Preferences" className="preferences-page">
      <aside className="preferences-page__side">
        <nav
          aria-label="Preference sections"
          className="preferences-page__nav"
          onKeyDown={(event) => arrowThroughList(event, 'button', true)}
        >
          {visible.length === 0 ? (
            <p className="prefs-empty">No settings found</p>
          ) : (
            groups(visible).map(([group, items]) => (
              <div className="preferences-page__navGroup" key={group}>
                <span>{group}</span>
                {items.map((item) => (
                  <button
                    aria-current={tab === item.id ? 'page' : undefined}
                    className="preferences-page__navItem"
                    data-active={tab === item.id ? '' : undefined}
                    key={item.id}
                    onClick={() => onTab(item.id)}
                    type="button"
                  >
                    {item.label}
                    {item.gate !== undefined && <ChannelTag gate={item.gate} />}
                  </button>
                ))}
              </div>
            ))
          )}
        </nav>
      </aside>
      <div className="preferences-page__body">
        <header className="prefs-hero">
          <span>Settings</span>
          <h1>{CATEGORIES.find((item) => item.id === tab)?.label}</h1>
        </header>
        {tab === 'general' && <General prefs={prefs} set={set} />}{' '}
        {tab === 'appearance' && <Appearance prefs={prefs} set={set} />}{' '}
        {tab === 'nib' && <NibSettings prefs={prefs} set={set} />}{' '}
        {tab === 'interaction' && <NavigationSettings prefs={prefs} set={set} />}{' '}
        {tab === 'viewport' && <Viewport prefs={prefs} set={set} />}{' '}
        {tab === 'shortcuts' && <ShortcutSettings prefs={prefs} set={set} />}{' '}
        {tab === 'collaboration' && <CollaborationSettings />}{' '}
        {tab === 'community' && <CommunitySettings />}{' '}
        {tab === 'updates' && <ChannelSettings version={version} />}{' '}
        {tab === 'mcp' && <McpSettings />}{' '}
        {tab === 'data' && <Data onReset={() => onChange(DEFAULT_PREFS)} />}{' '}
        {tab === 'contribute' && <Contribute version={version} />}
      </div>
    </section>
  );
}

function General({ prefs, set }: { prefs: AppPrefs; set: Setter }) {
  return (
    <>
      <Group label="Startup">
        <Row label="Open Bezier on" note="Used the next time the app starts.">
          <Select
            label="Open Bezier on"
            value={prefs.startPage}
            onChange={(value) => set('startPage', value as StartPage)}
            options={[
              ['home', 'The start page'],
              ['projects', 'Your projects'],
            ]}
          />
        </Row>
        <Row label="Open new projects in" note="Used the next time a project opens.">
          <Select
            value={prefs.startupWorkspace}
            onChange={(value) => set('startupWorkspace', value as StartupWorkspace)}
            options={[
              ['design', 'Modeling'],
              ['visualize', 'Visualize'],
              ['drawings', 'Drawings'],
            ]}
          />
        </Row>
      </Group>
      <Group label="Interface">
        <Row
          label="Show performance graph"
          note="Live frame time, frame cadence and main-thread delay in the top bar. A right click on the top bar switches it too."
        >
          <Switch
            checked={prefs.showPerformance}
            label="Show performance graph"
            onChange={(value) => set('showPerformance', value)}
          />
        </Row>
        <Row label="Show tool labels" note="Keeps names beside the modeling rail.">
          <Switch
            checked={prefs.showLabels}
            label="Show tool labels"
            onChange={(value) => set('showLabels', value)}
          />
        </Row>
      </Group>
    </>
  );
}

function Appearance({ prefs, set }: { prefs: AppPrefs; set: Setter }) {
  return (
    <>
      <Group label="Color">
        <Row label="Theme">
          <Segmented
            name="theme"
            value={prefs.theme}
            onChange={(value) => set('theme', value)}
            options={[
              ['system', 'System'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ]}
          />
        </Row>
        <Row label="Contrast">
          <Segmented
            name="contrast"
            value={prefs.contrast}
            onChange={(value) => set('contrast', value)}
            options={[
              ['standard', 'Standard'],
              ['high', 'High'],
            ]}
          />
        </Row>
        <Row label="Selection" note="Faces, edges, bodies and sketch lines that are picked.">
          <Swatches
            name="selection"
            value={prefs.selectionColour}
            onChange={(value) => set('selectionColour', value)}
            options={SELECTION_COLOURS}
          />
        </Row>
      </Group>
      <Group label="Materials">
        <Row label="Glass">
          <Segmented
            name="glass"
            value={prefs.glass}
            onChange={(value) => set('glass', value)}
            options={[
              // Solid where the browser cannot blur (a virtual machine without a trusted GPU).
              ['auto', 'Automatic'],
              ['full', 'Full'],
              ['reduced', 'Reduced'],
              ['solid', 'Solid'],
            ]}
          />
        </Row>
        <Row label="Panel density">
          <Segmented
            name="density"
            value={prefs.density}
            onChange={(value) => set('density', value)}
            options={[
              ['comfortable', 'Comfortable'],
              ['compact', 'Compact'],
            ]}
          />
        </Row>
        <Row label="Interface size">
          <Segmented
            name="scale"
            value={prefs.interfaceScale}
            onChange={(value) => set('interfaceScale', value)}
            options={[
              ['small', '90%'],
              ['default', '100%'],
              ['large', '110%'],
            ]}
          />
        </Row>
      </Group>
      <Group label="Motion">
        <Row label="Interface motion">
          <Segmented
            name="motion"
            value={prefs.motion}
            onChange={(value) => set('motion', value)}
            options={[
              ['system', 'System'],
              ['reduced', 'Reduced'],
              ['full', 'Full'],
            ]}
          />
        </Row>
      </Group>
    </>
  );
}

function Viewport({ prefs, set }: { prefs: AppPrefs; set: Setter }) {
  const choices: readonly [Quality, string, string][] = [
    ['low', 'Performance', 'Fast redraw with 0.25 mm display tolerance.'],
    ['medium', 'Balanced', 'Accurate to 0.05 mm.'],
    ['high', 'Precision', 'Accurate to 0.012 mm for presentation work.'],
  ];
  return (
    <>
      <Group
        label="When a project opens"
        note="The cards on the start page are always shot from the corner."
      >
        <Row label="Look at it" note="Used the next time a project opens.">
          <Segmented<OpenView>
            name="open-view"
            onChange={(openView) => set('openView', openView)}
            options={[
              ['top', 'From above'],
              ['angled', 'From the corner'],
            ]}
            value={prefs.openView}
          />
        </Row>
      </Group>
      <Group
        label="Surface quality"
        note="This changes how finely curves are drawn on screen. The saved geometry and its dimensions stay exact."
      >
        <Choices
          name="quality"
          value={prefs.quality}
          onChange={(quality) => set('quality', quality)}
          options={choices}
        />
      </Group>
      <Group
        label="While moving the view"
        note="A large model turns smoothly at a lower resolution, and is sharp again the moment it stops. Toward Sharper it keeps more of its detail and may turn less smoothly; Always sharp never lowers it."
      >
        <div className="prefs-slider">
          <SmoothnessSlider
            onChange={(value) => set('smoothness', value)}
            value={prefs.smoothness}
          />
        </div>
      </Group>
    </>
  );
}

function Data({ onReset }: { onReset: () => void }) {
  const [usage, setUsage] = useState('Calculating…');
  // Reset asks for confirmation first and confirms when done.
  const [reset, setReset] = useState<'idle' | 'asking' | 'done'>('idle');
  useEffect(() => {
    void navigator.storage
      ?.estimate()
      .then(({ usage: bytes = 0 }) => setUsage(formatBytes(bytes)))
      .catch(() => setUsage('Unavailable'));
  }, []);
  useEffect(() => {
    if (reset !== 'done') return;
    const timer = window.setTimeout(() => setReset('idle'), 2400);
    return () => window.clearTimeout(timer);
  }, [reset]);
  return (
    <>
      <Group
        label="Local-first storage"
        note="Projects stay in this app's private storage on this device. Nothing is sent anywhere."
      >
        <Row label="Telemetry">
          <span className="prefs-value">None</span>
        </Row>
        <Row label="Storage used">
          <span className="prefs-value">{usage}</span>
        </Row>
        <Row label="Cloud sync">
          <Planned />
        </Row>
      </Group>
      <Group label="Preferences">
        <Row label="Restore Bezier defaults" note="Projects and modeling data are preserved.">
          {reset === 'asking' ? (
            <span className="prefs-confirm">
              <button className="prefs-button" onClick={() => setReset('idle')} type="button">
                Cancel
              </button>
              <button
                className="prefs-button prefs-button--danger"
                data-armed=""
                onClick={() => {
                  onReset();
                  setReset('done');
                }}
                type="button"
              >
                Reset all settings
              </button>
            </span>
          ) : reset === 'done' ? (
            <span className="prefs-value" role="status">
              Settings reset
            </span>
          ) : (
            <button
              className="prefs-button prefs-button--danger"
              onClick={() => setReset('asking')}
              type="button"
            >
              Reset settings
            </button>
          )}
        </Row>
      </Group>
    </>
  );
}

function groups(items: readonly (typeof CATEGORIES)[number][]) {
  return [...new Set(items.map((item) => item.group))].map(
    (group) => [group, items.filter((item) => item.group === group)] as const,
  );
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
