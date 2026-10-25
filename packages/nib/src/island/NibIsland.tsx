/**
 * Renders the Nib island: a dark shape hanging from the top edge that grows into a compact line or
 * an open card. State comes from `machine.ts`; card text and actions come from the app.
 */

import './island.css';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type HeadState, NibHead } from '../NibHead.js';
import type { NibLook } from '../stage.js';
import { FACES, glancing } from './face.js';
import type { IslandView } from './machine.js';
import { NibFace } from './NibFace.js';
import { NibSummon } from './NibSummon.js';

export interface IslandAction {
  label: string;
  run: () => void;
  /** Drawn filled. At most one per card. */
  primary?: boolean;
}

/** Card content supplied by the app. */
export interface IslandCard {
  /** Heading line, e.g. "Lesson · Step 2 of 5". */
  kicker?: string;
  title?: string;
  text: string;
  /** Small print under the text, e.g. the browser's error message. */
  detail?: string;
  /** Rows of work under way; progress null when unknown. */
  rows?: readonly { label: string; progress: number | null; detail?: string }[];
  /** Lesson steps, drawn as segments under the kicker. */
  steps?: { step: number; steps: number };
  actions: readonly IslandAction[];
  /** Tooltip of the × button ("End the lesson"). Absent: no × button. */
  close?: string;
  /** Blocking question: cannot be folded away; only its buttons close it. */
  modal?: boolean;
}

export interface NibIslandProps {
  view: IslandView;
  card: IslandCard | null;
  /** Text of the compact line. */
  line: string | null;
  /** Formatted progress ("42,17%"); absent when unknown. */
  percent?: string;
  /** Accessible label of the line button, describing what a press does. */
  label: string;
  onPress: () => void;
  /** Escape or outside press: fold into the line. */
  onCollapse: () => void;
  /** The × button. */
  onClose: () => void;
  /** An outside press leaves the card open (lesson steps are read while working in the app). */
  keepOpen: boolean;
  /** Reduced motion: no blinking, no glances, no spring transitions. */
  still: boolean;
  /** Enables occasional glances. Off at the quiet level, since movement draws the eye. */
  lively: boolean;
  /** Model URL for the live head. */
  model: string;
  /** Nib's colours. */
  look?: NibLook;
  /** Element Nib looks at instead of the pointer (e.g. a button in a lesson). */
  lookAt?: () => Element | null;
  /** When hidden: pressing the tab at the top of the window opens the menu. */
  onSummon?: () => void;
}

/** Line height, minimum line width and card width. Must match `island.css`. */
const LINE_HEIGHT = 30;
const LINE_LEAST = 120;
const CARD_WIDTH = 372;
/** How long content stays after the shape starts closing, so it fades out. */
const LINGER = 260;

export function NibIsland({
  view,
  card,
  line,
  percent,
  label,
  onPress,
  onCollapse,
  onClose,
  keepOpen,
  still,
  lively,
  model,
  look,
  lookAt,
  onSummon,
}: NibIslandProps) {
  const shell = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 40, height: 0 });
  const open = view.shape === 'card';
  const shown = view.shape !== 'hidden';
  const blink = useBlink(still || !shown, view.mood === 'sleepy');
  const glance = useGlance(!lively || still || view.shape !== 'compact' || view.mood !== 'rest');
  const said = useLingering(open ? card : null, still ? 0 : LINGER);
  const saidLine = useLingering(view.shape === 'compact' ? line : null, still ? 0 : LINGER);
  const [head, setHead] = useState<HeadState>('loading');
  // The live head (WebGL context plus model) is created the first time the island shows, not at
  // startup, since most sessions never show it. The compact line uses it too.
  const [headWanted, setHeadWanted] = useState(false);
  useEffect(() => {
    if (shown) setHeadWanted(true);
  }, [shown]);
  const [lineHead, setLineHead] = useState<HeadState>('loading');

  // Size the shell to its content, measured at the final size, so text is laid out once and the
  // shell only reveals it.
  useLayoutEffect(() => {
    const node = body.current;
    if (!shown || node === null) {
      setSize({ width: 40, height: 0 });
      return;
    }
    const measure = () =>
      setSize((before) => {
        const width = open ? CARD_WIDTH : Math.max(LINE_LEAST, Math.ceil(node.offsetWidth));
        const height = open ? Math.ceil(node.offsetHeight) : LINE_HEIGHT;
        return before.width === width && before.height === height ? before : { width, height };
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, open]);

  // Escape folds the card into the line. An outside press does too, except during a lesson step,
  // where the user is expected to click around the app. Folding answers nothing.
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCollapse();
    };
    const outside = (event: PointerEvent) => {
      if (!keepOpen && !shell.current?.contains(event.target as Node)) onCollapse();
    };
    // Capture phase: the editor handles Escape itself (leave tool, clear selection) and stops
    // propagation; an open card must get it first, like a menu.
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', outside, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', outside, true);
    };
  }, [open, keepOpen, onCollapse]);

  // Focus the menu's first button for keyboard use; for a question, focus the primary answer.
  const menu = view.content?.kind === 'menu';
  const asking = view.content?.kind === 'question' ? view.content.question.key : null;
  useEffect(() => {
    if (!menu && asking === null) return;
    const actions = shell.current?.querySelectorAll<HTMLButtonElement>('.nib-island__action');
    const primary = shell.current?.querySelector<HTMLButtonElement>(
      '.nib-island__action[data-primary]',
    );
    (asking !== null ? (primary ?? actions?.[0]) : actions?.[0])?.focus();
  }, [menu, asking]);

  let face = FACES[view.mood];
  if (glance !== null) face = glancing(face, glance.x, glance.y);
  if (blink) face = { ...face, top: 1, bottom: 0 };

  return (
    <div
      className="nib-island"
      data-kind={view.content?.kind ?? view.line?.kind ?? 'none'}
      data-mood={view.mood}
      data-shape={view.shape}
      data-still={still ? '' : undefined}
    >
      {!shown && onSummon !== undefined && (
        <NibSummon
          label="Nib: lessons and help"
          model={model}
          onSummon={onSummon}
          still={still}
          {...(look === undefined ? {} : { look })}
        />
      )}
      <div
        className="nib-island__shell"
        ref={shell}
        style={{ width: size.width, height: size.height }}
      >
        <div className="nib-island__clip">
          <div className="nib-island__body" ref={body}>
            {open && said !== null ? (
              <Card
                card={said}
                face={
                  <div className="nib-island__head" data-head={head}>
                    <NibFace face={face} />
                    {headWanted && (
                      <NibHead
                        active={open}
                        mood={view.mood}
                        model={model}
                        onState={setHead}
                        still={still}
                        {...(look === undefined ? {} : { look })}
                        {...(lookAt === undefined ? {} : { lookAt })}
                      />
                    )}
                  </div>
                }
                onClose={onClose}
                onFold={onCollapse}
              />
            ) : (
              <button
                aria-label={label}
                className="nib-island__line"
                onClick={onPress}
                tabIndex={shown ? 0 : -1}
                type="button"
              >
                <span className="nib-island__eyes" data-head={lineHead}>
                  <NibFace face={face} />
                  {headWanted && (
                    <NibHead
                      active={view.shape === 'compact'}
                      mood={view.mood}
                      model={model}
                      onState={setLineHead}
                      still={still}
                      {...(look === undefined ? {} : { look })}
                    />
                  )}
                </span>
                <span className="nib-island__lineText">{saidLine ?? ''}</span>
                {/* Task progress: segmented bar and percentage, within the line height. */}
                {view.line?.kind === 'task' && view.progress !== undefined && (
                  <>
                    <span aria-hidden="true" className="nib-island__meter">
                      <span
                        className="nib-island__fill"
                        data-unknown={view.progress === null ? '' : undefined}
                        style={
                          view.progress === null
                            ? undefined
                            : { width: `${String(Math.min(1, Math.max(0, view.progress)) * 100)}%` }
                        }
                      />
                    </span>
                    {percent !== undefined && view.progress !== null && (
                      <span className="nib-island__percent">{percent}</span>
                    )}
                  </>
                )}
                {view.mood === 'strained' && (
                  <span aria-hidden="true" className="nib-island__sweat" />
                )}
              </button>
            )}
          </div>
          {view.shape === 'compact' &&
            view.line?.kind === 'lesson' &&
            view.progress !== undefined && (
              <span
                aria-hidden="true"
                className="nib-island__progress"
                data-unknown={view.progress === null ? '' : undefined}
                style={{ transform: `scaleX(${view.progress ?? 0.3})` }}
              />
            )}
        </div>
      </div>
    </div>
  );
}

function Card({
  card,
  face,
  onClose,
  onFold,
}: {
  card: IslandCard;
  face: React.ReactNode;
  onClose: () => void;
  onFold: () => void;
}) {
  return (
    <div
      className="nib-island__card"
      {...{
        'aria-label': card.kicker ?? 'Nib',
        ...(card.modal === true ? { role: 'alertdialog', 'aria-modal': true } : { role: 'dialog' }),
      }}
    >
      <div className="nib-island__top">
        <span className="nib-island__kicker">{card.kicker ?? 'Nib'}</span>
        {card.modal !== true && (
          <button
            aria-label="Fold away"
            className="nib-island__icon"
            onClick={onFold}
            title="Fold away (Esc). It stays up here, a click away."
            type="button"
          >
            <svg aria-hidden="true" height="10" viewBox="0 0 10 10" width="10">
              <path
                d="M2 6.5 5 3.5 8 6.5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.4"
              />
            </svg>
          </button>
        )}
        {card.close !== undefined && (
          <button
            aria-label={card.close}
            className="nib-island__icon"
            onClick={onClose}
            title={card.close}
            type="button"
          >
            <svg aria-hidden="true" height="10" viewBox="0 0 10 10" width="10">
              <path
                d="M2 2 8 8M8 2 2 8"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.4"
              />
            </svg>
          </button>
        )}
      </div>
      {card.steps !== undefined && (
        <div
          aria-label={`Step ${String(card.steps.step + 1)} of ${String(card.steps.steps)}`}
          className="nib-island__steps"
          role="img"
        >
          {Array.from({ length: card.steps.steps }, (_, index) => (
            <span
              data-state={
                index < (card.steps?.step ?? 0)
                  ? 'done'
                  : index === card.steps?.step
                    ? 'now'
                    : undefined
              }
              key={String(index)}
            />
          ))}
        </div>
      )}
      <div className="nib-island__main">
        {face}
        <div aria-live="polite" className="nib-island__words" role="status">
          {card.title !== undefined && <strong>{card.title}</strong>}
          <span>{card.text}</span>
          {card.detail !== undefined && <small>{card.detail}</small>}
          {card.rows !== undefined && (
            <ul className="nib-island__rows">
              {card.rows.map((row) => (
                <li key={row.label}>
                  <span>{row.label}</span>
                  {row.detail !== undefined && row.detail !== '' && (
                    <small className="nib-island__rowDetail">{row.detail}</small>
                  )}
                  <span
                    className="nib-island__bar"
                    data-unknown={row.progress === null ? '' : undefined}
                  >
                    <span style={{ transform: `scaleX(${row.progress ?? 0.3})` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {card.actions.length > 0 && (
        <div className="nib-island__actions">
          {/* Primary action last (rightmost), as in dialogs. */}
          {[...card.actions]
            .sort((a, b) => Number(a.primary === true) - Number(b.primary === true))
            .map((action) => (
              <button
                className="nib-island__action"
                data-primary={action.primary ? '' : undefined}
                key={action.label}
                onClick={action.run}
                type="button"
              >
                {action.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** Blinks every few seconds, slower when sleepy. */
function useBlink(off: boolean, sleepy: boolean): boolean {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (off) return;
    let timer = 0;
    const wait = () => {
      const gap = (sleepy ? 6 : 2.6) + Math.random() * (sleepy ? 6 : 4.5);
      timer = window.setTimeout(() => {
        setClosed(true);
        timer = window.setTimeout(
          () => {
            setClosed(false);
            wait();
          },
          sleepy ? 320 : 130,
        );
      }, gap * 1000);
    };
    wait();
    return () => {
      window.clearTimeout(timer);
      setClosed(false);
    };
  }, [off, sleepy]);
  return closed;
}

/** Occasional brief glance elsewhere while at rest. */
function useGlance(off: boolean): { x: number; y: number } | null {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (off) return;
    let timer = 0;
    const wait = () => {
      timer = window.setTimeout(
        () => {
          setAt({ x: Math.random() * 1.6 - 0.8, y: Math.random() * 0.9 - 0.3 });
          timer = window.setTimeout(
            () => {
              setAt(null);
              wait();
            },
            1100 + Math.random() * 900,
          );
        },
        (7 + Math.random() * 9) * 1000,
      );
    };
    wait();
    return () => {
      window.clearTimeout(timer);
      setAt(null);
    };
  }, [off]);
  return at;
}

/** Keeps the last non-null value for `ms` after it becomes null, so content can fade out. */
function useLingering<T>(value: T | null, ms: number): T | null {
  const [kept, setKept] = useState(value);
  useEffect(() => {
    if (value !== null || ms === 0) {
      setKept(value);
      return;
    }
    const timer = window.setTimeout(() => setKept(null), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return value ?? kept;
}
