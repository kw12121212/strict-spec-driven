# 07 CLI Command Surface Decomposition

## Goal
Reduce the size and coordination burden of the CLI entrypoint layer by splitting command dispatch and CLI-facing helper logic into smaller modules without changing observable command behavior.

## In Scope
- Split `src/strict-spec-cli.ts` into a thin entrypoint plus focused modules for argv normalization, usage text, command registration, dispatch, and top-level error handling.
- Isolate change discovery, archive lookup, path normalization, and CLI-facing status helpers that are currently embedded in the entrypoint.
- Move spec-mapping audit collection, mapping normalization, evidence discovery, and diagnostic sorting out of the entrypoint into dedicated modules with clear ownership.
- Split command handlers into domain-oriented files such as scaffold, change, roadmap, migration, and operations surfaces instead of keeping them inline in one script.
- Preserve command names, flags, exit codes, human-readable output, and machine-readable JSON behavior while the code is reorganized.
- Add or update regression coverage needed to prove the modularized command surface still behaves the same, including scenarios that run against the shared real todo project fixture defined by milestone 09.

## Out of Scope
- Changing workflow semantics, command names, or artifact formats.
- Deep refactors of roadmap, migration, or skill-validation internals beyond helper moves required to support the CLI split.
- Replacing the single-package repository structure with a multi-package workspace.

## Done Criteria
- `src/strict-spec-cli.ts` is reduced to a thin entrypoint and orchestration layer that owns only top-level argv handling, usage fallback, dispatch invocation, and final process exit behavior.
- Command registration and dispatch live in dedicated modules with explicit ownership boundaries instead of being mixed into a long command script.
- Shared CLI helpers for change discovery, archive resolution, path normalization, output shaping, and spec-mapping audit are no longer mixed into the entrypoint.
- Automated coverage confirms list, modify, cancel, archive lookup, roadmap-status, roadmap-sync, and spec-mapping commands keep their existing observable behavior after the split.
- The shared real todo project regression suite from milestone 09 exercises command-surface scenarios against a freshly copied project fixture so CLI decomposition is validated in a repeatable end-to-end environment.

## Planned Changes
- `extract-cli-entrypoint-and-usage-layer` - Declared: complete - move argv normalization, usage rendering, and top-level error or exit handling out of `src/strict-spec-cli.ts` into focused CLI entry modules.
- `extract-cli-command-registry-and-dispatch` - Declared: complete - move command registration and dispatch into dedicated router modules so the entrypoint no longer owns the full command table directly.
- `extract-cli-change-discovery-and-status` - Declared: complete - move change listing, archive matching, and active-status calculation into focused helper modules reused by CLI commands.
- `extract-cli-spec-mapping-audit` - Declared: complete - move spec-mapping parsing, normalization, evidence collection, and diagnostic sorting into dedicated modules instead of keeping them inline in the entrypoint.
- `extract-cli-command-handlers-by-domain` - Declared: complete - split init, propose, verify, review, roadmap, migrate, maintenance, ship, list, modify, and cancel handlers into smaller domain-oriented command modules while preserving outputs.
- `stabilize-cli-output-contracts` - Declared: complete - centralize human-readable and JSON output shaping so command text and machine-readable structures stay stable while modules move.
- `bind-cli-refactors-to-real-todo-project-regression` - Declared: complete - run command-surface scenarios against the shared copied todo project fixture on every test run so CLI decomposition is validated in a repeatable project context.

## Dependencies
- `03-core-strict-workflow` and `06-operations-and-documentation` must remain the behavioral baseline for command outputs and operational surfaces while the entrypoint is decomposed.
- Existing CLI tests and fixture conventions should be preserved so the refactor can prove behavior stability rather than rely on manual inspection.
- The shared real-project regression harness in milestone 09 should exist before this milestone is marked complete, even if some command-surface coverage lands incrementally before that milestone finishes.

## Risks
- Command refactors can accidentally change output text, exit codes, or JSON shapes even when the logic still works.
- Moving shared helpers too early can create circular dependencies between command modules if boundaries are not chosen carefully.
- A superficial file split without cleaner ownership could spread the same complexity across more files instead of reducing it.

## Status
- Declared: complete

## Notes
- Current hotspot evidence: `src/strict-spec-cli.ts` is about 1093 lines and mixes entrypoint setup, command handlers, shared filesystem utilities, and spec-mapping audit logic in one file.
- Current test evidence: `test/run.ts` is about 5949 lines and today relies mostly on temporary-directory and single-fixture assertions, so command-surface decomposition needs a stronger shared project-level regression layer.
- This milestone intentionally focuses on the CLI command surface first so later domain-specific decompositions can happen behind clearer entry boundaries.








