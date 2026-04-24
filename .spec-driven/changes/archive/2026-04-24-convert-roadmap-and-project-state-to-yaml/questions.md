# Questions: convert-roadmap-and-project-state-to-yaml

## Open

<!-- No open questions -->

## Resolved

- [x] Q: Should the roadmap converter live inside `src/migrate.ts` or in a dedicated `src/converters/roadmap.ts` module?
  Context: `src/migrate.ts` is 56 KB; a dedicated module enables isolated testing.
  A: Split into `src/converters/roadmap.ts`. Confirmed by user.
