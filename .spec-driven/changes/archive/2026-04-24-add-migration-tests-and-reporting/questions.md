# Questions: add-migration-tests-and-reporting

## Open

<!-- No open questions -->

## Resolved

- [x] Q: Does the migration command support a `--force` / overwrite flag for idempotent rerun testing?
  Context: The planned change requires testing idempotent reruns, but the current `migrate` command blocks on a non-empty target. A rerun test requires either a `--force` flag or unit-level-only coverage.
  A: Add a `--force` flag to the migrate command as part of this change and test rerun behavior end-to-end.

- [x] Q: Should "report snapshots" be committed JSON fixture files or structural assertions?
  Context: "Report snapshots" can mean either disk-committed fixtures the test diffs against, or in-test structural assertions. The choice affects whether new fixture files are needed.
  A: Stay consistent with the existing pattern — structural assertions in `test/run.ts`. No committed snapshot files.
