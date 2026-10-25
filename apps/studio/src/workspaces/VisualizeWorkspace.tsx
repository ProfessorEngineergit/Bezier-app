/**
 * Visualize: presentation rendering of the part, laid out like common rendering tools. The render
 * fills the stage, one right panel has Material, Environment and Camera tabs, and file outputs
 * (turntable, video, capture) sit together top right. It uses its own WebGPU renderer and camera,
 * so composing a shot never moves the modelling view.
 */

import type { BodySummary } from '@bezier/core';
import type {
  DisplayGeometry,
  PresentationMaterialSurface,
  PresentationRenderer,
  PresentationSettings,
} from '@bezier/renderer';
import { Slider as SegmentSlider } from '@bezier/ui';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { ResizeHandle } from '../ResizeHandle.js';
import { DrawingItemsRail } from './DrawingItemsRail.js';
import { download } from './download.js';
import { EmissionControls } from './EmissionControls.js';
import { ApplyTo, FaceColourSection } from './FaceColourSection.js';
import { FocusDiagram } from './FocusDiagram.js';
import { MaterialColorPicker } from './MaterialColorPicker.js';
import { CATEGORIES, MATERIALS, type MaterialPreset } from './materials.js';
import { claimPresentation, releasePresentation } from './presentation-claim.js';
import { useBodyAppearance } from './use-body-appearance.js';
import { useCanvasPicking } from './use-canvas-picking.js';
import { useFaceColours } from './use-face-colours.js';
import { useFocusClick } from './use-focus-click.js';
import { usePresentationRecovery } from './use-presentation-recovery.js';
import {
  INITIAL_VISUALIZE_ENVIRONMENT,
  VISUALIZE_ENVIRONMENTS,
  type VisualizeEnvironment,
} from './visualize-environments.js';
import './visualize.css';
import { useSidePanel } from './use-side-panel.js';

/** Width limits of the right panel, and the width a double-click resets to. */
const PANEL_DEFAULT = 304;
const PANEL_MIN = 260;
const PANEL_MAX = 520;

type Tab = 'material' | 'environment' | 'camera';

const APERTURES = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16] as const;

/**
 * A material swatch shaded from the preset's physical parameters: roughness spreads and dims the
 * highlight, metalness adds a studio horizon band, transmission shows the backdrop, so the swatch
 * matches the render.
 */
function swatch(
  m: Pick<MaterialPreset, 'color' | 'roughness' | 'metalness' | 'transmission' | 'preview'>,
  surface?: PresentationMaterialSurface,
): CSSProperties {
  const gloss = 1 - m.roughness;
  const spot = 10 + m.roughness * 36;
  const highlight = 0.25 + gloss * 0.7;
  const layers = [
    `radial-gradient(circle at 34% 27%, rgb(255 255 255 / ${highlight}) 0%, rgb(255 255 255 / 0) ${spot}%)`,
  ];
  if (m.metalness > 0.5) {
    layers.push(
      `linear-gradient(172deg, transparent 44%, rgb(255 255 255 / ${0.18 + gloss * 0.3}) 50%, transparent ${58 + m.roughness * 12}%)`,
    );
  }
  if (surface?.kind === 'procedural') {
    if (surface.pattern === 'pla')
      layers.push('repeating-linear-gradient(0deg, transparent 0 3px, rgb(0 0 0 / 0.18) 4px)');
    else if (surface.pattern === 'brushed-metal')
      layers.push(
        'repeating-linear-gradient(90deg, transparent 0 2px, rgb(255 255 255 / 0.1) 3px)',
      );
    else
      layers.push(
        'radial-gradient(circle at 28% 66%, rgb(255 255 255 / 0.12) 0 1px, transparent 2px)',
      );
  }
  layers.push('radial-gradient(circle at 50% 50%, transparent 58%, rgb(0 0 0 / 0.38) 100%)');
  layers.push(
    surface?.kind !== 'texture' || !surface.color
      ? `radial-gradient(circle at 42% 36%, color-mix(in srgb, ${m.color} 82%, white) 0%, ${m.color} 46%, color-mix(in srgb, ${m.color} 55%, black) 100%)`
      : `url("${m.preview ?? surface.color}") center / cover`,
  );
  return {
    background: layers.join(', '),
    opacity: m.transmission > 0.5 ? 0.78 : 1,
  };
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  // The app's shared slider (`Slider` in `@bezier/ui`); the caller formats the shown value.
  return (
    <SegmentSlider
      format={() => display}
      label={label}
      max={max}
      min={min}
      onChange={onChange}
      step={step}
      value={value}
    />
  );
}

const percent = (value: number) => `${Math.round(value * 100)} %`;

export function VisualizeWorkspace({
  geometry: model,
  active,
  documentId,
  bodies,
  selectedBodies,
  onSelectBody,
  itemsOpen,
  itemsWidth,
  onItemsToggle,
}: {
  geometry: DisplayGeometry | null;
  /** Whether Visualize is the visible workspace; it stays mounted while another is. */
  active: boolean;
  documentId: string;
  bodies: readonly BodySummary[];
  selectedBodies: readonly string[];
  onSelectBody: (key: string, additive: boolean) => void;
  itemsOpen: boolean;
  itemsWidth: number;
  onItemsToggle: () => void;
}) {
  // While hidden, the presentation scene holds no model. Otherwise it rebuilds meshes, materials
  // and face colours on every Modeling edit and keeps a second full copy of the model in GPU
  // memory, which hangs workspace switches on large models and can lose the WebGL context. When
  // shown again it takes the current model.
  const geometry = active ? model : null;
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<PresentationRenderer | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decalInput = useRef<HTMLInputElement>(null);
  const environmentRequest = useRef(0);
  const [tab, setTab] = useState<Tab>('material');
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [adjusting, setAdjusting] = useState(true);
  const [customized, setCustomized] = useState(false);
  const [materialName, setMaterialName] = useState('ABS');
  const [materialSurface, setMaterialSurface] = useState<PresentationMaterialSurface | null>(
    MATERIALS.find((material) => material.name === 'ABS')?.surface ?? null,
  );
  const [materialLoading, setMaterialLoading] = useState(false);
  const [environmentId, setEnvironmentId] = useState(INITIAL_VISUALIZE_ENVIRONMENT.id);
  const [environmentLoading, setEnvironmentLoading] = useState(false);
  const [decalSize, setDecalSize] = useState(15);
  const [decals, setDecals] = useState(0);
  const [aperture, setAperture] = useState<number | null>(null);
  const [s, set] = useState<PresentationSettings>(() => ({
    color: '#d9d8d4',
    roughness: 0.58,
    metalness: 0,
    transmission: 0,
    clearcoat: 0,
    fov: 38,
    bloom: 0.15,
    dof: 0,
    focus: 1,
    lightAngle: -45,
    turntable: false,
    duration: 12,
    textureScale: 1,
    grain: 0.72,
    ...INITIAL_VISUALIZE_ENVIRONMENT.settings,
  }));
  const selectedEnvironment =
    VISUALIZE_ENVIRONMENTS.find((environment) => environment.id === environmentId) ??
    INITIAL_VISUALIZE_ENVIRONMENT;
  const latest = useRef({
    geometry,
    bodies,
    s,
    environmentUrl: selectedEnvironment.url,
    materialSurface,
  });
  latest.current = {
    geometry,
    bodies,
    s,
    environmentUrl: selectedEnvironment.url,
    materialSurface,
  };
  const [ready, setReady] = useState(false);
  const faces = useFaceColours({ id: documentId, renderer: engine, ready, geometry });
  const assignment = useBodyAppearance({
    id: documentId,
    bodies,
    selected: selectedBodies,
    faces: faces.selected,
    renderer: engine,
    ready,
    geometry,
    settings: s,
    name: materialName,
    surface: materialSurface,
    setSettings: set,
    setName: setMaterialName,
    setSurface: setMaterialSurface,
    onLoading: setMaterialLoading,
    onError: setError,
  });

  // The renderer starts once there is a model to render, then stays; starting it while a project
  // is still loading blocks the page for seconds.
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    if (geometry !== null) setWanted(true);
  }, [geometry]);
  const recovery = usePresentationRecovery();
  const { lost, restore } = recovery;

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new generation is a new canvas (its key below) and a renderer started afresh on it
  useEffect(() => {
    const element = canvas.current;
    if (!element || !wanted) return;
    let cancelled = false;
    let renderer: PresentationRenderer | null = null;
    const resize = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) renderer?.resize(r.width, r.height);
    });
    const entry = claimPresentation(element);
    entry.promise
      .then((created) => {
        if (cancelled) return;
        renderer = created;
        engine.current = created;
        created.onLost(() => {
          if (cancelled) return;
          setReady(false);
          lost(created);
        });
        created.resize(element.clientWidth, element.clientHeight);
        created.setGeometry(latest.current.geometry, latest.current.bodies);
        created.update(latest.current.s);
        void restore(created).then((problem) => {
          if (cancelled) return;
          setDecals(created.decalCount);
          if (problem !== null) setError(problem);
        });
        resize.observe(element);
        void created
          .setEnvironment(latest.current.environmentUrl)
          .catch((e) => {
            console.error(e);
            if (!cancelled)
              setError('The photographic studio could not load. Using fallback light.');
          })
          .finally(() => {
            if (!cancelled) setReady(true);
          });
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setError(`The presentation renderer could not start: ${String(e)}`);
      });
    return () => {
      cancelled = true;
      resize.disconnect();
      releasePresentation(element, entry);
      engine.current = null;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
    };
  }, [wanted, recovery.generation, lost, restore]);

  useEffect(() => {
    engine.current?.setGeometry(geometry, bodies);
    setDecals(0);
  }, [geometry, bodies]);

  useEffect(() => {
    engine.current?.update(s);
  }, [s]);

  useEffect(() => {
    const renderer = engine.current;
    if (renderer === null) return;
    const request = ++environmentRequest.current;
    setEnvironmentLoading(true);
    void renderer
      .setEnvironment(selectedEnvironment.url)
      .catch((e) => {
        console.error(e);
        if (request === environmentRequest.current)
          setError('The photographic studio could not load. Using fallback light.');
      })
      .finally(() => {
        if (request === environmentRequest.current) setEnvironmentLoading(false);
      });
  }, [selectedEnvironment]);

  const update = <K extends keyof PresentationSettings>(key: K, value: PresentationSettings[K]) =>
    set((old) => ({ ...old, [key]: value }));

  const chooseMaterial = (preset: MaterialPreset, target?: string) => {
    setMaterialName(preset.name);
    setCustomized(false);
    setMaterialSurface(preset.surface ?? null);
    if (preset.tintable) setAdjusting(true);
    const next: PresentationSettings = {
      ...s,
      color: preset.color,
      roughness: preset.roughness,
      metalness: preset.metalness,
      transmission: preset.transmission,
      clearcoat: preset.clearcoat,
      textureScale: preset.textureScale,
      grain: preset.grain,
      textureRotation: 0,
      anisotropy: preset.anisotropy ?? 0,
      anisotropyRotation: preset.anisotropyRotation ?? 0,
      ior: preset.ior ?? 1.5,
      emission: preset.emission ?? 0,
      emissionMode: preset.emissionMode ?? 'surface',
      emissionDirection: preset.emissionDirection ?? 'front',
      emissionBeam: preset.emissionBeam ?? 35,
    };
    assignment.prepare(target, next, preset.name, preset.surface ?? null);
    set(next);
  };

  const chooseEnvironment = (environment: VisualizeEnvironment) => {
    setEnvironmentId(environment.id);
    set((old) => ({ ...old, ...environment.settings }));
  };

  const placeDecal = (file: File, x: number, y: number) => {
    void engine.current
      ?.addDecal(file, x, y, decalSize)
      .then(() => setDecals(engine.current?.decalCount ?? 0))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const capture = () => {
    void engine.current?.capture().then((blob) => {
      if (blob) download(blob, 'bezier-render.png', 'image/png');
      else setError('The capture came back empty. Try again once the render has settled.');
    });
  };

  const record = () => {
    if (!canvas.current || !('MediaRecorder' in window)) {
      setError('Video recording is not available in this browser.');
      return;
    }
    if (recording) {
      recorder.current?.stop();
      return;
    }
    const stream = canvas.current.captureStream(30);
    const mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    const r = new MediaRecorder(
      stream,
      mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined,
    );
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      setRecording(false);
      update('turntable', false);
      if (timer.current) clearTimeout(timer.current);
      download(
        new Blob(chunks, { type: r.mimeType }),
        `bezier-turntable.${r.mimeType.includes('mp4') ? 'mp4' : 'webm'}`,
        r.mimeType,
      );
    };
    recorder.current = r;
    r.start();
    setRecording(true);
    update('turntable', true);
    // Exactly one revolution: the loop in the file starts and ends on the same frame.
    timer.current = setTimeout(() => {
      if (r.state === 'recording') r.stop();
    }, s.duration * 1000);
  };

  const pointIn = (clientX: number, clientY: number) => {
    const rect = canvas.current?.getBoundingClientRect();
    return rect
      ? { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height }
      : null;
  };

  const picking = useCanvasPicking({ engine, faces, onSelectBody, pointIn });
  const focusClick = useFocusClick((clientX, clientY) => {
    const at = pointIn(clientX, clientY);
    const focus = at === null ? null : (engine.current?.focusAt(at.x, at.y) ?? null);
    if (focus === null) return;
    set((old) => ({ ...old, focus, dof: old.dof > 0 ? old.dof : 0.5 }));
    setAperture((value) => value ?? 2.8);
  });

  const search = query.trim().toLowerCase();
  const library = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        items: MATERIALS.filter(
          (m) =>
            m.category === category &&
            (search === '' ||
              `${m.name} ${m.finish} ${m.category} ${m.source ?? 'Studio'}`
                .toLowerCase()
                .includes(search)),
        ),
      })).filter((group) => group.items.length > 0),
    [search],
  );
  const current = MATERIALS.find((m) => m.name === materialName);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
  useSidePanel(panelWidth, active);

  return (
    <section
      aria-label="Visualize workspace"
      className="viz"
      data-transparent={s.transparent ? '' : undefined}
      style={{
        ['--dwg-items' as string]: itemsOpen ? `calc(${itemsWidth}px + var(--edge))` : '0px',
        ['--viz-panel' as string]: `${panelWidth}px`,
      }}
    >
      <canvas
        aria-busy={geometry !== null && !ready}
        aria-label="PBR presentation viewport"
        className="viz__canvas"
        key={recovery.generation}
        {...picking}
        {...focusClick}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const found = MATERIALS.find(
            (m) => m.name === event.dataTransfer.getData('application/bezier-material'),
          );
          if (found) {
            const at = pointIn(event.clientX, event.clientY);
            const key = at && engine.current?.pickBody(at.x, at.y);
            chooseMaterial(found, key || undefined);
            if (key) onSelectBody(key, false);
            return;
          }
          const file = event.dataTransfer.files[0];
          const at = pointIn(event.clientX, event.clientY);
          if (file && at) placeDecal(file, at.x, at.y);
        }}
        ref={canvas}
      />

      {!geometry && (
        <div className="viz__empty">
          <strong>Nothing to render yet</strong>
          <span>Build a solid in Modeling, then come back to light and finish it.</span>
        </div>
      )}
      {geometry && recovery.stopped && (
        <div className="viz__status" role="status">
          The graphics device was lost several times in a row.
          <button onClick={recovery.restart} type="button">
            Start the renderer again
          </button>
        </div>
      )}
      {geometry && !ready && !recovery.stopped && error === '' && (
        <div className="viz__status" role="status">
          <span className="viz__spinner" />
          Starting the renderer…
        </div>
      )}

      <div className="viz-items-rail">
        <DrawingItemsRail
          open={itemsOpen}
          onToggle={onItemsToggle}
          label="Visualization items controls"
        />
      </div>
      <div aria-label="Render" className="viz__actions" role="toolbar">
        <button
          aria-pressed={s.turntable && !recording}
          disabled={recording || !geometry}
          onClick={() => update('turntable', !s.turntable)}
          type="button"
        >
          {s.turntable && !recording ? 'Stop Turntable' : 'Turntable'}
        </button>
        <button
          data-recording={recording ? '' : undefined}
          disabled={!geometry}
          onClick={record}
          type="button"
        >
          {recording ? 'Stop & Save Video' : 'Record 360°'}
        </button>
        <button onClick={() => engine.current?.frame()} type="button">
          Frame
        </button>
        <button className="viz__primary" disabled={!ready} onClick={capture} type="button">
          Capture
        </button>
      </div>

      <aside aria-label="Look" className="viz-inspector">
        <ResizeHandle
          className="viz-inspector__resize"
          direction="left"
          label="Resize the look panel"
          max={PANEL_MAX}
          min={PANEL_MIN}
          onResize={setPanelWidth}
          reset={PANEL_DEFAULT}
          width={panelWidth}
        />
        <div className="viz-tabs" role="tablist">
          {(['material', 'environment', 'camera'] as const).map((id) => (
            <button
              aria-selected={tab === id}
              key={id}
              onClick={() => setTab(id)}
              role="tab"
              type="button"
            >
              {id === 'material' ? 'Material' : id === 'environment' ? 'Environment' : 'Camera'}
            </button>
          ))}
        </div>

        {tab === 'material' && (
          <div className="viz-pane" key="material" role="tabpanel">
            <input
              aria-label="Search materials"
              className="viz-search"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Materials"
              type="search"
              value={query}
            />
            {faces.selected.length > 0 && (
              <FaceColourSection
                colour={faces.shown}
                coloured={faces.anyColoured}
                count={faces.selected.length}
                onPaint={faces.paint}
              />
            )}
            <section className="viz-section">
              <ApplyTo assignment={assignment} />
              <header>
                <h3>In Use</h3>
                <span className="viz-section__actions">
                  {materialLoading && <small>Loading maps…</small>}
                  <button onClick={() => setAdjusting((value) => !value)} type="button">
                    {adjusting ? 'Done' : 'Adjust'}
                  </button>
                </span>
              </header>
              <div className="viz-used">
                <span
                  className="viz-ball viz-ball--small"
                  style={swatch(s, materialSurface ?? undefined)}
                />
                <span>
                  <strong>{current?.name ?? 'Custom'}</strong>
                  <small>
                    {current === undefined
                      ? 'Custom material'
                      : `${current.finish} · ${current.category}${customized ? ' · Custom' : ''}`}
                  </small>
                  {current?.source && <em>{current.source}</em>}
                </span>
              </div>
              {adjusting && (
                <div className="viz-adjust">
                  {current?.tintable && (
                    <MaterialColorPicker
                      onChange={(color) => {
                        setCustomized(true);
                        update('color', color);
                      }}
                      palette={current.palette ?? []}
                      value={s.color}
                    />
                  )}
                  {current?.category === 'Light' && (
                    <EmissionControls settings={s} onChange={update} />
                  )}
                  <Slider
                    display={percent(s.roughness)}
                    label="Roughness"
                    max={1}
                    min={0}
                    onChange={(v) => {
                      setCustomized(true);
                      update('roughness', v);
                    }}
                    step={0.01}
                    value={s.roughness}
                  />
                  <Slider
                    display={percent(s.metalness)}
                    label="Metallic"
                    max={1}
                    min={0}
                    onChange={(v) => {
                      setCustomized(true);
                      update('metalness', v);
                    }}
                    step={0.01}
                    value={s.metalness}
                  />
                  <Slider
                    display={percent(s.clearcoat)}
                    label="Clear Coat"
                    max={1}
                    min={0}
                    onChange={(v) => {
                      setCustomized(true);
                      update('clearcoat', v);
                    }}
                    step={0.01}
                    value={s.clearcoat}
                  />
                  <Slider
                    display={percent(s.transmission)}
                    label="Transmission"
                    max={1}
                    min={0}
                    onChange={(v) => {
                      setCustomized(true);
                      update('transmission', v);
                    }}
                    step={0.01}
                    value={s.transmission}
                  />
                  {materialSurface !== null && (
                    <>
                      <Slider
                        display={`${Math.round(s.grain * 100)} %`}
                        label="Grain"
                        max={2}
                        min={0}
                        onChange={(v) => {
                          setCustomized(true);
                          update('grain', v);
                        }}
                        step={0.01}
                        value={s.grain}
                      />
                      <Slider
                        display={`${Math.round(((s.textureRotation ?? 0) * 180) / Math.PI)}°`}
                        label="Grain Direction"
                        max={360}
                        min={0}
                        onChange={(v) => {
                          setCustomized(true);
                          update('textureRotation', (v * Math.PI) / 180);
                        }}
                        step={1}
                        value={((s.textureRotation ?? 0) * 180) / Math.PI}
                      />
                      <Slider
                        display={`${Math.round(s.textureScale * 100)} %`}
                        label="Structure Scale"
                        max={4}
                        min={0.25}
                        onChange={(v) => {
                          setCustomized(true);
                          update('textureScale', v);
                        }}
                        step={0.05}
                        value={s.textureScale}
                      />
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="viz-section">
              <header>
                <h3>Decal</h3>
                {decals > 0 && (
                  <button
                    onClick={() => {
                      engine.current?.clearDecals();
                      setDecals(0);
                    }}
                    type="button"
                  >
                    Clear {decals}
                  </button>
                )}
              </header>
              <div className="viz-decal">
                <p>
                  Drop a PNG, JPEG or WebP onto the model, or import one to place it at the centre.
                </p>
                <div className="viz-decal__row">
                  <button onClick={() => decalInput.current?.click()} type="button">
                    Import…
                  </button>
                  <label className="viz-decal__size">
                    <input
                      aria-label="Decal size"
                      max={1000}
                      min={1}
                      onChange={(e) => setDecalSize(Math.max(1, Number(e.target.value)))}
                      type="number"
                      value={decalSize}
                    />
                    <small>mm</small>
                  </label>
                </div>
                <input
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) placeDecal(file, 0.5, 0.5);
                    e.target.value = '';
                  }}
                  ref={decalInput}
                  type="file"
                />
              </div>
            </section>

            {library.map((group) => (
              <section className="viz-section" key={group.category}>
                <header>
                  <h3>{group.category}</h3>
                </header>
                <div className="viz-library">
                  {group.items.map((m) => (
                    <button
                      aria-label={m.name}
                      aria-pressed={materialName === m.name}
                      className="viz-material"
                      data-structured={m.surface ? '' : undefined}
                      draggable
                      key={m.name}
                      onClick={() => chooseMaterial(m)}
                      onDragStart={(e) =>
                        e.dataTransfer.setData('application/bezier-material', m.name)
                      }
                      title={`${m.finish} ${m.name}`}
                      type="button"
                    >
                      <span className="viz-ball" style={swatch(m, m.surface)} />
                      <small>{m.finish}</small>
                      <strong>{m.name}</strong>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {library.length === 0 && <p className="viz-note">No material matches “{query}”.</p>}
          </div>
        )}

        {tab === 'environment' && (
          <div className="viz-pane" key="environment" role="tabpanel">
            <section className="viz-section">
              <header>
                <h3>Photographic Studio</h3>
                {environmentLoading && <span className="viz-environment__loading">Loading…</span>}
              </header>
              <div aria-busy={environmentLoading} className="viz-environments">
                {VISUALIZE_ENVIRONMENTS.map((environment) => (
                  <button
                    aria-pressed={environmentId === environment.id}
                    className="viz-environment"
                    data-environment={environment.id}
                    key={environment.id}
                    onClick={() => chooseEnvironment(environment)}
                    style={
                      {
                        '--env-bg': environment.settings.background,
                        '--env-ground': environment.settings.groundColor,
                        '--env-key': environment.preview.key,
                        '--env-fill': environment.preview.fill,
                      } as CSSProperties
                    }
                    type="button"
                  >
                    <span className="viz-environment__ball" />
                    <strong>{environment.name}</strong>
                  </button>
                ))}
              </div>
              {environmentId === 'mood' && (
                <label className="viz-colour">
                  <span>Backdrop</span>
                  <input
                    aria-label="Backdrop colour"
                    onChange={(e) =>
                      set((old) => ({
                        ...old,
                        background: e.target.value,
                        groundColor: e.target.value,
                      }))
                    }
                    type="color"
                    value={s.background}
                  />
                </label>
              )}
            </section>
            <section className="viz-section">
              <header>
                <h3>Light</h3>
              </header>
              <Slider
                display={`${s.exposure > 0 ? '+' : ''}${s.exposure.toFixed(1)} EV`}
                label="Exposure"
                max={2}
                min={-2}
                onChange={(v) => update('exposure', v)}
                step={0.1}
                value={s.exposure}
              />
              <Slider
                display={percent(s.environment)}
                label="Ambient"
                max={2}
                min={0}
                onChange={(v) => update('environment', v)}
                step={0.05}
                value={s.environment}
              />
              <Slider
                display={`${Math.round(s.lightAngle)}°`}
                label="Key Light Angle"
                max={180}
                min={-180}
                onChange={(v) => update('lightAngle', v)}
                step={1}
                value={s.lightAngle}
              />
              <label className="viz-toggle">
                <span>Ground Shadow</span>
                <input
                  checked={s.ground && !s.transparent}
                  disabled={s.transparent}
                  onChange={(e) => update('ground', e.target.checked)}
                  type="checkbox"
                />
              </label>
            </section>
          </div>
        )}

        {tab === 'camera' && (
          <div className="viz-pane" key="camera" role="tabpanel">
            <section className="viz-section">
              <Slider
                display={`${Math.round(s.fov)}°`}
                label="Field of View"
                max={90}
                min={15}
                onChange={(v) => update('fov', v)}
                step={1}
                value={s.fov}
              />
              <div className="viz-field">
                <span>Aperture</span>
                <div className="viz-segment">
                  <button
                    aria-pressed={aperture === null}
                    onClick={() => {
                      setAperture(null);
                      update('dof', 0);
                    }}
                    type="button"
                  >
                    Off
                  </button>
                  {APERTURES.filter((f) => f <= 8).map((f) => (
                    <button
                      aria-pressed={aperture === f}
                      key={f}
                      onClick={() => {
                        setAperture(f);
                        // Wider aperture, shallower focus: bokeh scales with 1/f.
                        update('dof', Math.min(1, 1.4 / f));
                      }}
                      type="button"
                    >
                      ƒ{f}
                    </button>
                  ))}
                </div>
              </div>
              {aperture !== null && <FocusDiagram blur={s.dof} focus={s.focus} />}
              {aperture !== null && (
                <Slider
                  display={`${s.focus.toFixed(2)}×`}
                  label="Focus Distance"
                  max={2}
                  min={0.2}
                  onChange={(v) => update('focus', v)}
                  step={0.01}
                  value={s.focus}
                />
              )}
              <p className="viz-note">
                {aperture === null
                  ? 'Choose an aperture to blur what is not in focus. A small ƒ number is a wide opening: little stays sharp.'
                  : 'One distance stays sharp and what lies nearer or farther is blurred. The smaller the ƒ number, the narrower the sharp band. Right-click the model to focus there.'}
              </p>
            </section>
            <section className="viz-section">
              <header>
                <h3>Effects</h3>
              </header>
              <Slider
                display={percent(s.bloom)}
                label="Glow"
                max={1}
                min={0}
                onChange={(v) => update('bloom', v)}
                step={0.01}
                value={s.bloom}
              />
              <Slider
                display={`${s.duration} s`}
                label="Turntable Length"
                max={30}
                min={4}
                onChange={(v) => update('duration', v)}
                step={1}
                value={s.duration}
              />
            </section>
          </div>
        )}
      </aside>

      {error !== '' && (
        <div className="viz__error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} type="button">
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
