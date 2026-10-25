import { type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '../session.js';
import {
  type DrawingBook,
  type DrawingSheet,
  isPhysics,
  newSheet,
  parseDrawingBook,
} from './drawing-sheets.js';
import type { PhysicsContent } from './physics-sheets.js';

export function useDrawingSheets(session: Session | null, title: string) {
  const [book, setBook] = useState<DrawingBook>(() => {
    const sheet = newSheet(title);
    return { version: 1, active: sheet.id, sheets: [sheet] };
  });
  const [ready, setReady] = useState(false);
  /** Sheets chosen together, in the list or by a rectangle on the desk (audit A13, D11). */
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [error, setError] = useState('');
  const current = useRef(book);
  current.current = book;
  const canSave = useRef(false);
  useEffect(() => {
    let active = true;
    canSave.current = false;
    void session
      ?.readDrawingState()
      .then((text) => {
        if (!active) return;
        if (text !== null) setBook(parseDrawingBook(text));
        canSave.current = true;
        setReady(true);
      })
      .catch((problem: unknown) => {
        if (active)
          setError(
            problem instanceof Error ? problem.message : 'The drawing sheets could not be opened.',
          );
      });
    if (session === null) setReady(true);
    return () => {
      active = false;
      if (canSave.current)
        void session?.saveDrawingState(JSON.stringify(current.current)).catch(console.error);
    };
  }, [session]);
  useEffect(() => {
    if (!ready || !canSave.current || session === null) return;
    const timer = setTimeout(() => {
      void session
        .saveDrawingState(JSON.stringify(book))
        .catch((problem: unknown) =>
          setError(problem instanceof Error ? problem.message : 'The sheets could not be saved.'),
        );
    }, 200);
    return () => clearTimeout(timer);
  }, [book, ready, session]);
  const sheet = book.sheets.find((s) => s.id === book.active) ?? book.sheets[0];
  if (sheet === undefined) throw new Error('A drawing needs at least one sheet.');
  const field = useCallback(
    <K extends keyof DrawingSheet>(key: K, value: SetStateAction<DrawingSheet[K]>) => {
      setBook((b) => ({
        ...b,
        sheets: b.sheets.map((s) =>
          s.id !== b.active
            ? s
            : {
                ...s,
                [key]:
                  typeof value === 'function'
                    ? (value as (old: DrawingSheet[K]) => DrawingSheet[K])(s[key])
                    : value,
              },
        ),
      }));
    },
    [],
  );
  return {
    chosen,
    setChosen,
    sheet,
    sheets: book.sheets,
    ready,
    error,
    field,
    select: (id: string) =>
      setBook((b) => (b.sheets.some((s) => s.id === id) ? { ...b, active: id } : b)),
    add: () =>
      setBook((b) => {
        const number =
          b.sheets.reduce((max, s) => {
            const match = /^Sheet (\d+)$/.exec(s.name);
            return Math.max(max, Number(match?.[1] ?? 0));
          }, 0) + 1;
        const previous = b.sheets.find((s) => s.id === b.active);
        const next = newSheet(title, number);
        if (previous) {
          next.options = { ...previous.options, number: next.options.number };
          next.logo = previous.logo;
        }
        next.bodies = [];
        return { ...b, active: next.id, sheets: [...b.sheets, next] };
      }),
    remove: (id: string) =>
      setBook((b) => {
        if (b.sheets.length === 1) return b;
        const sheets = b.sheets.filter((s) => s.id !== id);
        return { ...b, sheets, active: b.active === id ? (sheets[0]?.id ?? b.active) : b.active };
      }),
    /**
     * Adds a physics drawing from Simulation as a sheet like any other: size, title block, logo and
     * export from the previously open sheet, numbered and named after existing physics drawings.
     */
    addPhysics: (physics: PhysicsContent) =>
      setBook((b) => {
        const count = b.sheets.filter(isPhysics).length + 1;
        const previous = b.sheets.find((s) => s.id === b.active);
        const next = newSheet(title, b.sheets.length + 1);
        next.name = `Physics ${count}`;
        next.options.number = `PHY-${String(count).padStart(3, '0')}`;
        if (previous) next.logo = previous.logo;
        next.bodies = [];
        next.physics = physics;
        return { ...b, active: next.id, sheets: [...b.sheets, next] };
      }),
    /** Several sheets at once (audit A13); one is always kept, the first not in the list. */
    removeMany: (ids: readonly string[]) =>
      setBook((b) => {
        const kept = b.sheets.filter((s) => !ids.includes(s.id));
        const sheets = kept.length > 0 ? kept : b.sheets.slice(0, 1);
        return {
          ...b,
          sheets,
          active: sheets.some((s) => s.id === b.active) ? b.active : (sheets[0]?.id ?? b.active),
        };
      }),
    /** The same value on several sheets: what is included on them, for one. */
    fieldOn: <K extends keyof DrawingSheet>(
      ids: readonly string[],
      key: K,
      value: DrawingSheet[K],
    ) =>
      setBook((b) => ({
        ...b,
        sheets: b.sheets.map((s) => (ids.includes(s.id) ? { ...s, [key]: value } : s)),
      })),
  };
}
