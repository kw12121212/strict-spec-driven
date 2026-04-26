# Questions: stabilize-domain-diagnostic-ordering

## Open

<!-- No open questions -->

## Resolved

- [x] Q: Where should the shared diagnostic-ordering helper live?
  Context: The proposal needs a concrete shared module boundary before it can
  define implementation scope and spec mappings.
  A: Create a new shared `src/diagnostics.ts` module rather than attaching the
  helper to a roadmap-owned file or a broader new directory tree.
