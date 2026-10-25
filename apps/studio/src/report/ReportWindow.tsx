/**
 * Report a problem, from any screen (audit G3). A floating window that stays open while the user
 * works: report kind, description, an annotatable screenshot of the view, the app log, and a
 * prefilled GitHub issue. Built on the app's floating window and inspection panel classes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FloatingWindow } from '../FloatingWindow.js';
import { openExternal } from '../open-external.js';
import { REPOSITORY } from '../PreferencesContribute.js';
import { readActivity } from './activity-log.js';
import { paint, type Shape, type Tool } from './annotate.js';
import { collectDiagnostics, type ProjectFacts } from './diagnostics.js';
import { KindMark } from './KindMark.js';
import { readLog } from './log-buffer.js';
import type { Prefill } from './ReportHost.js';
import { KINDS, type Kind, reportBody, reportUrl } from './report-body.js';
import './report.css';

function system(): string {
  const agent = navigator.userAgent;
  if (/Mac/.test(agent)) return 'macOS';
  if (/Windows/.test(agent)) return 'Windows';
  if (/Linux/.test(agent)) return 'Linux';
  return 'Unknown';
}

const TOOLS: readonly { id: Tool; label: string }[] = [
  { id: 'pen', label: 'Pen' },
  { id: 'box', label: 'Box' },
  { id: 'arrow', label: 'Arrow' },
];

/** Typed input, kept across closing and reopening: closing does not discard. */
const draft = {
  kind: 'problem' as Kind,
  title: '',
  what: '',
  withLog: true,
  withPicture: true,
  withDiagnostics: true,
  withActivity: false,
};

export function ReportWindow({
  version,
  where,
  capture,
  facts,
  prefill,
  onClose,
}: {
  version: string;
  /** Where in the app the user is, in user-facing words: "Modeling", "Projects". */
  where: string;
  /** Screenshot of the view, when there is a 3D view to capture. */
  capture: (() => Promise<Blob | null>) | null;
  /** Counts about the open project, for diagnostics. */
  facts: () => ProjectFacts;
  /** From a crash: the report starts with what was caught. */
  prefill?: Prefill;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>(draft.kind);
  const [title, setTitle] = useState(prefill?.title ?? draft.title);
  const [what, setWhat] = useState(prefill?.what ?? draft.what);
  const [withDiagnostics, setWithDiagnostics] = useState(draft.withDiagnostics);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [withLog, setWithLog] = useState(draft.withLog);
  const [withActivity, setWithActivity] = useState(draft.withActivity);
  const [withPicture, setWithPicture] = useState(draft.withPicture);
  const [tool, setTool] = useState<Tool>('pen');
  const [picture, setPicture] = useState<Blob | null>(null);
  const [taking, setTaking] = useState(false);
  const [shapeCount, setShapeCount] = useState(0);
  const [note, setNote] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const bitmap = useRef<ImageBitmap | null>(null);
  const shapes = useRef<Shape[]>([]);
  const current = useRef<Shape | null>(null);

  draft.kind = kind;
  draft.title = title;
  draft.what = what;
  draft.withLog = withLog;
  draft.withPicture = withPicture;
  draft.withDiagnostics = withDiagnostics;
  draft.withActivity = withActivity;

  // Read once on open: the machine does not change meanwhile.
  useEffect(() => {
    let current = true;
    void collectDiagnostics(facts()).then((lines) => current && setDiagnostics(lines));
    return () => {
      current = false;
    };
  }, [facts]);

  const redraw = useCallback(() => {
    const el = canvas.current;
    if (el === null) return;
    paint(
      el,
      bitmap.current,
      current.current === null ? shapes.current : [...shapes.current, current.current],
    );
  }, []);

  /** Retakes the screenshot of the current view and clears the drawing. */
  const latest = useRef(0);
  const take = useCallback(async () => {
    if (capture === null) return;
    // Only the latest request is used: an earlier one returning late (React runs effects twice in
    // development) must not wipe the drawing on the newer one.
    const mine = ++latest.current;
    setTaking(true);
    try {
      const blob = await capture();
      if (blob === null || mine !== latest.current) return;
      const next = await createImageBitmap(blob);
      if (mine !== latest.current) return;
      bitmap.current = next;
      shapes.current = [];
      current.current = null;
      setShapeCount(0);
      setPicture(blob);
    } finally {
      if (mine === latest.current) setTaking(false);
    }
  }, [capture]);

  // Taken once on open, before anything covers the view.
  useEffect(() => {
    void take();
  }, [take]);

  // The canvas appears with the picture, sized to it, and is drawn once it exists.
  useEffect(() => {
    const el = canvas.current;
    const base = bitmap.current;
    if (picture === null || el === null || base === null) return;
    el.width = base.width;
    el.height = base.height;
    redraw();
  }, [picture, redraw]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const el = event.currentTarget;
    const box = el.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * el.width,
      y: ((event.clientY - box.top) / box.height) * el.height,
    };
  };

  const compose = () => ({
    repository: REPOSITORY,
    kind,
    title,
    what,
    version,
    system: system(),
    where,
    log: withLog ? readLog() : '',
    diagnostics: withDiagnostics ? diagnostics : [],
    activity: withActivity ? readActivity(40) : [],
    picture: picture !== null && withPicture,
  });

  const logLines = withLog ? readLog().split('\n').filter(Boolean).length : 0;
  const preview = reportBody(compose(), 6);

  const send = async () => {
    // The picture goes to the clipboard for pasting into the issue; a URL cannot carry it.
    if (picture !== null && withPicture && canvas.current && 'clipboard' in navigator) {
      try {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.current?.toBlob(resolve, 'image/png'),
        );
        if (blob !== null)
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      } catch {
        setNote('The picture could not be copied; the report goes without it.');
      }
    }
    openExternal(reportUrl(compose()));
    // Sent: clear the typed input.
    draft.title = '';
    draft.what = '';
    onClose();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${reportBody(compose())}`);
      setNote('Copied. Paste it wherever you like.');
    } catch {
      setNote('Could not copy.');
    }
  };

  return (
    <FloatingWindow label="Report a problem" onClose={onClose} title="Report a problem">
      <form
        className="report image-panel"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            void send();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div aria-label="What it is" className="image-panel__mode report__kinds" role="radiogroup">
          {KINDS.map((entry) => (
            <label className="image-panel__choice" data-kind={entry.id} key={entry.id}>
              <input
                checked={kind === entry.id}
                name="report-kind"
                onChange={() => setKind(entry.id)}
                type="radio"
              />
              <KindMark kind={entry.id} />
              <span>{entry.label}</span>
            </label>
          ))}
        </div>

        <label className="image-field">
          <span className="image-field__label">In a few words</span>
          <span className="image-field__box">
            <input
              className="image-field__input"
              onChange={(event) => setTitle(event.target.value)}
              placeholder={
                kind === 'idea'
                  ? 'A way to move a face along a line'
                  : 'The extrude field stays empty'
              }
              type="text"
              value={title}
            />
          </span>
        </label>
        <label className="image-field">
          <span className="image-field__label">
            {kind === 'idea'
              ? 'What would it do, and what for'
              : 'What you did, what happened, and what you expected'}
          </span>
          <span className="image-field__box">
            <textarea
              className="image-field__input report__what"
              onChange={(event) => setWhat(event.target.value)}
              rows={3}
              value={what}
            />
          </span>
        </label>

        {capture !== null && (
          <section aria-label="Picture" className="report__picture">
            <div className="report__picturebar">
              <label className="image-panel__keep">
                <input
                  checked={withPicture}
                  onChange={(event) => setWithPicture(event.target.checked)}
                  type="checkbox"
                />
                <span>Add a picture of the view</span>
              </label>
              <button
                className="image-panel__action"
                disabled={taking}
                onClick={() => void take()}
                title="The window stays open: change the view, then take the picture again"
                type="button"
              >
                {taking ? 'Taking…' : 'Take it again'}
              </button>
            </div>
            {withPicture && (
              <>
                <canvas
                  aria-label="Picture of the view, to draw on"
                  data-empty={picture === null ? '' : undefined}
                  onPointerCancel={() => {
                    current.current = null;
                    redraw();
                  }}
                  onPointerDown={(event) => {
                    // Nothing to draw on until the picture is there.
                    if (picture === null) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    current.current = { tool, points: [point(event)] };
                    redraw();
                  }}
                  onPointerMove={(event) => {
                    const shape = current.current;
                    if (shape === null) return;
                    // Boxes and arrows span from the drag start to the current point.
                    if (shape.tool === 'pen') shape.points.push(point(event));
                    else shape.points = [shape.points[0] ?? point(event), point(event)];
                    redraw();
                  }}
                  onPointerUp={() => {
                    if (current.current !== null) shapes.current.push(current.current);
                    current.current = null;
                    setShapeCount(shapes.current.length);
                    redraw();
                  }}
                  ref={canvas}
                />
                <div className="report__tools">
                  <div aria-label="Drawing tool" className="image-panel__mode" role="radiogroup">
                    {TOOLS.map((entry) => (
                      <label className="image-panel__choice" key={entry.id}>
                        <input
                          checked={tool === entry.id}
                          name="report-tool"
                          onChange={() => setTool(entry.id)}
                          type="radio"
                        />
                        <span>{entry.label}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    className="image-panel__action"
                    disabled={shapeCount === 0}
                    onClick={() => {
                      shapes.current.pop();
                      setShapeCount(shapes.current.length);
                      redraw();
                    }}
                    type="button"
                  >
                    Undo
                  </button>
                  <button
                    className="image-panel__action"
                    disabled={shapeCount === 0}
                    onClick={() => {
                      shapes.current = [];
                      setShapeCount(0);
                      redraw();
                    }}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        <div className="report__include">
          <label className="inspection-toggle">
            <span>
              Add what the app logged
              <small className="report__count">
                {withLog
                  ? logLines === 0
                    ? 'Nothing was logged'
                    : `${String(logLines)} lines of errors and warnings, no project data`
                  : 'Left out'}
              </small>
            </span>
            <input
              aria-checked={withLog}
              checked={withLog}
              onChange={(event) => setWithLog(event.target.checked)}
              role="switch"
              type="checkbox"
            />
          </label>

          <label className="inspection-toggle">
            <span>
              Add details of this machine
              <small className="report__count">
                {withDiagnostics
                  ? 'The system, graphics card, memory and how big the project is. Nothing about you.'
                  : 'Left out'}
              </small>
            </span>
            <input
              aria-checked={withDiagnostics}
              checked={withDiagnostics}
              onChange={(event) => setWithDiagnostics(event.target.checked)}
              role="switch"
              type="checkbox"
            />
          </label>

          <label className="inspection-toggle">
            <span>
              Add what I did in this project
              <small className="report__count">
                {withActivity
                  ? `The last ${String(readActivity(40).length)} steps: which controls were clicked, which edits, which workspaces, memory. Never what you typed.`
                  : 'Off. Only if you turn it on, and you see it below before anything is sent.'}
              </small>
            </span>
            <input
              aria-checked={withActivity}
              checked={withActivity}
              onChange={(event) => setWithActivity(event.target.checked)}
              role="switch"
              type="checkbox"
            />
          </label>
        </div>

        <details className="report__preview">
          <summary>What is sent</summary>
          <pre>{`${title.trim() === '' ? 'Report from the app' : title.trim()}\n\n${preview}`}</pre>
        </details>

        {note !== '' && (
          <p className="image-panel__hint" role="status">
            {note}
          </p>
        )}

        <div className="image-panel__actions report__actions">
          <button className="image-panel__action report__send" type="submit">
            Open issue on GitHub
          </button>
          <div className="report__secondary">
            <button className="image-panel__action" onClick={() => void copy()} type="button">
              Copy report
            </button>
            <button
              className="image-panel__action"
              onClick={() => {
                void navigator.clipboard
                  .writeText(readActivity().join('\n'))
                  .then(() => setNote('The whole process log is copied.'))
                  .catch(() => setNote('Could not copy.'));
              }}
              title="Everything done in this session, to read or keep; nothing is sent"
              type="button"
            >
              Copy process log
            </button>
          </div>
        </div>
      </form>
    </FloatingWindow>
  );
}
