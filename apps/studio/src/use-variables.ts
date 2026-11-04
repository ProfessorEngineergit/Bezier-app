/**
 * Variables and expressions: defining names, writing parameters in terms of them and validating
 * expressions. Stored in the document (`expressions.ts` in `@bezier/core`); both operations are
 * journalled and undo like any edit.
 */

import {
  type CadDocument,
  type Evaluated,
  evaluate,
  evaluateVariables,
  type FeatureId,
  lookupIn,
  type Variant,
} from '@bezier/core';
import { useCallback, useMemo } from 'react';
import type { Session, SessionView } from './session.js';

type Run = (change: (session: Session) => Promise<SessionView>) => Promise<void> | void;

export interface Variables {
  /** Each variable with its current value. */
  values: ReadonlyMap<string, Evaluated>;
  /** Evaluates an expression against the current variables. */
  check: (text: string) => Evaluated;
  /** Defines, changes or (with an empty expression) removes a variable. */
  setVariable: (name: string, expression: string) => void;
  /** Renames a variable and every expression using it, as one undo step. */
  renameVariable: (from: string, to: string) => void;
  /** Sets a parameter to an expression, or (empty) back to a plain number. */
  setExpression: (id: FeatureId, param: string, expression: string) => void;
  /** Keeps the variables as they are now under a name. */
  saveVariant: (name: string) => void;
  /** Gives the variables a variant's values, as one undo step. */
  applyVariant: (variant: Variant) => void;
  removeVariant: (name: string) => void;
}

export function useVariables(document: CadDocument | null, run: Run): Variables {
  const list = document?.meta.variables;
  const values = useMemo(() => evaluateVariables(list ?? []), [list]);
  const check = useCallback((text: string) => evaluate(text, lookupIn(values)), [values]);

  const setVariable = useCallback(
    (name: string, expression: string) => {
      void run((session) => session.apply({ op: 'setVariable', name, expression }));
    },
    [run],
  );

  const renameVariable = useCallback(
    (from: string, to: string) => {
      void run((session) => {
        const doc = session.document;
        const index = (doc.meta.variables ?? []).findIndex((variable) => variable.name === from);
        const variable = doc.meta.variables?.[index];
        if (variable === undefined || from === to) return session.rebuild();
        // Names are letters, digits and _ (`variableNameProblem`), so they need no escaping.
        const word = new RegExp(`\\b${from}\\b`, 'g');
        const uses = new RegExp(`\\b${from}\\b`);
        return session.apply([
          { op: 'setVariable', name: from, expression: '' },
          { op: 'setVariable', name: to, expression: variable.expression, index },
          ...(doc.meta.variables ?? [])
            .filter((other) => other.name !== from && uses.test(other.expression))
            .map((other) => ({
              op: 'setVariable' as const,
              name: other.name,
              expression: other.expression.replace(word, to),
            })),
          ...doc.features.flatMap((feature) =>
            Object.entries(feature.expressions ?? {})
              .filter(([, text]) => uses.test(text))
              .map(([param, text]) => ({
                op: 'setExpression' as const,
                id: feature.id,
                param,
                expression: text.replace(word, to),
              })),
          ),
        ]);
      });
    },
    [run],
  );

  const setExpression = useCallback(
    (id: FeatureId, param: string, expression: string) => {
      void run((session) => session.apply({ op: 'setExpression', id, param, expression }));
    },
    [run],
  );

  const saveVariant = useCallback(
    (name: string) => {
      void run((session) => {
        const current = session.document.meta.variables ?? [];
        const kept = Object.fromEntries(current.map((entry) => [entry.name, entry.expression]));
        return session.apply({ op: 'setVariant', name, values: kept });
      });
    },
    [run],
  );

  const applyVariant = useCallback(
    (variant: Variant) => {
      void run((session) => {
        const names = new Set((session.document.meta.variables ?? []).map((entry) => entry.name));
        return session.apply(
          Object.entries(variant.values)
            .filter(([name]) => names.has(name))
            .map(([name, expression]) => ({ op: 'setVariable' as const, name, expression })),
        );
      });
    },
    [run],
  );

  const removeVariant = useCallback(
    (name: string) => {
      void run((session) => session.apply({ op: 'setVariant', name, values: null }));
    },
    [run],
  );

  return {
    values,
    check,
    setVariable,
    renameVariable,
    setExpression,
    saveVariant,
    applyVariant,
    removeVariant,
  };
}
