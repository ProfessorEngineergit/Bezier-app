/**
 * Lane layout for the history graph: one row per commit, newest first, one lane per branch.
 * Layout only; the app does the drawing.
 *
 * Each row lists the lanes coming in from above, passing through, and leaving towards the
 * commit's parents, which is enough to draw any history with straight segments.
 */

export interface GraphCommit {
  readonly id: string;
  readonly parents: readonly string[];
  readonly at: string;
}

export interface GraphRow<C extends GraphCommit = GraphCommit> {
  readonly commit: C;
  /** The lane the commit sits in. */
  readonly lane: number;
  /** Lanes arriving at the commit from the row above (its children). */
  readonly incoming: readonly number[];
  /** Lanes that pass this row without touching the commit. */
  readonly passing: readonly number[];
  /** Lanes leaving the commit for the row below (towards its parents). */
  readonly outgoing: readonly number[];
  /** Branch names whose head is this commit. */
  readonly heads: readonly string[];
}

export interface Graph<C extends GraphCommit = GraphCommit> {
  readonly rows: readonly GraphRow<C>[];
  /** How many lanes wide the widest row is. */
  readonly width: number;
}

export function layoutGraph<C extends GraphCommit>(
  commits: readonly C[],
  heads: readonly { name: string; head: string }[] = [],
): Graph<C> {
  const order = topological(commits);
  const known = new Set(order.map((c) => c.id));
  /** For each lane, the commit it is waiting for, or null when the lane is free. */
  const lanes: (string | null)[] = [];
  const rows: GraphRow<C>[] = [];
  let width = 0;

  for (const commit of order) {
    const waiting = lanes.flatMap((id, i) => (id === commit.id ? [i] : []));
    let lane = waiting[0] ?? lanes.indexOf(null);
    if (lane === -1) lane = lanes.length;
    const incoming = [...waiting];

    // Every lane that waited for this commit ends here; the commit's own lane goes on.
    for (const i of waiting) lanes[i] = null;
    const passing = lanes.flatMap((id, i) => (id !== null && i !== lane ? [i] : []));

    const outgoing: number[] = [];
    const parents = commit.parents.filter((p) => known.has(p));
    parents.forEach((parent, index) => {
      const already = lanes.indexOf(parent);
      if (already !== -1) {
        // Another lane is already heading to this parent: join it rather than run beside it.
        outgoing.push(already);
        return;
      }
      let target = index === 0 ? lane : lanes.indexOf(null);
      if (target === -1 || (index > 0 && target === lane)) target = firstFree(lanes, lane);
      lanes[target] = parent;
      outgoing.push(target);
    });

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    width = Math.max(width, lane + 1, ...outgoing.map((o) => o + 1), ...passing.map((p) => p + 1));
    rows.push({
      commit,
      lane,
      incoming,
      passing,
      outgoing,
      heads: heads.filter((h) => h.head === commit.id).map((h) => h.name),
    });
  }
  return { rows, width };
}

function firstFree(lanes: (string | null)[], not: number): number {
  for (let i = 0; i < lanes.length; i++) if (lanes[i] === null && i !== not) return i;
  return Math.max(lanes.length, not + 1);
}

/**
 * Children before parents, and among commits free to go next, the newest first. Plain
 * date order is not enough: clocks on two machines disagree, and a parent must never be
 * drawn above its child.
 */
function topological<C extends GraphCommit>(commits: readonly C[]): C[] {
  const byId = new Map(commits.map((c) => [c.id, c]));
  const children = new Map<string, number>();
  for (const c of commits) {
    for (const p of c.parents) if (byId.has(p)) children.set(p, (children.get(p) ?? 0) + 1);
  }
  const ready = commits.filter((c) => (children.get(c.id) ?? 0) === 0);
  const out: C[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => (a.at === b.at ? (a.id < b.id ? -1 : 1) : a.at < b.at ? 1 : -1));
    const next = ready.shift();
    if (next === undefined) break;
    out.push(next);
    for (const p of next.parents) {
      const parent = byId.get(p);
      if (parent === undefined) continue;
      const left = (children.get(p) ?? 1) - 1;
      children.set(p, left);
      if (left === 0) ready.push(parent);
    }
  }
  return out;
}
