# Tasks: add-migration-tests-and-reporting

## Implementation

- [x] Add `--force` / `-f` flag to the `migrate` subcommand in `src/strict-spec-cli.ts` and thread it through to the overwrite-protection check in `src/migrate.ts`
- [x] Preserve the migration report JSON `warnings` and `manualFollowUp` top-level arrays in `src/migrate.ts` and keep successful rerun output deterministic
- [x] Add test helpers and section [18] cases for ambiguous spec Markdown (no requirement blocks, non-standard heading) — assert `warnings` or `manualFollowUp` entries reference those files with `valid: true`
- [x] Add test cases for malformed spec Markdown frontmatter (broken YAML block) — assert warnings/manual follow-up preserve the source path while partial migration remains valid
- [x] Confirm archive date prefix directory handling remains covered by the migrate happy-path assertions that preserve archived change identity in report output
- [x] Add test case for idempotent rerun: run `migrate` then `migrate --force`, assert both stdout outputs are identical
- [x] Add test cases verifying `warnings` and `manualFollowUp` arrays are present in all migration report outputs
- [x] Add unit-level converter tests for core workflow artifacts (proposal, design, tasks, questions) by importing from `dist/` in a new section [20]

## Testing

- [x] Run `bun run build` — build validation after adding `--force` flag and report field changes
- [x] Run `bun test/run.ts` — unit tests covering all new and existing migration test cases

## Verification

- [x] Verify `migrate` without `--force` still exits non-zero when `.strict-spec-driven/` exists
- [x] Verify all new test assertions pass and no previously passing section [18] or [19] tests regress
- [x] Verify implementation matches proposal scope
