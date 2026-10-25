# ADR 0009: Durability, and why it is the same design as speed and transparency

- **Status:** Accepted
- **Date:** 2026-08-05

## Context

Three requirements, usually treated as competing:

1. **It must never crash, and never lose state.** A CAD tool that loses an hour of
   work is not a tool anyone trusts twice.
2. **It must be the fastest and most efficient option in every area.**
3. **It must be transparent**, a contributor, a reviewer, or an agent should be
   able to find anything and understand why it is there.

The usual framing is that these trade off. Redundancy costs speed. Speed costs
readability. Transparency costs indirection.

That framing is wrong here, and the point of this ADR is to show why.

## The decision

**The document is an append-only log of small, typed, content-addressed
operations.** Everything else follows from that one sentence.

Not a mutable object that gets saved periodically. A log of what the user did.

## Why one decision gives all three properties

This is the argument, stated concretely rather than asserted.

### The log is the crash-safety mechanism

Every edit is appended to a journal before it is applied. If the tab dies
mid-operation, OOM, a browser crash, a power cut, the journal is on disk and
replay reconstructs the exact state. Not "state as of the last autosave thirty
seconds ago". The actual state.

Data loss is bounded by one operation, not by an autosave interval.

### The log is the fastest possible write path

An append is the cheapest write a filesystem offers. The alternative, serialising
and rewriting the whole document on every parameter change, costs more the larger
the model gets, which is exactly backwards.

**Journaling is not a tax paid for safety. It is faster than the unsafe
alternative.**

### The log is the undo stack

Undo/redo is not a separate mechanism with its own bugs. It is a position in the
log. Stepping back is moving the cursor; redo is moving it forward. One structure,
correct by construction, with no possibility of the undo history and the saved
state disagreeing.

### The log is the best debugging artifact that exists

A bug report can carry the journal. It is a readable, ordered account of exactly
what the user did, replayable on another machine. Compare with "it broke, I don't
remember what I clicked".

### The log is transparent by nature

`{"seq":42,"op":"updateParams","feature":"fillet-1","params":{"radius":3}}` needs
no explanation. It diffs in git. A person can read a document and understand it.

One structure: crash safety, write speed, undo, debuggability, legibility.
That is why these requirements are not in tension, they are satisfied by the same
thing.

## The rest of the redundancy design

The journal is the core. These surround it.

### Crash isolation: the worker is a durability boundary

[ADR 0007](0007-performance-architecture.md) put the kernel in a worker for
latency. That reasoning was incomplete.

OCCT is a thirty-year-old C++ library compiled to WebAssembly. It can hard
abort, out of memory, an assertion failure, a stack overflow on pathological
geometry. An abort inside a WASM module is not catchable as an exception; it kills
the whole instance.

In the main thread that is a dead application. In a worker it is a dead worker.

So the supervisor restarts it, replays the cached history, and the user sees a
brief pause instead of a lost afternoon. The worker boundary is a fault-isolation
boundary, and that is a stronger reason for it than frame budget.

### Supervision, with a circuit breaker

- **Timeout.** Any kernel operation exceeding a deadline is treated as hung. The
  worker is terminated and restarted.
- **Replay.** The supervisor rebuilds from the last cached good state, which the
  content-addressed cache ([ADR 0007](0007-performance-architecture.md)) already
  holds. The performance cache is also the recovery cache.
- **Circuit breaker.** An operation that crashes the worker twice is marked
  poisonous and refused, with the feature reported as failed. Without this, a
  crashing operation becomes an infinite restart loop, which is worse than the
  original crash.

### Failures never cascade

Already the design, restated because it is a durability property: a failed feature
marks *itself* failed. The rest of the model still builds and still displays. One
bad fillet must never cost the other nineteen features.

### Atomic writes, always

Write to a temporary file, then rename. Never truncate in place. A crash during a
write leaves the previous version intact rather than a half-written file, which
is the failure mode that turns "lost the last edit" into "lost the document".

### Redundant copies, deliberately

| Copy | Purpose |
| --- | --- |
| Current snapshot | What loads normally |
| Journal since the snapshot | Everything after it. Replayed on open |
| Previous snapshots (rotating) | Survives a corrupt or bad current snapshot |
| Mirror in IndexedDB | **A different storage engine with different failure modes.** OPFS and IndexedDB do not fail together |
| User-exported file | The only copy that survives clearing site data |

The IndexedDB mirror is the one that looks redundant and is not: OPFS is a single
implementation with a single set of bugs, and betting a user's work on it alone is
the kind of decision that looks fine until it does not.

### Corruption degrades, never fails

Replay validates each entry's sequence and checksum. On a bad entry it **stops at
that point and reports**, the user gets everything up to the corruption, plus a
clear statement of what was lost. Refusing to open a document because byte 4,096
is wrong is the worst possible response.

The same principle already applies to parameters: a feature type this build does
not recognise produces an explanation, not a failed load
([ADR 0008](0008-feature-registry.md)).

### The UI cannot take down the app

React error boundaries around the viewport, each panel, and the feature tree. A
rendering bug blanks one panel, never the window. Global `error` and
`unhandledrejection` handlers flush the journal before anything else.

## Where the tension is real

One place, and it should be named rather than glossed over.

Zero-allocation hot paths are less readable than normal code. Reused scratch
objects and hoisted buffers are worse to read than the obvious version.

The resolution is scope: that discipline applies to exactly three paths -
camera, hover/pick, sketch drag, and nowhere else. Everywhere else, normal
readable code, because micro-optimising a cold path costs clarity and buys
nothing.

That is the only real trade, and it is contained.

## Consequences

### Positive

- Data loss is bounded by one operation.
- Undo/redo is not a separate mechanism that can disagree with saved state.
- A kernel crash costs a pause, not a session.
- Bug reports carry a replayable log.
- The performance cache and the recovery cache are the same object.

### Negative / accepted

- The journal grows and needs compaction into snapshots. Compaction is the
  operation most likely to lose data, so it must be atomic and it must keep the
  previous snapshot until the new one is verified readable.
- Every edit must be expressible as a serialisable operation. That is a real
  constraint on how UI code is written, it may not mutate a document directly.
  It is also what makes the design work, so it is enforced rather than encouraged.
- Replay must be deterministic. Nothing in an operation may depend on wall-clock
  time, iteration order, or random values.
- Multiple copies cost storage. Cheap relative to what they protect.

## Rules that follow

1. **No code mutates a document directly.** Edits are operations, appended to the
   journal, then applied. Enforced by keeping the document type deeply readonly.
2. **Replay is deterministic.** No `Date.now()`, no `Math.random()`, no reliance
   on object key order inside an operation.
3. **Every write is atomic**, temp file, then rename.
4. **Every kernel call has a deadline**, and exceeding it restarts the worker.
5. **Corruption stops replay and reports.** It never throws away the good prefix.

## Open questions

- Compaction threshold, how many entries before snapshotting? Needs measurement
  against real editing sessions.
- Does the IndexedDB mirror write synchronously with the journal, or lag behind?
  Synchronous is safer and slower; lagging risks losing the last few operations in
  the specific case where OPFS is the thing that failed.
- Should the journal be per-document or global? Per-document is simpler to reason
  about; global makes cross-document undo possible, which nobody has asked for.
- How is a crash reported to the user without being alarming? "Recovered your work
  from 14:32" is reassuring; a stack trace is not.
