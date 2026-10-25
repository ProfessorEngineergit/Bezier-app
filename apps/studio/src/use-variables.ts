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

  return { values, check, setVariable, renameVariable, setExpression };
}
