/**
 * The icon set, drawn as code. 57 icons on a 16-unit grid, `currentColor`, no raster.
 *
 * The rules, so thirty drawings read as one set:
 *
 *   1. One thin line, round at the ends, like the script word mark. It is drawn as glass by
 *      `glass.mjs`: the line is solid at the top and clears towards the bottom, with a fine line of
 *      light on its lit edge.
 *   2. A surface is frosted glass: a tint behind the line, never a solid grey shape.
 *   3. "Before" is a ghost: the same line, thin and faint. Input, construction and what an action
 *      removes are ghosts; the result is the full line. No dotted lines: a dash pattern laid along a
 *      path lands its dots wherever the path's length puts them, in clumps at corners and touching
 *      the lines beside them.
 *   4. An axis (revolve, mirror, split, centre line) is a dash-dot drawn piece by piece and spaced
 *      to its length, so it starts and ends on a full dash and is the same from either end.
 *   5. One open ring marks the gesture: where you click or drag. A line that leads to the ring stops
 *      short of it instead of running into it, and every ring stays inside the grid.
 *   6. Solids in oblique projection (front face square on, depth up and to the right), never the
 *      isometric hexagon. No arrows on faces; a motion is its ghost trace and its result.
 *
 * A drawing is a string of SVG elements. `data-ghost` marks the ones that get no highlight.
 */

const T = (o) => `fill="currentColor" fill-opacity="${o}" stroke="none"`;
/** The ghost of a line: what was there before, or is only construction. */
const G = 'stroke-opacity="0.42" stroke-width="0.95" data-ghost=""';
const RING = 1.6;
const ring = (x, y) => `<circle cx="${x}" cy="${y}" r="${RING}" stroke-width="1.15"/>`;
const n = (v) => +v.toFixed(2);

/** A centre line from one point to another: dash, dot, dash … dash, spaced to fit exactly. */
function axis(x1, y1, x2, y2) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len,
    uy = (y2 - y1) / len;
  const dash = 3,
    gap = 1.35;
  const units = Math.max(1, Math.round((len - dash) / (dash + 2 * gap)));
  const k = len / (units * (dash + 2 * gap) + dash);
  const at = (t) => `${n(x1 + ux * t)} ${n(y1 + uy * t)}`;
  const parts = [];
  let t = 0;
  for (let i = 0; i <= units; i++) {
    parts.push(`M${at(t)}L${at(t + dash * k)}`);
    t += dash * k + gap * k;
    if (i < units) {
      parts.push(`M${at(t)}l0 0`);
      t += gap * k;
    }
  }
  return `<path d="${parts.join('')}" stroke-opacity="0.6" stroke-width="1" data-ghost=""/>`;
}

/** An oblique box: front face square on, depth (d) up and to the right. Faces tinted by turn. */
function box(x, y, w, h, d = 3, { top = 0.34, side = 0.18, front = 0.1, ghost = false } = {}) {
  const A = [x, y],
    B = [x + w, y],
    C = [x + w, y + h],
    D = [x, y + h];
  const a = [x + d, y - d],
    b = [x + w + d, y - d],
    c = [x + w + d, y + h - d];
  const p = (...pts) => pts.map((q) => q.join(' ')).join(' L');
  return [
    `<path d="M${p(A, B, C, D)}Z" ${T(front)}/>`,
    `<path d="M${p(A, a, b, B)}Z" ${T(top)}/>`,
    `<path d="M${p(B, b, c, C)}Z" ${T(side)}/>`,
    `<path d="M${p(D, A, a, b, c, C, D)}M${p(A, B, C)}M${p(B, b)}"${ghost ? ` ${G}` : ''}/>`,
  ].join('');
}

export const ICONS = {
  /* Workspaces */
  design: box(2.5, 6, 8, 7.5, 3.5),
  visualize: `<circle cx="7.5" cy="7.5" r="5" ${T(0.16)}/><circle cx="7.5" cy="7.5" r="5"/><path d="M4.6 6.2a3.3 3.3 0 0 1 2.6-2.5" stroke-width="1.1"/><ellipse cx="8.2" cy="14.4" rx="4.6" ry="0.9" ${T(0.3)}/>`,
  drawings: `<path d="M2.5 3.5h11v9h-11z" ${T(0.1)}/><path d="M2.5 3.5h11v9h-11z"/><path d="M9 12.5V10h4.5"/><path d="M4.5 9.5l2.5-3 2 2" ${G}/>`,
  simulation: `<path d="M2 9.5h12" ${G}/><path d="M2 9.5c3.6 0 6.7 1.1 9.6 2.6"/><path d="M2 6.5v6" stroke-width="1.6"/>${ring(13.7, 13.1)}`,

  /* The rail */
  items: `<path d="M3 4h10M5.5 8h7.5M5.5 12h7.5"/><path d="M3 4.8V12h1.3M3 8h1.3" ${G}/>`,
  sketch: `<path d="M1.5 12.5h9l4-4h-9z" ${T(0.12)}/><path d="M1.5 12.5h9l4-4h-9z" ${G}/><path d="M4 11.2C5.3 7.6 6.8 5 8.9 3.7"/>${ring(11.1, 2.5)}`,
  insert: `<path d="M3.5 1.5h6l3 3v10h-9z" ${T(0.1)}/><path d="M9.5 1.5h-6v13h9v-10z"/><path d="M8 7v5M5.5 9.5h5"/>`,
  transform: `<rect x="1.5" y="7" width="6.5" height="6.5" rx="1.2" ${G}/><rect x="7.5" y="2" width="6.5" height="6.5" rx="1.2" ${T(0.2)}/><rect x="7.5" y="2" width="6.5" height="6.5" rx="1.2"/>`,
  tools: `${box(2.5, 6, 8, 7.5, 3.5, { top: 0.14 })}${ring(8.25, 4.25)}`,
  section: `<rect x="2" y="4.5" width="10" height="9.5" rx="1" ${G}/><path d="M6.5 2.5h7v11h-7z" ${T(0.4)}/><path d="M6.5 2.5h7v11h-7z"/><path d="M8.5 5l3 3M8.5 8.5l3 3" stroke-width="1"/>`,
  measure: `<path d="M2 4v8M14 4v8"/><path d="M3.8 9.5h8.4"/><path d="M5 8.3l-1.2 1.2 1.2 1.2M11 8.3l1.2 1.2-1.2 1.2" stroke-width="1.1"/><path d="M6.5 6h3" stroke-width="1.7"/>`,
  view: `<circle cx="3" cy="8" r="1.4" ${T(0.9)}/><path d="M4.4 7.3 13 3M4.4 8.7 13 13" ${G}/><path d="M13 3v10"/>`,
  display: `<circle cx="8" cy="8" r="6" ${T(0.12)}/><path d="M8 2a6 6 0 0 1 0 12z" ${T(0.32)}/><circle cx="8" cy="8" r="6"/><ellipse cx="8" cy="8" rx="2.4" ry="6" ${G}/>`,
  units: `<path d="M5.5 2v9.5M10.5 2v9.5M4.5 5.5H14M4.5 10.5H14" ${G}/><path d="M2 2v12h12"/>`,
  snap: `<path d="M2 9h4.45M11.55 9H14M9 2v4.45M9 11.55V14" ${G}/>${ring(9, 9)}<circle cx="4" cy="4" r="1.3" ${T(0.9)}/><path d="M5.4 5.4 7.1 7.1" ${G}/>`,
  screenshot: `<path d="M2 5.5V3.5a1.5 1.5 0 0 1 1.5-1.5h2M10.5 2h2A1.5 1.5 0 0 1 14 3.5v2M14 10.5v2a1.5 1.5 0 0 1-1.5 1.5h-2M5.5 14h-2A1.5 1.5 0 0 1 2 12.5v-2"/><circle cx="8" cy="8" r="2.2" ${T(0.3)}/><circle cx="8" cy="8" r="2.2"/>`,
  history: `<path d="M5 5.2V12"/><path d="M5 9.6c0-2.3 1.4-3.6 4.2-3.6"/>${ring(5, 2.6)}<circle cx="5" cy="13.3" r="1.4" ${T(0.9)}/>${ring(11.8, 6)}`,

  /* Sketch */
  line: `<path d="M2.5 13.5 10.6 5.4"/>${ring(12.4, 3.6)}`,
  centerline: axis(2.2, 13.8, 13.8, 2.2),
  // Shifted in, so the ring at its end stays inside the 16 grid.
  arc: `<g transform="translate(-1.2 0)"><path d="M2.9 12.5A6 6 0 0 1 14.38 10.06"/>${ring(14.9, 12.5)}</g>`,
  rectangle: `<rect x="2.5" y="4" width="11" height="8" rx="0.8" ${T(0.1)}/><path d="M10.95 12H3.3a.8.8 0 0 1-.8-.8V4.8a.8.8 0 0 1 .8-.8h9.4a.8.8 0 0 1 .8.8v4.65"/><path d="M3.9 5 11.45 10.5" ${G}/>${ring(13.5, 12)}`,
  circle: `<circle cx="8" cy="8" r="5.5" ${T(0.1)}/><path d="M9.79 13.2A5.5 5.5 0 1 1 13.2 9.79"/><path d="M8 8l2.12 2.12" ${G}/>${ring(11.89, 11.89)}`,
  ellipse: `<ellipse cx="8" cy="8" rx="6" ry="3.8" ${T(0.1)}/><ellipse cx="8" cy="8" rx="6" ry="3.8"/><path d="M3 8h10M8 5.2v5.6" ${G}/>`,
  polygon: `<path d="M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9z" ${T(0.12)}/><path d="M13.4 7.4v3.7L8 14.2l-5.4-3.1V4.9L8 1.8l3.23 1.86"/><path d="M8 8l3.23-1.86" ${G}/>${ring(13.4, 4.9)}`,
  spline: `<path d="M2 12 5 3l6 10 3-9" ${G}/><path d="M2 12c1.5-4.5 3-6.2 4.8-5.4S10 11 11.4 9.6C12.6 8.4 13.4 6 14 4"/>`,
  trim: `<path d="M8.5 2v12"/><path d="M2 8h6.5"/><path d="M8.5 8H14" ${G}/>`,
  offset: `<rect x="5" y="5" width="6" height="6" rx="1" ${G}/><rect x="2" y="2" width="12" height="12" rx="3.2" ${T(0.1)}/><rect x="2" y="2" width="12" height="12" rx="3.2"/>`,
  project: `<path d="M2 13.5h8.5l3.5-3.5H5.5z" ${T(0.16)}/><path d="M2 13.5h8.5l3.5-3.5H5.5z"/><path d="M4.5 4.5c2-2 5-2 7 0M4.5 4.5v6.6M11.5 4.5v6.6" ${G}/><path d="M4.5 12c2-1.4 5-1.4 7 0"/>`,
  text: `<path d="M3 3.5h10M8 3.5V13"/><path d="M2 14.5h12" ${G}/>`,
  erase: `<path d="M9 2.5l4.5 4.5-6.5 6.5H4L2 11.5z" ${T(0.12)}/><path d="M9 2.5l4.5 4.5-6.5 6.5H4L2 11.5z"/><path d="M5.5 6 10 10.5"/><path d="M9 14h5" ${G}/>`,

  /* Solids */
  extrude: `<path d="M2 13.5h7l4-3.5H6z" ${G}/><path d="M2 6.5h7l4-3.5H6z" ${T(0.5)}/><path d="M2 6.5h7l4-3.5H6zM2 6.5v7M9 6.5v7M13 3v7"/><path d="M6 3v7" ${G}/>`,
  revolve: `${axis(4, 1.2, 4, 14.8)}<rect x="6.5" y="4" width="3.5" height="8" rx="0.6" ${T(0.32)}/><rect x="6.5" y="4" width="3.5" height="8" rx="0.6"/><path d="M10 13.4c2.6-.6 4-2 4-3.4s-1.4-2.8-4-3.4" ${G}/>`,
  fillet: `<path d="M3 3h5.5A5.5 5.5 0 0 0 3 8.5z" ${T(0.3)}/><path d="M3 8.5V3h5.5" ${G}/><path d="M3 14V8.5A5.5 5.5 0 0 1 8.5 3H14"/>`,
  chamfer: `<path d="M3 3h5.5L3 8.5z" ${T(0.3)}/><path d="M3 8.5V3h5.5" ${G}/><path d="M3 14V8.5L8.5 3H14"/>`,
  shell: `${box(2.5, 6, 8, 7.5, 3.5, { top: 0.08 })}<path d="M4.4 4.8h5.2l1.5-1.5H5.9z" ${T(0.45)}/><path d="M4.4 4.8h5.2l1.5-1.5H5.9z" stroke-width="1"/>`,
  hole: `${box(2, 9, 9.5, 4.5, 3, { top: 0.22 })}<ellipse cx="8.2" cy="7.5" rx="2.4" ry="1" ${T(0.9)}/><path d="M5.8 7.5v4.5M10.6 7.5v4.5" ${G}/>`,
  combine: `<path d="M2.5 9.5a4 4 0 0 0 7.9 1h1.1a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2H6.5a2 2 0 0 0-2 2v1.1A4 4 0 0 0 2.5 9.5z" ${T(0.16)}/><path d="M2.5 9.5a4 4 0 0 0 7.9 1h1.1a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2H6.5a2 2 0 0 0-2 2v1.1A4 4 0 0 0 2.5 9.5z"/><path d="M4.5 4.6a4 4 0 0 1 5.9 5.9" ${G}/>`,
  split: `<rect x="1.5" y="3.5" width="5" height="9" rx="1" ${T(0.24)}/><rect x="1.5" y="3.5" width="5" height="9" rx="1"/><rect x="9.5" y="3.5" width="5" height="9" rx="1" ${T(0.1)}/><rect x="9.5" y="3.5" width="5" height="9" rx="1"/>${axis(8, 1.2, 8, 14.8)}`,

  /* Transform */
  move: `<rect x="1.5" y="8.5" width="5.5" height="5.5" rx="1" ${G} transform="rotate(-12 4.25 11.25)"/><rect x="8.5" y="2" width="5.5" height="5.5" rx="1" ${T(0.24)} transform="rotate(10 11.25 4.75)"/><rect x="8.5" y="2" width="5.5" height="5.5" rx="1" transform="rotate(10 11.25 4.75)"/><path d="M5 8C5.5 5.5 6.5 4.6 8 4.4" ${G}/>`,
  scale: `<rect x="2" y="9" width="5" height="5" rx="0.8" ${G}/><rect x="2" y="2" width="12" height="12" rx="1.4" ${T(0.1)}/><path d="M14 5.15v7.45a1.4 1.4 0 0 1-1.4 1.4H3.4A1.4 1.4 0 0 1 2 12.6V3.4A1.4 1.4 0 0 1 3.4 2h7.45"/><path d="M7 9l4.6-4.6" ${G}/>${ring(13.4, 2.6)}`,
  mirror: `${axis(8, 1.2, 8, 14.8)}<path d="M6 3.5 2 12.5h4z" ${T(0.3)}/><path d="M6 3.5 2 12.5h4z"/><path d="M10 3.5l4 9h-4z" ${G}/>`,
  pattern: `<circle cx="4" cy="12" r="2.3" ${T(0.3)}/><circle cx="4" cy="12" r="2.3"/><circle cx="8" cy="8" r="2.3" ${G}/><circle cx="12" cy="4" r="2.3" ${G}/>`,

  /* Files and app */
  home: `<rect x="2" y="2" width="5" height="5" rx="1.2" ${T(0.3)}/><rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/>`,
  settings: `<path d="M2 5h1.6M7.4 5H14M2 11h6.6M12.4 11H14"/><circle cx="5.5" cy="5" r="1.9" ${T(0.5)}/><circle cx="5.5" cy="5" r="1.9"/><circle cx="10.5" cy="11" r="1.9"/>`,
  search: `<circle cx="7" cy="7" r="4.5" ${T(0.1)}/><circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4 14 14"/>`,
  import: `<path d="M8 2v7.5M5 6.8 8 9.8l3-3"/><path d="M2.5 10.5v2a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-2"/>`,
  export: `<path d="M8 10V2.5M5 5.2 8 2.2l3 3"/><path d="M2.5 10.5v2a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-2"/>`,
  finish: `<path d="M3 8.5 6.5 12 13 4.5"/>`,
  exit: `<path d="M4 4l8 8M12 4l-8 8"/>`,
  more: `<circle cx="3" cy="8" r="1.3" ${T(0.9)}/><circle cx="8" cy="8" r="1.3" ${T(0.9)}/><circle cx="13" cy="8" r="1.3" ${T(0.9)}/>`,
  eye: `<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2" ${T(0.4)}/><circle cx="8" cy="8" r="2"/>`,
  'eye-off': `<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" ${G}/><path d="M2.5 13.5l11-11"/>`,
  folder: `<path d="M1.5 4.5a1.5 1.5 0 0 1 1.5-1.5h3l1.5 1.8H13a1.5 1.5 0 0 1 1.5 1.5v5.7A1.5 1.5 0 0 1 13 13.5H3a1.5 1.5 0 0 1-1.5-1.5z" ${T(0.12)}/><path d="M1.5 4.5a1.5 1.5 0 0 1 1.5-1.5h3l1.5 1.8H13a1.5 1.5 0 0 1 1.5 1.5v5.7A1.5 1.5 0 0 1 13 13.5H3a1.5 1.5 0 0 1-1.5-1.5z"/>`,
  /* Extending Bezier */
  // A piece fitted inside a frame it cannot leave: a plugin in its sandbox.
  plugin: `<rect x="1.5" y="2" width="13" height="12.5" rx="3" ${G}/><path d="M4 6.8h2a1.5 1.5 0 1 1 3 0h2v2a1.5 1.5 0 1 1 0 3V12.5H4z" ${T(0.18)}/><path d="M4 6.8h2a1.5 1.5 0 1 1 3 0h2v2a1.5 1.5 0 1 1 0 3V12.5H4z"/>`,
  sdk: `<path d="M5 4 1.8 8 5 12M11 4l3.2 4L11 12"/><path d="M6.6 13.2 9.4 2.8" ${G}/>`,
  // The model, and the ring where an assistant points at it: MCP serves the one so it can do the other.
  mcp: `<path d="M2 9.5h5.5v4.5H2z" ${T(0.1)}/><path d="M2 9.5l2.5-2.5h5.5L7.5 9.5z" ${T(0.34)}/><path d="M7.5 9.5 10 7v4.5L7.5 14z" ${T(0.18)}/><path d="M2 14h5.5l2.5-2.5V7H4.5L2 9.5zM2 9.5h5.5V14M7.5 9.5 10 7"/><path d="M4.5 7C5 4.2 7.5 2.6 10.6 2.9" ${G}/>${ring(13.2, 3.8)}`,
  server: `<rect x="2" y="9" width="12" height="5" rx="1.4" ${G}/><rect x="2" y="2.5" width="12" height="5" rx="1.4" ${T(0.18)}/><rect x="2" y="2.5" width="12" height="5" rx="1.4"/><circle cx="11.3" cy="5" r="1" ${T(0.9)}/><path d="M4.5 5h3.5"/><path d="M8 7.5V9" ${G}/>`,
};

/** What the icons are called in the interface, by key. */
export const NAMES = {
  design: 'Design',
  visualize: 'Visualize',
  drawings: 'Drawings',
  simulation: 'Simulation',
  items: 'Items',
  sketch: 'Sketch',
  insert: 'Insert',
  transform: 'Transform',
  tools: 'Tools',
  section: 'Section view',
  measure: 'Measure',
  view: 'View',
  display: 'Display',
  units: 'Units and grid',
  snap: 'Snapping',
  screenshot: 'Screenshot',
  history: 'History',
  line: 'Line',
  centerline: 'Centerline',
  arc: 'Arc',
  rectangle: 'Rectangle',
  circle: 'Circle',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
  spline: 'Spline',
  trim: 'Trim',
  offset: 'Offset edge',
  project: 'Project',
  text: 'Text',
  erase: 'Delete',
  extrude: 'Extrude',
  revolve: 'Revolve',
  fillet: 'Fillet',
  chamfer: 'Chamfer',
  shell: 'Shell',
  hole: 'Hole',
  combine: 'Combine',
  split: 'Split',
  move: 'Move and rotate',
  scale: 'Scale',
  mirror: 'Mirror',
  pattern: 'Pattern',
  home: 'Projects',
  settings: 'Settings',
  search: 'Search',
  import: 'Import',
  export: 'Export',
  finish: 'Finish',
  exit: 'Exit',
  more: 'More',
  eye: 'Show',
  'eye-off': 'Hide',
  folder: 'Folder',
  plugin: 'Plugins',
  sdk: 'Plugin SDK',
  mcp: 'MCP & Automation',
  server: 'Your server',
};
