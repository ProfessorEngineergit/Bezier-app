/**
 * Import: a STEP or IGES file as new bodies. The file text is stored in the feature so the project
 * stays self-contained (ADR 0005). Imported faces are named like any other.
 */
import { err, importBudgetMs, ok, textKey } from '@bezier/kernel';
import { combineWithBody } from './bodies.js';
import { defineFeature } from './registry.js';

export const importStepFeature = defineFeature({
  type: 'import-step',
  label: 'Import',
  params: {
    file: { kind: 'text', label: 'File' },
    // Saved imports keep their source coordinates; only new imports opt into placement on Z = 0.
    placement: {
      kind: 'choice',
      label: 'Placement',
      options: ['source', 'ground'],
      default: 'source',
    },
    // Sideways shift so the part does not overlap existing geometry. Computed once at import and
    // stored, so the part does not move when earlier history changes.
    dx: { kind: 'length', label: 'Shift X', default: 0, min: -10000000, max: 10000000 },
    // STEP, or IGES sewn into solids. Defaults to STEP for older documents.
    format: {
      kind: 'choice',
      label: 'Format',
      options: ['step', 'iges'],
      default: 'step',
      fixed: true,
    },
    // The default (naming by shape) is what older saved imports use.
    faceOrder: {
      kind: 'choice',
      label: 'Face order',
      options: ['shape', 'file'],
      default: 'shape',
      fixed: true,
    },
  },
  faceTags: ['face-*'],
  // Reading dominates; the extra minute covers sorting solids and joining them to the model.
  deadlineMs: (params) => importBudgetMs(params.file.length) + 60_000,
  namesInOrder: (params) => params.faceOrder === 'file',
  async rebuild(kernel, params, input) {
    if (params.file.trim() === '') return err('invalid-result', 'The imported file is empty.');
    // Reuse the kernel's stored shape only for file-order naming: a stored shape measures slightly
    // differently, which would change shape-based names.
    const reuse = params.faceOrder === 'file';
    // Look up by key first so a kept file's text is not sent to the worker again.
    const key = reuse ? textKey(params.file) : undefined;
    const kept = key === undefined ? null : await kernel.importKept(key);
    const imported =
      params.format === 'iges'
        ? await kernel.importIges(params.file)
        : kept?.ok === true && kept.value !== null
          ? ok(kept.value)
          : await kernel.importStep(params.file, { reuse, ...(key === undefined ? {} : { key }) });
    if (!imported.ok) return imported;
    const solids = await kernel.solidFaceGroups(imported.value);
    if (!solids.ok || solids.value.length === 0) {
      await kernel.dispose(imported.value);
      return err(
        'invalid-result',
        `This ${params.format === 'iges' ? 'IGES' : 'STEP'} file holds no solid bodies, only surfaces or wireframes that do not close around a volume.`,
      );
    }
    let placed = imported.value;
    let lift = 0;
    if (params.placement === 'ground') {
      // Measured solid by solid; an assembly is never meshed or bounded whole.
      const box = await kernel.bounds(placed);
      if (!box.ok) {
        await kernel.dispose(placed);
        return box;
      }
      lift = -box.value.min.z;
    }
    // One move: down to the floor and sideways.
    if (Math.abs(lift) > 1e-7 || Math.abs(params.dx) > 1e-7) {
      const translated = await kernel.translate(placed, { x: params.dx, y: 0, z: lift });
      await kernel.dispose(placed);
      if (!translated.ok) return translated;
      placed = translated.value.shape;
    }
    await input.preview?.(placed);
    return combineWithBody(kernel, input.body, placed, 'new');
  },
});
