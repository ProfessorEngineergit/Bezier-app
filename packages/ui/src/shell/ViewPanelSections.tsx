/**
 * Sections of the view panel: View (camera), Display and Units & Grid. In each, settings for this
 * model's view come first and app-wide preferences (theme, navigation) follow under their own
 * heading (audit D5). All grid settings are under Units & Grid. Small choices are segmented rows
 * so each section fits without scrolling.
 */

import { LARGE_MODEL_FACES } from '@bezier/core';
import { MouseIcon, TrackpadIcon } from '../icons/Icons.js';
import { Field, SegmentedChoice, Toggle } from './Popover.js';
import { Slider } from './Slider.js';
import type {
  DetailChoice,
  ScrollDeviceChoice,
  ThemeChoice,
  ViewPanelProps,
} from './UtilityPanels.js';
import type { NumberFormat, Unit, ViewSettings } from './view-settings.js';
import { UNIT_LABELS } from './view-settings.js';

type Fields = {
  settings: ViewSettings;
  onChange: (patch: Partial<ViewSettings>) => void;
};

const VIEWS = [
  ['default', 'Default'],
  ['front', 'Front'],
  ['back', 'Back'],
  ['top', 'Top'],
  ['bottom', 'Bottom'],
  ['right', 'Right'],
  ['left', 'Left'],
] as const;

/** Camera position, navigation and input device. */
export function CameraSection({
  settings,
  onChange,
  onView,
  onFit,
  savedViews,
  scrollDevice,
  scrollSeen,
  onScrollDevice,
  smoothness,
  onSmoothness,
}: Fields &
  Pick<
    ViewPanelProps,
    | 'onView'
    | 'onFit'
    | 'savedViews'
    | 'scrollDevice'
    | 'scrollSeen'
    | 'onScrollDevice'
    | 'smoothness'
    | 'onSmoothness'
  >) {
  const scroll = scrollDevice !== undefined && onScrollDevice !== undefined;
  const smooth = smoothness !== undefined && onSmoothness !== undefined;
  return (
    <>
      <div className="view-panel__views">
        <button className="panel__primary view-panel__fit" onClick={onFit} type="button">
          Zoom to fit
        </button>
        {VIEWS.map(([view, label]) => (
          <button key={view} onClick={() => onView(view)} type="button">
            {label}
          </button>
        ))}
      </div>
      {savedViews}

      <Group>Lens</Group>
      {/* No projection switch: the parallel view is only used aligned to a main axis, where the
          grid lies square to the view. */}
      <Slider
        format={(v) => `${v}°`}
        label="Field of view"
        max={75}
        min={5}
        onChange={(fieldOfView) => onChange({ fieldOfView })}
        stops={[{ value: 5, label: 'Near parallel' }, { value: 45 }]}
        value={settings.fieldOfView}
      />
      <Toggle
        checked={settings.animateCamera}
        label="Glide to a chosen view"
        onChange={(animateCamera) => onChange({ animateCamera })}
      />

      {(scroll || smooth) && <Group everywhere>Moving the view</Group>}
      {scroll && (
        <ScrollDevice onChange={onScrollDevice} seen={scrollSeen ?? null} value={scrollDevice} />
      )}
      {smooth && <SmoothnessSlider onChange={onSmoothness} value={smoothness} />}
    </>
  );
}

/**
 * A heading inside a section. `everywhere` marks app-wide preferences, so they are not mistaken for
 * settings of the current view.
 */
function Group({ children, everywhere = false }: { children: string; everywhere?: boolean }) {
  return (
    <h3 className="view-panel__group">
      {children}
      {everywhere && <small>Every workspace</small>}
    </h3>
  );
}

function ScrollDevice({
  value,
  seen,
  onChange,
}: {
  value: ScrollDeviceChoice;
  seen: 'mouse' | 'trackpad' | null;
  onChange: (device: ScrollDeviceChoice) => void;
}) {
  return (
    <SegmentedChoice
      label="Scrolling with"
      onChange={onChange}
      options={[
        {
          value: 'auto',
          label: 'Automatic',
          icon: seen === 'mouse' ? <MouseIcon /> : <TrackpadIcon />,
          ...(seen === null ? {} : { detail: seen === 'mouse' ? 'mouse now' : 'trackpad now' }),
        },
        { value: 'mouse', label: 'Mouse', icon: <MouseIcon /> },
        { value: 'trackpad', label: 'Trackpad', icon: <TrackpadIcon /> },
      ]}
      value={value}
    />
  );
}

/** What the modelling view shows: shading and overlays on the model. */
function ModelDisplay({ settings, onChange }: Fields) {
  return (
    <>
      <Group>Model</Group>
      <SegmentedChoice
        label="Shading"
        onChange={(display) => onChange({ display })}
        options={[
          { value: 'shaded', label: 'Shaded' },
          { value: 'wireframe', label: 'Wireframe' },
          { value: 'xray', label: 'X-Ray' },
        ]}
        value={settings.display}
      />
      {/* Surface flow display, for checking that faces meet smoothly (audit F-027). */}
      <SegmentedChoice
        label="Surface analysis"
        onChange={(display) => onChange({ display: display === 'none' ? 'shaded' : display })}
        options={[
          { value: 'none', label: 'Off' },
          { value: 'zebra', label: 'Zebra' },
          { value: 'curvature', label: 'Curvature' },
        ]}
        value={
          settings.display === 'zebra' || settings.display === 'curvature'
            ? settings.display
            : 'none'
        }
      />
      {/* Toggles for overlays drawn with the model. The grid is under Units & Grid. */}
      <fieldset aria-label="Show" className="view-panel__chips">
        <Chip
          label="Edges"
          on={settings.showEdges}
          onChange={(showEdges) => onChange({ showEdges })}
        />
        <Chip label="Axes" on={settings.showAxes} onChange={(showAxes) => onChange({ showAxes })} />
      </fieldset>
    </>
  );
}

/** Rendering of the model and its surroundings. */
export function DisplaySection({
  appOnly = false,
  settings,
  onChange,
  theme,
  onTheme,
  detail,
  onDetail,
}: Fields &
  Pick<ViewPanelProps, 'theme' | 'onTheme' | 'detail' | 'onDetail'> & {
    /** Hide settings that exist only in the modelling view (shading, overlays). */
    appOnly?: boolean;
  }) {
  return (
    <>
      {!appOnly && <ModelDisplay onChange={onChange} settings={settings} />}
      {!appOnly && <Group everywhere>Look</Group>}
      {theme !== undefined && onTheme !== undefined && (
        <SegmentedChoice<ThemeChoice>
          label="Theme"
          onChange={onTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={theme}
        />
      )}
      {detail !== undefined && onDetail !== undefined && (
        <>
          <SegmentedChoice<DetailChoice>
            label="Detail while modelling"
            onChange={onDetail}
            options={[
              { value: 'auto', label: 'Automatic' },
              { value: 'full', label: 'Full' },
              { value: 'light', label: 'Light' },
            ]}
            value={detail}
          />
          <p className="popover__note">
            Light draws curves coarser. Automatic uses it above{' '}
            {LARGE_MODEL_FACES.toLocaleString('en-US')} faces; exports stay full.
          </p>
        </>
      )}
    </>
  );
}

/** A show/hide toggle button that stays pressed while shown. */
function Chip({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      aria-pressed={on}
      className="view-panel__chip"
      onClick={() => onChange(!on)}
      type="button"
    >
      {label}
    </button>
  );
}

const UNITS: readonly Unit[] = ['mm', 'cm', 'm', 'in', 'ft'];

/**
 * Units and grid: visibility, plane and snapping. `numbersOnly` is for workspaces without the
 * modelling view and its grid.
 */
export function UnitsSection({
  settings,
  onChange,
  numbersOnly = false,
}: Fields & { numbersOnly?: boolean }) {
  return (
    <>
      {!numbersOnly && <Group>Units</Group>}
      <SegmentedChoice<Unit>
        label="Length"
        onChange={(unit) => onChange({ unit })}
        options={UNITS.map((unit) => ({ value: unit, label: unit }))}
        value={settings.unit}
      />
      <p className="popover__note">{UNIT_LABELS[settings.unit]}</p>
      <SegmentedChoice<NumberFormat>
        label="Numbers"
        onChange={(format) => onChange({ format })}
        options={[
          { value: 'decimal', label: 'Decimal', detail: '27.22' },
          { value: 'fractional', label: 'Fractions', detail: '3/8"' },
        ]}
        value={settings.format}
      />
      {settings.unit !== 'in' && settings.unit !== 'ft' && settings.format === 'fractional' && (
        <p className="popover__note">Fractions apply to inches and feet. Metric stays decimal.</p>
      )}

      {!numbersOnly && <GridFields onChange={onChange} settings={settings} />}
    </>
  );
}

/** Grid settings: visibility, plane and snapping to its step. */
function GridFields({ settings, onChange }: Fields) {
  const snapping = settings.gridLock !== null;
  return (
    <>
      <Group>Grid</Group>
      <Toggle
        checked={settings.showGrid}
        label="Show grid"
        onChange={(showGrid) => onChange({ showGrid })}
      />
      {settings.showGrid && (
        <SegmentedChoice
          label="Grid on"
          onChange={(gridPlane) => onChange({ gridPlane })}
          options={[
            { value: 'XY', label: 'XY' },
            { value: 'YZ', label: 'YZ' },
            { value: 'XZ', label: 'ZX' },
          ]}
          value={settings.gridPlane}
        />
      )}
      {/* One switch: snapping is what fixing the grid step is for. */}
      <Toggle
        checked={snapping}
        label="Snap to grid"
        onChange={(on) => onChange({ gridLock: on ? 1 : null })}
      />
      {snapping && (
        <Field label="Grid step">
          <input
            min={0.01}
            onChange={(event) => onChange({ gridLock: Number(event.target.value) || 1 })}
            step={0.5}
            type="number"
            value={settings.gridLock ?? 1}
          />
        </Field>
      )}
    </>
  );
}

/** Named stops on the sharp/smooth slider, shared by the Display panel and Settings. */
export const SMOOTHNESS_STOPS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'Always sharp' },
  { value: 25, label: 'Sharp' },
  { value: 50, label: 'Balanced' },
  { value: 75, label: 'Smooth' },
  { value: 100, label: 'Smoothest' },
];

/** While the view moves: prefer sharpness or smoothness. */
export function SmoothnessSlider({
  value,
  onChange,
  label = 'While moving the view',
}: {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}) {
  return (
    <Slider
      ends={['Sharper', 'Smoother']}
      format={(v) => `${v}`}
      label={label}
      max={100}
      min={0}
      onChange={onChange}
      stops={SMOOTHNESS_STOPS}
      value={value}
    />
  );
}
