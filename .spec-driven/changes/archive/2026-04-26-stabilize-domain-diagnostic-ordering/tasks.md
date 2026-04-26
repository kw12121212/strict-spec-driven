# Tasks: stabilize-domain-diagnostic-ordering

## Implementation

- [x] Create `src/diagnostics.ts` with shared deterministic ordering and normalization helpers usable by roadmap, skill-validation, and migration code
- [x] Update `src/roadmap/shared.ts`, `src/skills.ts`, and `src/migrate.ts` to consume the shared helper without changing their current diagnostic fields or command outputs
- [x] Add regression coverage in `test/suites/entrypoint-and-skills.ts` and `test/suites/roadmap-and-migration.ts` proving repeated invalid runs preserve the same diagnostic or report ordering

## Testing

- [x] Run `bun run build` — build and typecheck the shared diagnostic helper and updated domain modules
- [x] Run `bun test/run.ts` — unit tests confirm deterministic diagnostic ordering across roadmap, skills, and migration flows

## Verification

- [x] Verify implementation matches proposal scope
- [x] Verify `roadmap-status`, `validate-skills`, and `migrate` preserve stable diagnostic or report ordering across repeated runs
