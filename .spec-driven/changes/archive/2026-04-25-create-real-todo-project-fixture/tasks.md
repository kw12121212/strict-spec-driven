# Tasks: create-real-todo-project-fixture

## Implementation

- [x] Add one committed todo-project fixture under `test/fixtures/projects/` with realistic repository metadata, source files, and strict workflow artifacts.
- [x] Seed the fixture with enough baseline project state to support future CLI, roadmap, and migration scenarios without needing per-test fixture assembly.
- [x] Keep the fixture intentionally compact and document or encode only the baseline structure needed for follow-on regression work in milestone 09.

## Testing

- [x] Run `bun run build` — build validation for the fixture-backed repository state and any supporting test wiring.
- [x] Run `bun test/run.ts` — unit tests covering the committed todo-project fixture baseline.

## Verification

- [x] Verify implementation matches proposal scope and does not absorb copy/reset harness or scenario-suite work from later planned changes.
