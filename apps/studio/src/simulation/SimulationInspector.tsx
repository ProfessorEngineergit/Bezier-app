/**
 * The study panel on the right, like Visualize's and Drawings' inspectors: study status and missing
 * inputs, the placement being edited, then results (scale with hover value, readings, display
 * mode, view sides, exports). Study settings and Solve stay in the top bar (`StudyBar.tsx`).
 */

import { MATERIALS, STUDY_KINDS, type StudyKind } from '@bezier/sim';
import {
  AnimateIcon,
  DisplacementIcon,
  SafetyIcon,
  StressIcon,
  TemperatureMapIcon,
} from '@bezier/ui';
import { type ReactNode, type RefObject, useState } from 'react';
import type { ViewportHandle } from '../Viewport.js';
import { sendPhysicsSheet } from '../workspaces/physics-inbox.js';
import { ResultHover } from './ResultHover.js';
import { format, PlacementEditor } from './SimulationParts.js';
import { makePhysicsSheet, savePictures, saveValues, VIEW_ANGLES } from './sim-report.js';
import type { ResultQuantity, SimulationHandle } from './use-simulation.js';

/** One sentence on what a result shows, for someone new to the term. */
function meaning(quantity: ResultQuantity, yieldStrength: number | undefined): string {
  switch (quantity) {
    case 'vonMises':
      return `How hard the material is working at each point: red is closest to giving way${yieldStrength === undefined ? '' : `, which this material does at ${format(yieldStrength)} MPa`}.`;
    case 'displacement':
      return 'How far each point moves under the load, in millimetres.';
    case 'safety':
      return 'How many times this load the part takes before it starts to give way. Under 1 it gives way; 2 or more is comfortable.';
    case 'temperature':
      return 'The temperature at each point once the heat has settled.';
    case 'flux':
      return 'How much heat flows through each point.';
    default:
      return '';
  }
}

const QUANTITIES: Partial<
  Record<StudyKind, readonly { id: ResultQuantity; label: string; icon: ReactNode }[]>
> = {
  static: [
    { id: 'vonMises', label: 'Stress', icon: <StressIcon /> },
    { id: 'displacement', label: 'Displacement', icon: <DisplacementIcon /> },
    { id: 'safety', label: 'Safety', icon: <SafetyIcon /> },
  ],
  thermal: [
    { id: 'temperature', label: 'Temperature', icon: <TemperatureMapIcon /> },
    { id: 'flux', label: 'Heat flux', icon: <StressIcon /> },
  ],
};

export function SimulationInspector({
  sim,
  handleRef,
  projectName,
  onOpenDrawings,
}: {
  sim: SimulationHandle;
  handleRef: RefObject<ViewportHandle | null>;
  projectName: string;
  /** Go to Drawings, where a newly made physics drawing is waiting. */
  onOpenDrawings: () => void;
}) {
  const material = MATERIALS.find((m) => m.id === sim.study.materialId);
  return (
    <aside aria-label="Study" className="sim-inspector">
      <div className="sim-inspector__scroll">
        <section aria-label="About the study" className="sim-section">
          <h3>{sim.study.name}</h3>
          <p className="sim-note">{STUDY_KINDS.find((k) => k.id === sim.study.kind)?.summary}</p>
          {material !== undefined && (
            <p className="sim-note">
              {material.name} ·{' '}
              {sim.study.kind === 'thermal'
                ? `conducts ${format(material.conductivity)} W/(m·K)`
                : `E ${format(material.youngsModulus / 1000)} GPa, yields at ${format(material.yieldStrength)} MPa`}
            </p>
          )}
          {sim.missing.length > 0 && sim.editing === null && (
            // What is missing, stated once in plain words, beside the marked rail groups.
            <div className="sim-missing" role="status">
              <strong>Still needed</strong>
              {sim.missing.map((need) => (
                <p key={need.what}>{need.means}</p>
              ))}
            </div>
          )}
          {sim.error !== null && (
            <div className="sim-problem" role="alert">
              <strong>{sim.error.message}</strong>
              {sim.error.issues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
              <button onClick={sim.dismissError} type="button">
                Dismiss
              </button>
            </div>
          )}
        </section>

        {sim.editing !== null && <PlacementEditor placement={sim.editing} sim={sim} />}

        {sim.result !== null && (
          <Results
            handleRef={handleRef}
            onOpenDrawings={onOpenDrawings}
            projectName={projectName}
            sim={sim}
          />
        )}
      </div>
    </aside>
  );
}

function Results({
  sim,
  handleRef,
  projectName,
  onOpenDrawings,
}: {
  sim: SimulationHandle;
  handleRef: RefObject<ViewportHandle | null>;
  projectName: string;
  onOpenDrawings: () => void;
}) {
  const result = sim.result;
  const [busy, setBusy] = useState<string | null>(null);
  if (result === null) return null;
  const quantities = QUANTITIES[result.studyKind];
  const legend = sim.legend;
  const structural = result.studyKind === 'static';
  /** One export at a time; the button shows which is running. */
  const run = (what: string, task: () => Promise<unknown>) => {
    if (busy !== null) return;
    setBusy(what);
    task()
      .catch((error: unknown) => console.error(`${what} failed`, error))
      .finally(() => setBusy(null));
  };
  const handle = handleRef.current;
  return (
    <section aria-label="Results" className="sim-section">
      <h3>Results</h3>
      {quantities !== undefined && (
        <div className="sim-segment sim-segment--wide sim-segment--icons">
          {quantities.map((quantity) => (
            <button
              aria-pressed={sim.quantity === quantity.id}
              key={quantity.id}
              onClick={() => sim.setQuantity(quantity.id)}
              type="button"
            >
              {quantity.icon}
              {quantity.label}
            </button>
          ))}
        </div>
      )}
      {legend !== null ? (
        <>
          <Scale handleRef={handleRef} sim={sim} />
          <p className="sim-note">
            {meaning(
              sim.quantity,
              MATERIALS.find((m) => m.id === sim.study.materialId)?.yieldStrength,
            )}
          </p>
        </>
      ) : (
        <p className="sim-note">
          {sim.stale ? 'The model changed: solve again to see the result.' : 'Hidden.'}
        </p>
      )}
      <Readings sim={sim} />

      <div className="sim-row">
        <span>Colour</span>
        <div className="sim-segment">
          <button aria-pressed={sim.bands === 0} onClick={() => sim.setBands(0)} type="button">
            Smooth
          </button>
          <button aria-pressed={sim.bands > 0} onClick={() => sim.setBands(10)} type="button">
            Contours
          </button>
        </div>
      </div>
      {structural && (
        <div className="sim-row">
          <span>Shape</span>
          <div className="sim-segment" title="Deformation scale">
            {(['off', 'actual', 'adjusted'] as const).map((mode) => (
              <button
                aria-pressed={sim.deform === mode}
                key={mode}
                onClick={() => sim.setDeform(mode)}
                type="button"
              >
                {mode === 'off' ? 'As built' : mode === 'actual' ? 'Actual' : 'Exaggerated'}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="sim-row">
        {structural ? (
          <button
            aria-pressed={sim.animate}
            className="sim-toggle"
            disabled={sim.deform === 'off'}
            onClick={() => sim.setAnimate(!sim.animate)}
            type="button"
          >
            <AnimateIcon />
            Animate
          </button>
        ) : (
          <span />
        )}
        <button
          aria-pressed={!sim.showResults}
          className="sim-toggle"
          onClick={() => sim.setShowResults(!sim.showResults)}
          type="button"
        >
          {sim.showResults ? 'Hide result' : 'Show result'}
        </button>
      </div>

      <h3>Look from</h3>
      <div className="sim-views">
        {VIEW_ANGLES.map((view) => (
          <button
            key={view.label}
            onClick={() => {
              if (view.sides.length === 1) handle?.setView(view.sides[0], true);
              else handle?.setViewBetween(view.sides, true);
            }}
            type="button"
          >
            {view.label}
          </button>
        ))}
      </div>

      <h3>Take it away</h3>
      <div className="sim-exports">
        <button
          disabled={busy !== null}
          onClick={() =>
            run('Values', async () => {
              if (sim.positions !== null)
                await saveValues(sim.study, result, sim.positions, projectName);
            })
          }
          type="button"
        >
          {busy === 'Values' ? 'Saving…' : 'Values (CSV)'}
        </button>
        <button
          disabled={busy !== null || handle === null}
          onClick={() =>
            run('Pictures', async () => {
              if (handleRef.current !== null)
                await savePictures(handleRef.current, sim.around, projectName, sim.study);
            })
          }
          type="button"
        >
          {busy === 'Pictures' ? 'Saving…' : 'Pictures, 4 sides'}
        </button>
        <button
          className="sim-exports__primary"
          disabled={busy !== null || handle === null || legend === null}
          onClick={() =>
            run('Drawing', async () => {
              const view = handleRef.current;
              if (view === null || legend === null) return;
              const sheet = await makePhysicsSheet({
                handle: view,
                study: sim.study,
                result,
                legend,
                placements: sim.placements,
                around: sim.around,
              });
              // To Drawings, where it is arranged, annotated and exported as PDF.
              sendPhysicsSheet(sheet);
              onOpenDrawings();
            })
          }
          type="button"
        >
          {busy === 'Drawing' ? 'Drawing…' : 'Create physics drawing'}
        </button>
      </div>
      <p className="sim-note">
        Voxel approximation · {result.elements.toLocaleString('en-US')} elements of{' '}
        {format(result.h)} mm. Check critical parts with a finer mesh.
      </p>
    </section>
  );
}

/** The vertical colour scale, with the hover value moving along it. */
function Scale({
  sim,
  handleRef,
}: {
  sim: SimulationHandle;
  handleRef: RefObject<ViewportHandle | null>;
}) {
  const legend = sim.legend;
  if (legend === null) return null;
  const ticks = Array.from(
    { length: 6 },
    (_, i) => legend.max - ((legend.max - legend.min) * i) / 5,
  );
  return (
    <div className="sim-legend" data-palette={legend.palette}>
      <div className="sim-legend__title">
        {legend.label}
        {legend.unit !== '' && <small>{legend.unit}</small>}
      </div>
      <div className="sim-legend__scale">
        <div className="sim-legend__bar" data-banded={sim.bands > 0 ? '' : undefined}>
          <ResultHover handleRef={handleRef} max={legend.max} min={legend.min} unit={legend.unit} />
        </div>
        <ol>
          {ticks.map((tick, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the ticks are positional
            <li key={index}>{legend.palette === 'safety' && index === 0 ? '8+' : format(tick)}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Readings({ sim }: { sim: SimulationHandle }) {
  const result = sim.result;
  if (result === null) return null;
  const s = result.summary;
  if (result.studyKind === 'thermal')
    return (
      <dl className="sim-legend__summary">
        <div>
          <dt>Highest temperature</dt>
          <dd>{format(s.maxTemperature ?? 0)} °C</dd>
        </div>
        <div>
          <dt>Lowest temperature</dt>
          <dd>{format(s.minTemperature ?? 0)} °C</dd>
        </div>
        <div>
          <dt>Largest heat flux</dt>
          <dd>{format(s.maxFlux ?? 0)} W/m²</dd>
        </div>
      </dl>
    );
  if (s.volumeFraction !== undefined)
    return (
      <dl className="sim-legend__summary">
        <div>
          <dt>Material kept</dt>
          <dd>{Math.round(s.volumeFraction * 100)} %</dd>
        </div>
      </dl>
    );
  const safety = s.minSafetyFactor;
  const tone = safety < 1 ? 'fail' : safety < 2 ? 'warn' : 'ok';
  return (
    <>
      <dl className="sim-legend__summary">
        <div>
          <dt>Max stress</dt>
          <dd>{format(s.maxVonMises)} MPa</dd>
        </div>
        <div>
          <dt>Max displacement</dt>
          <dd>{format(s.maxDisplacement)} mm</dd>
        </div>
        <div data-tone={tone}>
          <dt>Min safety factor</dt>
          <dd>{safety >= 15 ? '15+' : format(safety)}</dd>
        </div>
      </dl>
      <p className="sim-verdict" data-tone={tone}>
        {safety < 1
          ? 'It would give way under this load.'
          : safety < 2
            ? 'It holds, with little to spare.'
            : safety >= 15
              ? 'It holds this load many times over.'
              : `It holds, about ${format(safety)} times over.`}
      </p>
    </>
  );
}
