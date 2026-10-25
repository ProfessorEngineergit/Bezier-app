# @bezier/kernel

The geometry layer. Wraps [OCCT](https://dev.opencascade.org/), a 30-year-old
industrial B-Rep kernel, compiled to WebAssembly, and hides it behind an API that
is pleasant to use from TypeScript.

## Why this package exists

At a glance

| | |
| --- | --- |
| **Layer** | The geometry layer: Open CASCADE (WebAssembly) behind a typed, failure-as-value API |
| **Depends on** | `occt-wasm`, `comlink` (nothing else in the workspace). **The only package that may import `occt-wasm`** |
| **Used by** | `core`, `renderer`, `apps/studio`, `bench` |
| **Tests** | 14 files, 1,979 lines, against the real engine, never a mock |
| **Read first** | `src/kernel.ts` (the contract), `src/worker/supervisor.ts` (the watchdog), `src/occt-kernel.ts` (the engine and its documented workarounds) |
| **Explained in** | [How it works: the geometry engine and its watchdog](../../docs/how-it-works/02-geometry-engine.md) |


OCCT is excellent and its API is from another era: raw handles, downcasts, manual
memory management, and functions that signal failure by returning a shape that is
subtly invalid. This package is the airlock. Everything ugly stays inside.

**Rule: no other package may import `occt-wasm`.** If you need something the
kernel can do that this package does not expose, add it here, do not reach past
it. ([ADR 0004](../../docs/adr/0004-app-architecture.md))

## Two things that make this package unusual

1. Failure is normal. Booleans and fillets fail on real geometry, that is true
of every B-Rep kernel, commercial ones included. So no function here throws for a
geometry failure. Everything returns a `KernelResult<T>`, and callers are forced by
the type system to handle the failure case. A fillet that cannot be built should
mark one feature as failed, never take down the document.

2. Operations report what they changed. OCCT can tell us which faces an
operation modified, generated, and deleted. That is the raw material for stable
geometry references, the hard problem that `@bezier/core` exists to solve, so
this package surfaces it rather than discarding it.

## Layout

```
src/
  types.ts     vocabulary: ShapeId, Mesh, EvolutionData, KernelResult
  errors.ts    typed failure modes
  kernel.ts    the GeometryKernel interface — the contract with everything above
  index.ts     public surface
```

## Status

Implemented and tested against the real OCCT module: extrude, revolve, fuse/cut/
intersect, fillet, chamfer, shell, tessellation with per-face triangle mapping,
edge extraction, STEP and STL export, STEP import, and shape lifetime.

Now worker-hosted in the browser. `createKernel()` spawns a supervised Web
Worker; in Node it runs in-process. Both implement `GeometryKernel`, so nothing
above this package can tell which one it has, which is what made the worker
additive rather than a rewrite.

### Two import paths, and the reason for them

```ts
import { createKernel } from '@bezier/kernel';       // supervised worker
import { createOcctKernel } from '@bezier/kernel/occt'; // in-process, direct
```

The in-process kernel and the WASM loader are not re-exported
from the package index. Both statically import `occt-wasm`, and re-exporting
either dragged the whole OCCT wrapper, the class body, `makeBox`, all 74 kB -
into any bundle that touched this package, defeating the split entirely.

Found by inspecting the built output rather than by reasoning about it. The main
app bundle went from 232 kB to 196 kB and now contains zero OCCT code.

### Supervision

`src/worker/supervisor.ts` owns the policy, and it is where the interesting
behaviour lives:

- **Timeouts.** A wedged kernel never replies; nothing else would ever clear it.
- **Restart.** The worker is terminated and respawned; in-flight calls are
  rejected rather than left pending, because a promise that never settles is a
  worse failure than an error.
- **A circuit breaker.** An operation that kills the worker twice is refused,
  otherwise a reliably-crashing operation becomes an infinite restart loop.

It talks to a `SupervisedWorker` interface rather than a real `Worker`, so all of
that is tested against a fake that can be told to hang and to die, provoking a
genuine WASM abort on demand would be miserable and would not test the
supervision any better.

### Two places where occt-wasm's documentation is wrong

Both found by integration test, both worked around here, both worth knowing if
you touch this file:

1. **`Mesh.faceGroups` triples are index offsets, not triangle offsets**, despite
   being documented as `[triStart, triCount, faceHash]`. A box returns six groups
   of 6, summing to 36, its index count, not its 12 triangles.

2. **`EvolutionData.modified` is not a list of hashes.** It is a flat run of
   `[inputHash, count, ...newHashes]` records.

### And one real gap in the API

`generated` comes back empty for fillets. OCCT answers "what did this shape
generate", and a fillet surface is generated from an *edge*, but the binding only
accepts face hashes as input. So the operation that most needs its new face named
is the one that does not report it.

This kernel recovers it by subtraction: any face in the result that cannot be
traced to a modified or untouched input is new. Verified, one fillet on a box
yields exactly one generated face. `EvolutionData` also carries `unchanged`, which
OCCT does not report either and which the naming layer needs.

## Licensing note

The OCCT WebAssembly binary is LGPL-2.1 with the OCCT linking exception. It ships
as a **separate `.wasm` file**, never inlined into a JS bundle, and its URL is
configurable so users can substitute their own build. This is a licence
requirement, not a preference. See [ADR 0003](../../docs/adr/0003-license-model.md).
