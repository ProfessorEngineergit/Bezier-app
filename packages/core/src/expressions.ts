/**
 * Variables and parameter expressions (`width * 2`, `hole + 0.2 mm`, `sin(30) * 40`). The rebuild
 * evaluates them to plain numbers, so features never see expressions and cache keys use values.
 *
 * Base units are millimetres and degrees; `cm`, `m`, `in`, `ft` and `rad` convert. Trigonometry
 * uses degrees.
 */

export interface Variable {
  name: string;
  expression: string;
}

export type Evaluated = { ok: true; value: number } | { ok: false; message: string };

const UNITS: Readonly<Record<string, number>> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
  deg: 1,
  '°': 1,
  rad: 180 / Math.PI,
};

const RAD = Math.PI / 180;
const FUNCTIONS: Readonly<Record<string, (...args: number[]) => number>> = {
  sin: (x = Number.NaN) => Math.sin(x * RAD),
  cos: (x = Number.NaN) => Math.cos(x * RAD),
  tan: (x = Number.NaN) => Math.tan(x * RAD),
  asin: (x = Number.NaN) => Math.asin(x) / RAD,
  acos: (x = Number.NaN) => Math.acos(x) / RAD,
  atan: (x = Number.NaN) => Math.atan(x) / RAD,
  sqrt: (x = Number.NaN) => Math.sqrt(x),
  abs: (x = Number.NaN) => Math.abs(x),
  round: (x = Number.NaN) => Math.round(x),
  floor: (x = Number.NaN) => Math.floor(x),
  ceil: (x = Number.NaN) => Math.ceil(x),
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
};

const CONSTANTS: Readonly<Record<string, number>> = { pi: Math.PI };

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Why a name cannot be a variable, or null when it can. */
export function variableNameProblem(name: string): string | null {
  if (!NAME.test(name)) return 'A name starts with a letter and uses only letters, digits and _.';
  if (name in UNITS || name in FUNCTIONS || name in CONSTANTS) {
    return `"${name}" is already a unit or a function.`;
  }
  return null;
}

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string };

/**
 * Tokenises an expression. A comma is a decimal point ("12,5") except directly inside function
 * brackets, where it separates arguments ("max(a, 3)"). If semicolons separate arguments
 * ("max(1,5; 2)"), commas are decimal everywhere.
 */
function tokenize(text: string): Token[] | string {
  const tokens: Token[] = [];
  const brackets: ('call' | 'group')[] = [];
  const semicolons = text.includes(';');
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    const inCall = !semicolons && brackets[brackets.length - 1] === 'call';
    const number = (
      inCall ? /^(\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i : /^(\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?/i
    ).exec(text.slice(i));
    if (number !== null) {
      tokens.push({ kind: 'number', value: Number(number[0].replace(',', '.')) });
      i += number[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
    if (name !== null) {
      tokens.push({ kind: 'name', value: name[0] });
      i += name[0].length;
      continue;
    }
    if (c === '°') {
      tokens.push({ kind: 'name', value: '°' });
      i += 1;
      continue;
    }
    if (c === '(') {
      const before = tokens[tokens.length - 1];
      brackets.push(before?.kind === 'name' && before.value in FUNCTIONS ? 'call' : 'group');
    }
    if (c === ')') brackets.pop();
    if ('+-*/^(),;'.includes(c)) {
      tokens.push({ kind: 'op', value: c === ';' ? ',' : c });
      i += 1;
      continue;
    }
    if (c === '×') {
      tokens.push({ kind: 'op', value: '*' });
      i += 1;
      continue;
    }
    return `"${c}" is not something an expression can contain.`;
  }
  return tokens;
}

class Parser {
  #at = 0;
  readonly #tokens: Token[];
  readonly #lookup: (name: string) => Evaluated;

  constructor(tokens: Token[], lookup: (name: string) => Evaluated) {
    this.#tokens = tokens;
    this.#lookup = lookup;
  }

  parse(): number {
    const value = this.#sum();
    const left = this.#tokens[this.#at];
    if (left !== undefined) throw new Error(`Unexpected "${left.value}".`);
    return value;
  }

  #peek(value: string): boolean {
    const token = this.#tokens[this.#at];
    return token?.kind === 'op' && token.value === value;
  }

  #sum(): number {
    let value = this.#product();
    while (this.#peek('+') || this.#peek('-')) {
      const plus = this.#peek('+');
      this.#at += 1;
      const right = this.#product();
      value = plus ? value + right : value - right;
    }
    return value;
  }

  #product(): number {
    let value = this.#unary();
    while (this.#peek('*') || this.#peek('/')) {
      const times = this.#peek('*');
      this.#at += 1;
      const right = this.#unary();
      value = times ? value * right : value / right;
    }
    return value;
  }

  #unary(): number {
    if (this.#peek('-')) {
      this.#at += 1;
      return -this.#unary();
    }
    if (this.#peek('+')) {
      this.#at += 1;
      return this.#unary();
    }
    const base = this.#withUnit();
    if (this.#peek('^')) {
      this.#at += 1;
      return base ** this.#unary();
    }
    return base;
  }

  /** A value with an optional unit straight after it: `12 cm`, `(a + b) in`. */
  #withUnit(): number {
    const value = this.#primary();
    const next = this.#tokens[this.#at];
    if (next?.kind === 'name' && next.value in UNITS && !this.#isCall(this.#at)) {
      this.#at += 1;
      return value * (UNITS[next.value] ?? 1);
    }
    return value;
  }

  #isCall(index: number): boolean {
    const after = this.#tokens[index + 1];
    return after?.kind === 'op' && after.value === '(';
  }

  #primary(): number {
    const token = this.#tokens[this.#at];
    if (token === undefined) throw new Error('The expression ends too early.');
    if (token.kind === 'number') {
      this.#at += 1;
      return token.value;
    }
    if (token.kind === 'op' && token.value === '(') {
      this.#at += 1;
      const value = this.#sum();
      if (!this.#peek(')')) throw new Error('A bracket is not closed.');
      this.#at += 1;
      return value;
    }
    if (token.kind === 'name') {
      this.#at += 1;
      const fn = FUNCTIONS[token.value];
      if (fn !== undefined && this.#peek('(')) {
        this.#at += 1;
        const args: number[] = [];
        if (!this.#peek(')')) {
          args.push(this.#sum());
          while (this.#peek(',')) {
            this.#at += 1;
            args.push(this.#sum());
          }
        }
        if (!this.#peek(')')) throw new Error(`${token.value}( is not closed.`);
        this.#at += 1;
        return fn(...args);
      }
      const constant = CONSTANTS[token.value];
      if (constant !== undefined) return constant;
      const found = this.#lookup(token.value);
      if (!found.ok) throw new Error(found.message);
      return found.value;
    }
    throw new Error(`Unexpected "${token.value}".`);
  }
}

/** Evaluates one expression, resolving names with `lookup`. */
export function evaluate(text: string, lookup: (name: string) => Evaluated): Evaluated {
  if (text.trim() === '') return { ok: false, message: 'The expression is empty.' };
  const tokens = tokenize(text);
  if (typeof tokens === 'string') return { ok: false, message: tokens };
  try {
    const value = new Parser(tokens, lookup).parse();
    // Name the actual problem; "not a number" for division by zero reads like a typo.
    if (value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY)
      return { ok: false, message: `"${text}" divides by zero.` };
    if (!Number.isFinite(value)) return { ok: false, message: `"${text}" is not a number.` };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Evaluates all variables regardless of definition order. Cycles are refused with the loop
 * named.
 */
export function evaluateVariables(variables: readonly Variable[]): ReadonlyMap<string, Evaluated> {
  const byName = new Map(variables.map((variable) => [variable.name, variable]));
  const done = new Map<string, Evaluated>();
  const visiting: string[] = [];

  const resolve = (name: string): Evaluated => {
    const known = done.get(name);
    if (known !== undefined) return known;
    const variable = byName.get(name);
    if (variable === undefined) return { ok: false, message: `There is no variable "${name}".` };
    if (visiting.includes(name)) {
      const loop = [...visiting.slice(visiting.indexOf(name)), name].join(' → ');
      return { ok: false, message: `The variables refer to each other in a loop: ${loop}.` };
    }
    visiting.push(name);
    const result = evaluate(variable.expression, resolve);
    visiting.pop();
    const named: Evaluated = result.ok
      ? result
      : { ok: false, message: `${variable.name}: ${result.message}` };
    done.set(name, named);
    return named;
  };

  for (const variable of variables) resolve(variable.name);
  return done;
}

/** A lookup over evaluated variables, for `evaluate`. */
export function lookupIn(values: ReadonlyMap<string, Evaluated>): (name: string) => Evaluated {
  return (name) => values.get(name) ?? { ok: false, message: `There is no variable "${name}".` };
}

/** Variable names used by an expression, for "used by" and renaming. */
export function namesIn(text: string): readonly string[] {
  const tokens = tokenize(text);
  if (typeof tokens === 'string') return [];
  const names = new Set<string>();
  tokens.forEach((token, index) => {
    if (token.kind !== 'name') return;
    if (token.value in UNITS || token.value in CONSTANTS) return;
    const after = tokens[index + 1];
    if (token.value in FUNCTIONS && after?.kind === 'op' && after.value === '(') return;
    names.add(token.value);
  });
  return [...names];
}
