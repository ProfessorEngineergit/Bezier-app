/**
 * The document's variables: name, expression and value. Opened with Shift+Cmd+V or from Items.
 * Values are in millimetres or degrees unless a unit is given ("2 cm", "0.5 rad"). A parameter uses
 * a variable through its expression, e.g. `wall * 2`.
 */

import { type DocumentMeta, type Variant, variableNameProblem } from '@bezier/core';
import { CrossIcon } from '@bezier/ui';
import { useState } from 'react';
import type { Variables } from './use-variables.js';
import './variables-panel.css';

function shown(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** Whether the variables stand at exactly this variant's values. */
const current = (variant: Variant, list: readonly { name: string; expression: string }[]) =>
  Object.entries(variant.values).every(
    ([name, expression]) => list.find((entry) => entry.name === name)?.expression === expression,
  );

export function VariablesPanel({
  meta,
  variables,
  onClose,
}: {
  meta: DocumentMeta | undefined;
  variables: Variables;
  onClose: () => void;
}) {
  const list = meta?.variables ?? [];
  const variants = meta?.variants ?? [];
  const [variantName, setVariantName] = useState('');
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const add = () => {
    const trimmed = name.trim();
    const nameProblem =
      variableNameProblem(trimmed) ??
      (list.some((entry) => entry.name === trimmed) ? `There is already a ${trimmed}.` : null);
    if (nameProblem !== null) {
      setProblem(nameProblem);
      return;
    }
    const value = variables.check(expression);
    if (!value.ok) {
      setProblem(value.message);
      return;
    }
    variables.setVariable(trimmed, expression.trim());
    setName('');
    setExpression('');
    setProblem(null);
  };

  return (
    <aside aria-label="Variables" className="variables-panel">
      <header className="variables-panel__head">
        <h2>Variables</h2>
        <button aria-label="Close variables" onClick={onClose} type="button">
          <CrossIcon />
        </button>
      </header>
      {list.length === 0 && (
        <p className="variables-panel__empty">
          Name a number here, then type its name into any length or angle field.
        </p>
      )}
      <ul className="variables-panel__list">
        {list.map((entry) => {
          const value = variables.values.get(entry.name);
          return (
            <li key={entry.name}>
              <input
                aria-label={`Name of ${entry.name}`}
                defaultValue={entry.name}
                onBlur={(event) => {
                  const next = event.currentTarget.value.trim();
                  if (next === entry.name) return;
                  if (variableNameProblem(next) !== null || list.some((e) => e.name === next)) {
                    event.currentTarget.value = entry.name;
                    return;
                  }
                  variables.renameVariable(entry.name, next);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <span aria-hidden="true">=</span>
              <input
                aria-label={`Value of ${entry.name}`}
                defaultValue={entry.expression}
                key={entry.expression}
                onBlur={(event) => {
                  const next = event.currentTarget.value.trim();
                  if (next !== '' && next !== entry.expression) {
                    variables.setVariable(entry.name, next);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <output className={value?.ok === false ? 'variables-panel__error' : undefined}>
                {value === undefined ? '' : value.ok ? shown(value.value) : value.message}
              </output>
              <button
                aria-label={`Remove ${entry.name}`}
                onClick={() => variables.setVariable(entry.name, '')}
                type="button"
              >
                <CrossIcon />
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="variables-panel__add"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          aria-label="New variable name"
          onChange={(event) => setName(event.target.value)}
          placeholder="name"
          value={name}
        />
        <span aria-hidden="true">=</span>
        <input
          aria-label="New variable value"
          onChange={(event) => setExpression(event.target.value)}
          placeholder="10 mm"
          value={expression}
        />
        <button type="submit">Add</button>
      </form>
      {problem !== null && <p className="variables-panel__error">{problem}</p>}
      {list.length > 0 && (
        <section aria-label="Variants" className="variables-panel__variants">
          <h3>Variants</h3>
          {variants.length > 0 && (
            <ul>
              {variants.map((variant) => (
                <li aria-current={current(variant, list)} key={variant.name}>
                  <button onClick={() => variables.applyVariant(variant)} type="button">
                    {variant.name}
                  </button>
                  <button
                    aria-label={`Remove ${variant.name}`}
                    onClick={() => variables.removeVariant(variant.name)}
                    type="button"
                  >
                    <CrossIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const name = variantName.trim();
              if (name === '') return;
              variables.saveVariant(name);
              setVariantName('');
            }}
          >
            <input
              aria-label="New variant name"
              onChange={(event) => setVariantName(event.target.value)}
              placeholder="Small, medium, large"
              value={variantName}
            />
            <button type="submit">Keep these</button>
          </form>
        </section>
      )}
    </aside>
  );
}
