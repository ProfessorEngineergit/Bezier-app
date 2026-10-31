/**
 * Fallback for frosted-glass panels (`backdrop-filter`). Without GPU acceleration (VMs, distrusted
 * GPUs) browsers claim blur support but do not draw it, and `@supports` cannot tell. A WebGL
 * context that fails on a major performance caveat can, so the Glass preference defaults to
 * Automatic: full with acceleration, tinted without (`use-prefs.ts`).
 */

/**
 * Software renderers and VM virtual GPUs: they provide WebGL without the caveat and still leave the
 * blur undrawn.
 */
const SOFTWARE_OR_VIRTUAL =
  /swiftshader|llvmpipe|softpipe|basic render|software|vmware|svga|virtualbox|vbox|parallels|hyper-v|virgl|virtio|qxl|red hat|bochs|citrix/i;

/**
 * A Windows graphics adapter by vendor, as ANGLE names it over Direct3D 11: real hardware, whatever
 * the performance check below says. Nothing on macOS or Linux is named this way.
 */
const WINDOWS_ADAPTER = /^ANGLE \((NVIDIA|AMD|ATI|Intel|Qualcomm)\b/i;

/**
 * Whether the machine draws with graphics acceleration, from what the page could learn.
 * `strict`: a WebGL context was made that refuses a major performance caveat. `renderer`: the
 * adapter's own name, read from a context made without that refusal.
 *
 * The caveat check alone is not enough on Windows: a laptop with two graphics chips can fail it
 * with a real GPU, and the panels then stayed without blur for good. The name settles that case,
 * but only when it is a named adapter, so a software renderer behind the same failure still counts
 * as none.
 */
export function accelerationOf(strict: boolean, renderer: string): boolean {
  if (SOFTWARE_OR_VIRTUAL.test(renderer)) return false;
  return strict || WINDOWS_ADAPTER.test(renderer);
}

/** Why the last check said what it did, for the problem report. */
let reason = 'not checked';
export function accelerationReport(): string {
  return reason;
}

/** Whether this browser draws with graphics acceleration. */
export function accelerated(): boolean {
  // Set by the Linux desktop app (main.rs): its webview reports every renderer as "Apple GPU",
  // including software rendering in a VM, and still provides WebGL.
  if ((window as Window & { __bezierSoftwarePaint?: boolean }).__bezierSoftwarePaint === true) {
    reason = 'no, the desktop shell reports software painting';
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    const strict =
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ??
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    // Without the refusal, to learn the adapter's name when the check said no.
    const context = strict ?? canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (context === null) {
      reason = 'no WebGL';
      return false;
    }
    // Some software renderers omit the caveat; their names give them away.
    const info = context.getExtension('WEBGL_debug_renderer_info');
    const renderer =
      info === null ? '' : String(context.getParameter(info.UNMASKED_RENDERER_WEBGL));
    context.getExtension('WEBGL_lose_context')?.loseContext();
    const yes = accelerationOf(strict !== null, renderer);
    reason = `${yes ? 'yes' : 'no'}, ${strict === null ? 'the performance check refused a context' : 'the performance check passed'}, adapter ${renderer === '' ? 'unnamed' : renderer}`;
    return yes;
  } catch {
    reason = 'no, the check threw';
    return false;
  }
}

let measured: boolean | undefined;

function isAccelerated(): boolean {
  measured ??= accelerated();
  return measured;
}

/**
 * The glass to draw for the preference; Automatic decides by acceleration, once. Without it,
 * tinted: no blur and a fill dense enough to read over anything. (Fully opaque looked like another
 * app.)
 */
export function glassFor(
  mode: 'auto' | 'full' | 'reduced' | 'solid',
): 'full' | 'reduced' | 'solid' | 'tinted' {
  if (mode !== 'auto') return mode;
  return isAccelerated() ? 'full' : 'tinted';
}

/**
 * How expensive the window's own painting may be. Without acceleration the CPU repaints every
 * change, and soft shadows dominate: in Linux WebKit without a GPU, opening Sketch or Quick
 * settings took 410 and 460 ms, and 210 and 170 ms without shadows. Light keeps popover hairlines
 * and drops the soft shadow.
 */
export function paintFor(): 'full' | 'light' {
  // Manual override: browser tests keep the full view cube (they click its faces by name) even
  // though their headless browser renders in software.
  try {
    const chosen = window.localStorage.getItem('bezier.paint');
    if (chosen === 'full' || chosen === 'light') return chosen;
  } catch {
    // Fall through to detection.
  }
  return isAccelerated() ? 'full' : 'light';
}
