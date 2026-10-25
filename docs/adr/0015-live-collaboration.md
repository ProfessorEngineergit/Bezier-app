# ADR 0015: Live collaboration: the server orders edits, every device builds the model

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

Several people should be able to work on one model at the same time, as cloud CAD
allows: open a shared project and it is current, see the others' edits
appear while you work, see who else is in it. A first attempt made shared
projects into copies that were sent and merged when someone left them, like
Some modellers sync files; it worked but felt like a file exchange, not like working
together, and needed a commit tree to explain itself.

Bezier is local-first: the geometry kernel runs on each device (ADR 0001), and a
document is its history, a list of journal operations (ADR 0005, ADR 0009). A
self-hosted server that stores the projects should be able to do so end-to-end
encrypted (`apps/sync-server/DESIGN.md`), so it cannot build models itself.

## Decision

**The server orders edits; every device applies them in that order and rebuilds
the model with its own kernel.** An edit is the short list of journal
operations one action wrote. Each device keeps the model as the server ordered
everyone's edits so far, plus its own edits the server has not sent back yet,
and shows the second applied to the first (`apps/sync-server/client/live-state.ts`). When
someone else's edit arrives, the open session is taken to the new target by the
operations between the two (`diffOperations` in `packages/core/src/journal/`,
`Session.adopt`), written through the journal like any edit, so it is crash-safe
and survives a reopen, but not added to this person's undo.

Two people changing the same thing at once end with the later one in the
server's order. An operation that no longer applies, because the feature it
names was removed meanwhile, is skipped, the same way on every device. There is
no merge step and no conflict to resolve.

This works because of a property the journal already had for replay: every
operation carries the whole state of what it touches (`updateParams` holds every
parameter, not a patch) and applying one depends only on the operation and the
document.

## Evidence

`tools/spikes/live-collab.ts`, against the real kernel (2026-10-07, Node 22,
occt-wasm 5): two separate OCCT instances, three devices with their own stores
and sessions, and edits that cross on the way: both change one extrusion, one
rounds an edge of a box the other is resizing, two bodies are added "at the
end" at once, an undo after others edited, a change to a body someone removed,
then 40 random edits delivered in random order. After each round every device
had the same document, the same status per feature, the same stable name for
every face and the same mesh to the last float. 49 edits, all checks held.

`packages/core/src/journal/diff.test.ts` checks the one promise of
`diffOperations` on 1,600 pairs of documents made from the same start.

## Consequences

- Undo stays personal: it undoes your own edits, written as new operations,
  and skips what someone else removed meanwhile. A write that would not apply
  is now refused before it reaches the journal, since such an entry stops
  every later replay of the document.
- The server never sees a model: edits travel sealed with the vault's key, and
  it stores ciphertext in order.
- A device rebuilds once per batch of incoming edits. On a large model that is
  the same cost as one's own edit.
- Branches and the commit tree of the first attempt stay in `apps/sync-server/client` as
  versions and history but are no longer how people work together.
