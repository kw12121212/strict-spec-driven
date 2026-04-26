# Tasks: split-roadmap-load-validate-derive-sync

## Implementation

- [x] Extract roadmap-owned constants, path helpers, deterministic diagnostics, and file discovery helpers from `src/roadmap.ts` into focused support modules under `src/roadmap/`
- [x] Extract roadmap artifact validation and load orchestration into dedicated modules that `getRoadmapStatus` and `syncRoadmap` consume without changing current validation semantics
- [x] Extract change-state derivation, milestone ordering, canonical artifact rebuilding, and sync write behavior into dedicated modules, leaving `src/roadmap.ts` as a thin orchestration surface

## Testing

- [x] Run `bun run build` — build and typecheck the refactored roadmap modules end-to-end
- [x] Run `bun test/run.ts` — run unit tests covering roadmap status and roadmap sync behavior after the extraction

## Verification

- [x] Verify implementation matches proposal scope
