/**
 * Drawings: a sheet on a dark desk that zooms (pinch or ⌘-scroll) and pans (scroll or drag) like
 * any document, with tools in one top bar and sheet settings in one right inspector. Views are
 * exact B-Rep hidden-line projections from the kernel, and the PDF and DXF exports read this SVG.
 */

import { formatRef } from '@bezier/core';
import type { DrawingProjection } from '@bezier/kernel';
import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { Session, SessionView } from '../session.js';
import { DrawingDeskDots } from './DrawingDeskDots.js';
import { DrawingInactiveSheet } from './DrawingInactiveSheet.js';
import { DrawingInspector, INSPECTOR_DEFAULT } from './DrawingInspector.js';
import { DrawingItems } from './DrawingItems.js';
import { DrawingItemsRail } from './DrawingItemsRail.js';
import { DrawingOverview } from './DrawingOverview.js';
import { DrawingPaper } from './DrawingPaper.js';
import { DrawingToolbar } from './DrawingToolbar.js';
import { drawingDesk } from './drawing-desk.js';
import { detailView } from './drawing-detail.js';
import type { DimensionKind, DrawingSnap } from './drawing-dimensions.js';
import { exportDrawingDxf, exportDrawingPdf } from './drawing-export.js';
import type { SheetView } from './drawing-sheet.js';
import {
  type DetailState,
  layoutViews,
  SCALES,
  type SheetDimension,
  type SheetOptions,
  scaleLabel,
  sheetSize,
  type ToleranceFrame,
  type VectorLogo,
} from './drawing-sheet.js';
import { withDrawingSketches } from './drawing-sketches.js';
import { useDrawingSheets } from './use-drawing-sheets.js';
import './drawings.css';
import { DrawingKindToggle } from './DrawingKindToggle.js';
import { isPhysics } from './drawing-sheets.js';
import { PhysicsLayer } from './PhysicsLayer.js';
import { onPhysicsSheet, takePhysicsSheets } from './physics-inbox.js';
import { physicsPreview } from './physics-layout.js';
import type { PhysicsContent } from './physics-sheets.js';
import { useSidePanel } from './use-side-panel.js';

/** Room the inspector and the tool bar take from the desk, in pixels. */
/** The inspector and the margin either side of it, which the sheet keeps clear. */
const INSPECTOR_MARGIN = 36;
const TOOLBAR = 60;
/** Pixels per millimetre at 100 %. */
const ACTUAL = 96 / 25.4;

function extent(view: DrawingProjection) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const line of [...view.visible, ...view.hidden])
    for (let i = 0; i + 1 < line.length; i += 2) {
      const x = line[i] as number;
      const y = line[i + 1] as number;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** The largest standard scale at which every view fits its place on the sheet. */
function suggestScale(views: DrawingProjection[], format: SheetOptions['format']): number {
  const [w, h] = sheetSize(format);
  let vw = 0;
  let vh = 0;
  for (const view of views) {
    const e = extent(view);
    if (e === null) continue;
    vw = Math.max(vw, e.maxX - e.minX);
    vh = Math.max(vh, e.maxY - e.minY);
  }
  if (vw === 0 || vh === 0) return 1;
  const across = views.length > 4 ? 0.22 : 0.3;
  let best: number = SCALES[0];
  for (const s of SCALES) if (vw * s <= w * across && vh * s <= h * 0.26) best = s;
  return best;
}

export function DrawingsWorkspace({
  session,
  name,
  model,
  itemsOpen,
  itemsWidth,
  onItemsWidth,
  onItemsToggle,
  active = true,
}: {
  /** Whether this workspace is visible; it stays mounted while another is. */
  active?: boolean;
  session: Session | null;
  name: string;
  model: SessionView | null;
  itemsOpen: boolean;
  itemsWidth: number;
  onItemsWidth: (width: number) => void;
  onItemsToggle: () => void;
}) {
  const book = useDrawingSheets(session, name);
  const { options, autoScale, logo, dimensions, section, detail, frames } = book.sheet;
  const setOptions = useCallback(
    (value: import('react').SetStateAction<SheetOptions>) => book.field('options', value),
    [book.field],
  );
  const setAutoScale = (value: boolean) => book.field('autoScale', value);
  const setLogo = (value: VectorLogo | null) => book.field('logo', value);
  const setDimensions = useCallback(
    (value: import('react').SetStateAction<SheetDimension[]>) => book.field('dimensions', value),
    [book.field],
  );
  const setSection = (value: import('react').SetStateAction<number | null>) =>
    book.field('section', value);
  const setDetail = (value: import('react').SetStateAction<DetailState>) =>
    book.field('detail', value);
  const setFrames = (value: ToleranceFrame[]) => book.field('frames', value);
  const [views, setViews] = useState<DrawingProjection[]>([]);
  const [projectedSource, setProjectedSource] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(session !== null);
  const [revision, setRevision] = useState(0);
  const [dimensioning, setDimensioning] = useState(false);
  const [first, setFirst] = useState<DrawingSnap | null>(null);
  const [dimensionKind, setDimensionKind] = useState<DimensionKind>('aligned');
  const [camera, setCamera] = useState({ zoom: 2, x: 0, y: 0 });
  /** A Shift-drag rectangle on the desk that selects every sheet it touches (audit D11). */
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT);
  useSidePanel(inspectorWidth, active);
  // Drawing sheets and physics drawings share one book and desk; the open sheet sets which kind
  // is shown, and only that kind is laid out, listed and overviewed.
  const physicsMode = isPhysics(book.sheet);
  const shown = book.sheets.filter((s) => isPhysics(s) === physicsMode);
  const physicsCount = book.sheets.filter(isPhysics).length;
  const kindToggle = (
    <DrawingKindToggle
      kind={physicsMode ? 'physics' : 'sheets'}
      onKind={(next) => {
        const target = book.sheets.find((s) => isPhysics(s) === (next === 'physics'));
        if (target !== undefined) book.select(target.id);
        else if (next === 'sheets') book.add();
      }}
      physicsCount={physicsCount}
    />
  );
  // A physics drawing made in Simulation becomes a sheet here, now or when Drawings next opens.
  const addPhysics = useRef(book.addPhysics);
  addPhysics.current = book.addPhysics;
  useEffect(() => {
    if (!book.ready) return;
    const take = () => {
      for (const content of takePhysicsSheets()) addPhysics.current(content);
    };
    take();
    return onPhysicsSheet(take);
  }, [book.ready]);

  const [exportOpen, setExportOpen] = useState(false);
  const desk = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [width, height] = sheetSize(options.format);
  const deskLayout = drawingDesk(shown);
  const deskWidth = deskLayout.width,
    deskHeight = deskLayout.height;
  const [previews, setPreviews] = useState<Record<string, SheetView[]>>({});
  const rememberLayout = useCallback((id: string, layout: SheetView[]) => {
    setPreviews((old) => (old[id] === layout ? old : { ...old, [id]: layout }));
  }, []);

  const availableBodies = model?.bodies ?? [];
  const selectedKeys = book.sheet.bodies;
  const included = selectedKeys ?? availableBodies.filter((b) => !b.hidden).map((b) => b.key);
  const faceKey = availableBodies
    .filter((b) => included.includes(b.key))
    .flatMap((b) => b.faces.slice(0, 1))
    .map(formatRef)
    .join('|');
  const projectionSource = `${faceKey}:${section}:${revision}`;

  // Project the model; a moving cut slider settles before the kernel is asked.
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision is the explicit "Update from model" trigger
  useEffect(() => {
    // A physics drawing has its pictures; there is nothing to project.
    if (!session || !book.ready || physicsMode) {
      setViews([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      session
        .drawingViews(
          section ?? undefined,
          availableBodies
            .filter((b) => included.includes(b.key))
            .flatMap((b) => b.faces.slice(0, 1)),
        )
        .then((value) => {
          if (!active) return;
          setViews(value);
          setProjectedSource(projectionSource);
          setError('');
        })
        .catch((e: unknown) => active && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => active && setLoading(false));
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session, section, revision, faceKey, book.ready, projectionSource, physicsMode]);

  // Dimensions are in paper millimetres, so anything that moves the views invalidates them rather
  // than leaving them dangling.
  const invalidate = useCallback(() => {
    setDimensions([]);
    setFirst(null);
  }, [setDimensions]);

  useEffect(() => {
    // Never resize a newly selected sheet from the previous sheet's geometry.
    if (!autoScale || !views.length || projectedSource !== projectionSource) return;
    const scale = suggestScale(views, options.format);
    if (scale !== options.scale) {
      setOptions((o) => ({ ...o, scale }));
      invalidate();
    }
  }, [
    autoScale,
    views,
    options.format,
    options.scale,
    invalidate,
    setOptions,
    projectedSource,
    projectionSource,
  ]);

  const patch = <K extends keyof SheetOptions>(key: K, value: SheetOptions[K]) => {
    setOptions((o) => ({ ...o, [key]: value }));
    if (key === 'scale' || key === 'format' || key === 'projection') invalidate();
  };

  const fit = useCallback(() => {
    const el = desk.current;
    if (!el || el.clientWidth === 0) return;
    const left = (itemsOpen ? itemsWidth + 12 : 0) + 60;
    const aw = el.clientWidth - inspectorWidth - INSPECTOR_MARGIN - 48 - left;
    const ah = el.clientHeight - TOOLBAR - 56;
    const zoom = Math.max(0.3, Math.min(aw / deskWidth, ah / deskHeight));
    setCamera({
      zoom,
      x: left + 24 + (aw - deskWidth * zoom) / 2,
      y: TOOLBAR + 20 + (ah - deskHeight * zoom) / 2,
    });
  }, [deskWidth, deskHeight, inspectorWidth, itemsOpen, itemsWidth]);

  useLayoutEffect(() => {
    fit();
    const el = desk.current;
    if (!el) return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);
  // Sheet selection changes the editing target, never the camera.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a sheet identifier is the explicit reset trigger
  useEffect(() => {
    setFirst(null);
    setDimensioning(false);
  }, [book.sheet.id]);

  const zoomBy = useCallback(
    (factor: number, px?: number, py?: number) => {
      setCamera((c) => {
        const el = desk.current;
        const ox = px ?? ((el?.clientWidth ?? 0) - inspectorWidth - INSPECTOR_MARGIN) / 2;
        const oy = py ?? (el?.clientHeight ?? 0) / 2;
        const zoom = Math.min(40, Math.max(0.3, c.zoom * factor));
        const k = zoom / c.zoom;
        return { zoom, x: ox - (ox - c.x) * k, y: oy - (oy - c.y) * k };
      });
    },
    [inspectorWidth],
  );

  // Wheel pans, pinch (which arrives as ctrl+wheel) and ⌘-wheel zoom about the pointer. Registered
  // by hand: React's wheel listener is passive.
  useEffect(() => {
    const el = desk.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect();
        zoomBy(Math.exp(-event.deltaY * 0.01), event.clientX - rect.left, event.clientY - rect.top);
      } else setCamera((c) => ({ ...c, x: c.x - event.deltaX, y: c.y - event.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const toggleDimension = () => {
    setDimensioning((d) => !d);
    setFirst(null);
  };

  const toggleDetail = () => {
    const top = views.find((v) => v.direction === 'top');
    const e = top ? extent(top) : null;
    setDetail((d) =>
      d.on || e === null
        ? { ...d, on: !d.on }
        : {
            on: true,
            x: Number(e.maxX.toFixed(1)),
            y: Number(e.maxY.toFixed(1)),
            radius: Number((Math.max(e.maxX - e.minX, e.maxY - e.minY) * 0.2).toFixed(1)),
          },
    );
    invalidate();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, select, textarea')) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      if (first) setFirst(null);
      else setDimensioning(false);
      setExportOpen(false);
    } else if (key === 'd') toggleDimension();
    else if (key === 'f') fit();
    else if (key === '+' || key === '=') zoomBy(1.25);
    else if (key === '-') zoomBy(0.8);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const save = (kind: 'pdf' | 'dxf') => {
    setExportOpen(false);
    if (!svg.current) return;
    try {
      if (kind === 'pdf')
        void exportDrawingPdf(svg.current, width, height, options.number).catch((e: unknown) =>
          setError(e instanceof Error ? e.message : String(e)),
        );
      else exportDrawingDxf(svg.current, height, options.number);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const top = views.find((v) => v.direction === 'top');
  const extra = detail.on && top ? [detailView(top, detail.x, detail.y, detail.radius)] : [];
  const projections = withDrawingSketches(
    projectedSource === projectionSource ? views : [],
    model,
    book.sheet.sketches,
  );
  const layout = layoutViews([...projections, ...extra], options);
  const percent = Math.round((camera.zoom / ACTUAL) * 100);

  return (
    <section
      aria-label="Drawings workspace"
      className="dwg"
      onKeyDown={onKeyDown}
      style={
        {
          '--dwg-inspector': `${inspectorWidth}px`,
          '--dwg-items': itemsOpen ? `calc(${itemsWidth}px + var(--edge))` : '0px',
          '--dwg-items-width': `${itemsWidth}px`,
        } as CSSProperties
      }
    >
      <div
        className="dwg__desk"
        data-dimensioning={dimensioning ? '' : undefined}
        onPointerDown={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          const selectedPlate = (event.target as Element).closest<HTMLElement>('[data-sheet-id]');
          if (selectedPlate?.dataset.sheetId && selectedPlate.dataset.sheetId !== book.sheet.id)
            book.select(selectedPlate.dataset.sheetId);
          const onPaper = (event.target as Element).closest('.drawing-paper');
          if (
            (event.target as Element).closest('[data-drawing-control]') ||
            event.button === 2 ||
            (dimensioning && onPaper && event.button === 0)
          )
            return;
          // A plain drag pans the desk; with Shift it draws a selection rectangle.
          if (event.shiftKey && event.button === 0) {
            const at = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - at.left;
            const y = event.clientY - at.top;
            setBand({ x0: x, y0: y, x1: x, y1: y });
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          drag.current = { x: event.clientX, y: event.clientY, cx: camera.x, cy: camera.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (band !== null) {
            const at = event.currentTarget.getBoundingClientRect();
            setBand({ ...band, x1: event.clientX - at.left, y1: event.clientY - at.top });
            return;
          }
          const d = drag.current;
          if (d)
            setCamera((c) => ({
              ...c,
              x: d.cx + event.clientX - d.x,
              y: d.cy + event.clientY - d.y,
            }));
        }}
        onPointerUp={() => {
          drag.current = null;
          if (band === null) return;
          const left = Math.min(band.x0, band.x1);
          const right = Math.max(band.x0, band.x1);
          const top = Math.min(band.y0, band.y1);
          const bottom = Math.max(band.y0, band.y1);
          const touched = deskLayout.plates.flatMap((plate, index) => {
            const x = camera.x + plate.x * camera.zoom;
            const y = camera.y + plate.y * camera.zoom;
            const hit =
              x < right &&
              x + plate.width * camera.zoom > left &&
              y < bottom &&
              y + plate.height * camera.zoom > top;
            const id = shown[index]?.id;
            return hit && id !== undefined ? [id] : [];
          });
          setBand(null);
          if (touched.length === 0) return;
          if (!touched.includes(book.sheet.id) && touched[0] !== undefined) book.select(touched[0]);
          book.setChosen(touched);
          if (!itemsOpen) onItemsToggle();
        }}
        onPointerCancel={() => {
          drag.current = null;
          setBand(null);
        }}
        ref={desk}
        tabIndex={-1}
      >
        <DrawingDeskDots camera={camera} desk={desk} />
        {band !== null && (
          <div
            aria-hidden="true"
            className="dwg__band"
            style={{
              left: Math.min(band.x0, band.x1),
              top: Math.min(band.y0, band.y1),
              width: Math.abs(band.x1 - band.x0),
              height: Math.abs(band.y1 - band.y0),
            }}
          />
        )}
        {deskLayout.plates.map((plate, index) => {
          const sheet = shown[index];
          if (!sheet) return null;
          const active = sheet.id === book.sheet.id;
          return (
            <section
              key={sheet.id}
              className="dwg__sheet"
              data-sheet-id={sheet.id}
              data-active={active ? '' : undefined}
              data-chosen={
                book.chosen.length > 1 && book.chosen.includes(sheet.id) ? '' : undefined
              }
              aria-label={sheet.name}
              style={{
                left: camera.x + plate.x * camera.zoom,
                top: camera.y + plate.y * camera.zoom,
                width: plate.width * camera.zoom,
                height: plate.height * camera.zoom,
              }}
            >
              <button
                className="dwg__sheet-name"
                type="button"
                onClick={() => book.select(sheet.id)}
                aria-pressed={active}
              >
                {sheet.name}
              </button>
              {active ? (
                <DrawingPaper
                  callouts={{ section, detail }}
                  dimensioning={dimensioning}
                  dimensionKind={dimensionKind}
                  sheetLabel={`${shown.findIndex((s) => s.id === book.sheet.id) + 1} / ${shown.length}`}
                  patch={patch}
                  dimensions={dimensions}
                  first={first}
                  frames={frames}
                  height={height}
                  layout={layout}
                  logo={logo}
                  options={options}
                  setDimensions={setDimensions}
                  setFirst={setFirst}
                  svg={svg}
                  width={width}
                  extra={
                    book.sheet.physics !== undefined && (
                      <PhysicsLayer content={book.sheet.physics} height={height} width={width} />
                    )
                  }
                />
              ) : (
                <div className="dwg__inactive-paper" inert>
                  <DrawingInactiveSheet
                    sheet={sheet}
                    session={session}
                    model={model}
                    revision={revision}
                    label={`${index + 1} / ${shown.length}`}
                    onLayout={rememberLayout}
                  />
                </div>
              )}
            </section>
          );
        })}
      </div>

      <DrawingItemsRail open={itemsOpen} onToggle={onItemsToggle} />
      {itemsOpen && (
        <DrawingItems
          book={book}
          sheets={shown}
          width={itemsWidth}
          onWidthChange={onItemsWidth}
          bodies={availableBodies}
          features={model?.document.features ?? []}
          includedBodies={included}
          onBodies={(keys) => {
            book.field('bodies', keys);
            invalidate();
          }}
          onSketches={(keys) => {
            book.field('sketches', keys);
            invalidate();
          }}
        />
      )}
      <DrawingToolbar
        kindToggle={kindToggle}
        physics={physicsMode}
        dimensioning={dimensioning}
        addSheet={() => {
          book.add();
          if (!itemsOpen) onItemsToggle();
        }}
        toggleDimension={toggleDimension}
        section={section}
        setSection={setSection}
        invalidate={invalidate}
        // A physics drawing has pictures instead of views, and exports the same way.
        hasViews={projections.length > 0 || physicsMode}
        detailOn={detail.on}
        toggleDetail={toggleDetail}
        zoomBy={zoomBy}
        percent={percent}
        fit={fit}
        loading={loading}
        canUpdate={session !== null}
        update={() => setRevision((r) => r + 1)}
        exportOpen={exportOpen}
        setExportOpen={setExportOpen}
        save={save}
      />

      <DrawingInspector
        overview={
          <DrawingOverview
            width={deskWidth}
            height={deskHeight}
            plates={deskLayout.plates}
            active={book.sheet.id}
            previews={{
              ...previews,
              [book.sheet.id]:
                book.sheet.physics === undefined
                  ? layout
                  : physicsPreview(book.sheet.physics, width, height),
            }}
            camera={camera}
            desk={desk}
            inspectorWidth={inspectorWidth}
            itemsOpen={itemsOpen}
            itemsWidth={itemsWidth}
            onPan={(x, y) => setCamera((c) => ({ ...c, x, y }))}
            onFit={fit}
          />
        }
        onWidthChange={setInspectorWidth}
        width={inspectorWidth}
        autoScale={autoScale}
        detail={detail}
        dimensionCount={dimensions.length}
        frames={frames}
        logo={logo}
        onAutoScale={setAutoScale}
        onClearDimensions={invalidate}
        onDetail={(d) => {
          setDetail(d);
          invalidate();
        }}
        onError={setError}
        onFrames={setFrames}
        onLogo={setLogo}
        onSection={(s) => {
          setSection(s);
          invalidate();
        }}
        onUndoDimension={() => setDimensions((d) => d.slice(0, -1))}
        {...(book.sheet.physics === undefined
          ? {}
          : {
              physics: book.sheet.physics,
              onPhysics: (patch: Partial<PhysicsContent>) =>
                book.field('physics', (old) => (old === undefined ? old : { ...old, ...patch })),
            })}
        options={options}
        patch={patch}
        section={section}
      />

      <p className="dwg__status">
        {options.format} · {scaleLabel(options.scale)} ·{' '}
        {options.projection === 'first' ? 'First' : 'Third'} angle · mm
      </p>

      {dimensioning && (
        <p className="dwg__hint" role="status">
          <select
            aria-label="Dimension type"
            value={dimensionKind}
            onChange={(e) => {
              const kind = e.target.value;
              if (kind === 'aligned' || kind === 'horizontal' || kind === 'vertical') {
                setDimensionKind(kind);
                setFirst(null);
              }
            }}
          >
            <option value="aligned">Aligned</option>
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
          {first
            ? 'Choose another endpoint in this view'
            : 'Click two endpoints · drag labels to place · double-click to edit'}{' '}
          · <kbd>Esc</kbd> to {first ? 'restart' : 'finish'}
        </p>
      )}

      {loading && (
        <p className="dwg__loading" role="status">
          Projecting views…
        </p>
      )}

      {!loading && !physicsMode && !projections.length && !error && (
        <div className="dwg__empty">
          <strong>No views on this sheet</strong>
          <span>
            {included.length === 0 && availableBodies.length > 0
              ? 'Choose bodies or sketches in Items for this sheet.'
              : 'Build a solid in Modeling. Its front, top, right and isometric views appear here.'}
          </span>
        </div>
      )}

      {(error || book.error) && (
        <div className="dwg__error" role="alert">
          <span>{error || book.error}</span>
          <button onClick={() => setError('')} type="button">
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
