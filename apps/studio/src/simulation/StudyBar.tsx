/**
 * The study bar along the top: study kind, material, mesh fineness and Solve. Controls match the
 * bar height in Visualize and Drawings so the three line up.
 */

import {
  MATERIALS,
  type MeshResolution,
  RESOLUTION_ELEMENTS,
  STUDY_KINDS,
  type StudyKind,
} from '@bezier/sim';
import { MaterialIcon, MeshIcon, Slider, SolveIcon, StudyIcon, shortcutLabel } from '@bezier/ui';
import type { SimulationHandle } from './use-simulation.js';

export function StudyBar({ sim }: { sim: SimulationHandle }) {
  const optimising = sim.study.kind === 'shape-optimisation';
  return (
    <div aria-label="Study" className="sim-bar" role="toolbar">
      <label className="sim-select" title="Study type">
        <StudyIcon />
        <select
          onChange={(event) => sim.setKind(event.target.value as StudyKind)}
          value={sim.study.kind}
        >
          {STUDY_KINDS.map((kind) => (
            <option disabled={!kind.available} key={kind.id} value={kind.id}>
              {kind.label}
              {kind.available ? '' : ' (soon)'}
            </option>
          ))}
        </select>
      </label>
      <label className="sim-select" title="Material">
        <MaterialIcon />
        <select
          onChange={(event) => sim.setMaterial(event.target.value)}
          value={sim.study.materialId}
        >
          <optgroup label="Printed polymers">
            {MATERIALS.filter((m) => m.family === 'polymer').map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Metals">
            {MATERIALS.filter((m) => m.family === 'metal').map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <label className="sim-select" title="Mesh density">
        <MeshIcon />
        <select
          onChange={(event) => sim.setResolution(event.target.value as MeshResolution)}
          value={sim.study.resolution}
        >
          {(Object.keys(RESOLUTION_ELEMENTS) as MeshResolution[]).map((resolution) => (
            <option key={resolution} value={resolution}>
              {resolution[0]?.toUpperCase()}
              {resolution.slice(1)} · {Math.round(RESOLUTION_ELEMENTS[resolution] / 1000)}k
            </option>
          ))}
        </select>
      </label>
      {optimising && (
        <div className="sim-range" title="Share of the material to keep">
          <Slider
            format={(v) => `${v} %`}
            label="Keep"
            max={80}
            min={10}
            onChange={(v) => sim.setOptimisation({ volumeFraction: v / 100 })}
            stops={[{ value: 30 }, { value: 50 }]}
            value={Math.round(sim.study.optimisation.volumeFraction * 100)}
          />
        </div>
      )}
      <span className="sim-bar__rule" />
      {sim.running ? (
        <button className="sim-solve sim-solve--running" onClick={sim.cancel} type="button">
          <Ring fraction={sim.progress?.fraction ?? 0} />
          <span className="sim-solve__detail">{sim.progress?.detail}</span>
          <span className="sim-solve__cancel">Cancel</span>
        </button>
      ) : (
        // Always clickable: pressed early, it says what is missing.
        <button
          className="sim-solve"
          onClick={sim.solve}
          title={`Solve (${shortcutLabel('Cmd+↩')})`}
          type="button"
        >
          <SolveIcon />
          Solve
        </button>
      )}
      {sim.stale && sim.result !== null && !sim.running && (
        <span className="sim-badge">Model changed</span>
      )}
    </div>
  );
}

function Ring({ fraction }: { fraction: number }) {
  const radius = 7;
  const length = 2 * Math.PI * radius;
  return (
    <svg aria-hidden="true" className="sim-ring" height="18" viewBox="0 0 18 18" width="18">
      <circle
        cx="9"
        cy="9"
        fill="none"
        opacity="0.25"
        r={radius}
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="9"
        cy="9"
        fill="none"
        r={radius}
        stroke="currentColor"
        strokeDasharray={`${length * fraction} ${length}`}
        strokeLinecap="round"
        strokeWidth="2"
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}
