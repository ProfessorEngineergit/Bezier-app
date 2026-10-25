import type { EmissionDirection, EmissionMode, PresentationSettings } from '@bezier/renderer';
import { Slider } from '@bezier/ui';

export function EmissionControls({
  settings,
  onChange,
}: {
  settings: PresentationSettings;
  onChange: <K extends keyof PresentationSettings>(key: K, value: PresentationSettings[K]) => void;
}) {
  const mode = settings.emissionMode ?? 'area';
  return (
    <>
      <Slider
        label="Light Strength"
        value={settings.emission ?? 0}
        min={0}
        max={20}
        step={0.1}
        format={(v) => `${v.toFixed(1)} ×`}
        onChange={(v) => onChange('emission', v)}
      />
      <label className="viz-light-select">
        Light emission
        <select
          aria-label="Light emission"
          value={mode}
          onChange={(e) => onChange('emissionMode', e.target.value as EmissionMode)}
        >
          <option value="surface">Surface glow</option>
          <option value="area">Area light</option>
          <option value="spot">Spotlight</option>
        </select>
      </label>
      {mode !== 'surface' && (
        <label className="viz-light-select">
          Direction
          <select
            aria-label="Light direction"
            value={settings.emissionDirection ?? 'front'}
            onChange={(e) => onChange('emissionDirection', e.target.value as EmissionDirection)}
          >
            <option value="front">Front · −Y</option>
            <option value="back">Back · +Y</option>
            <option value="left">Left · −X</option>
            <option value="right">Right · +X</option>
            <option value="up">Up · +Z</option>
            <option value="down">Down · −Z</option>
          </select>
        </label>
      )}
      {mode === 'spot' && (
        <Slider
          label="Beam Angle"
          value={settings.emissionBeam ?? 35}
          min={5}
          max={100}
          step={1}
          format={(v) => `${v}°`}
          onChange={(v) => onChange('emissionBeam', v)}
        />
      )}
      <Slider
        label="Light Glow"
        value={settings.bloom}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)} %`}
        onChange={(v) => onChange('bloom', v)}
      />
    </>
  );
}
