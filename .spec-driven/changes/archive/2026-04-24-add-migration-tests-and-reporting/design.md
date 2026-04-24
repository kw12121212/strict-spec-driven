# Design: add-migration-tests-and-reporting

## Approach

**`--force` flag in `migrate` command:** Add a boolean `--force` / `-f` CLI flag parsed in `src/strict-spec-cli.ts` and passed to the `migrate` function in `src/migrate.ts`. When `--force` is set, the existing `.strict-spec-driven/` target check is skipped and the output directory is written unconditionally. All other preflight checks (missing source, malformed config) still apply.

**Deterministic rerun reporting:** Keep rerun output identical to the first successful migration by reporting the required scaffold-asset entries deterministically on every successful run instead of only on the first scaffold creation pass.

**New test sections in `test/run.ts`:** Add new test blocks within or immediately after section [18]. Each block uses a `mkdtempSync` / `try-finally` pattern consistent with the existing migrate tests. Tests call `cli(["migrate"])` or `cli(["migrate", "--force"])` and assert on the parsed JSON report fields.

**Ambiguous migration fixtures:** Write helper functions that create minimal `.spec-driven/` trees with non-standard Markdown (e.g. a spec file with no `### Requirement:` blocks, a spec with an unparseable heading hierarchy). Assert that the report contains `warnings` or `manualFollowUp` entries referencing those files, and that `valid` is still `true` (ambiguous is not fatal).

**Idempotent rerun test:** Run `migrate` once (succeeds), then run `migrate --force` on the same directory, then assert that both runs' stdout are identical.

**Report structure assertions:** Assert that the top-level report keys include `warnings` and `manualFollowUp` arrays (may be empty on the happy path). This normalizes the report contract without locking down content.

**Core workflow artifact converter unit tests:** Import the converter modules from `dist/` the same way section [19] imports `converters/roadmap.js`, and assert round-trip field preservation for proposal, design, tasks, and questions Markdown inputs.

## Key Decisions

- **`--force` over `--clean`:** `--force` is the idiomatic flag name for overwrite permissions and matches the self-hosting use case where a stale `.strict-spec-driven/` exists and must be regenerated.
- **Structural assertions over snapshots:** The existing `test/run.ts` style uses `assert()` calls against parsed fields. Committed JSON snapshots would add brittleness every time report field ordering changes and are inconsistent with the project style.
- **`valid: true` for ambiguous structures:** An ambiguous source file should produce a warning or manual follow-up, not a hard error. Migration should still complete with a `true` validity signal for the convertible artifacts so the user can proceed and fix follow-ups manually.
- **Malformed legacy spec frontmatter stays deferred:** Broken spec frontmatter is treated the same as other unsupported legacy Markdown shapes, so partial migrations keep `valid: true` while warnings and manual follow-up entries preserve the exact source path.
- **Single `test/run.ts` file:** All tests live in `test/run.ts`. No new test files.

## Alternatives Considered

- **Committed snapshot files:** Rejected — inconsistent with project test style and brittle under non-semantic JSON key ordering changes.
- **`--clean` flag that deletes and recreates the target:** Rejected — destructive; `--force` is safer (overwrites individual files without deleting the whole directory first).
- **Separate test file for migration:** Rejected — the project has one `test/run.ts` file; splitting introduces an entry point question.
