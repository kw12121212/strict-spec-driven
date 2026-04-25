# 09 Repeatable Real Project Regression Tests

## Goal
Create a repeatable end-to-end regression suite around a real todo project fixture so script decomposition can continue without relying only on isolated unit-style fixtures or one monolithic test runner.

## In Scope
- Add a repository-contained real todo project fixture under `test/fixtures/projects/` with enough source files and workflow state to exercise normal CLI, roadmap, and migration behavior.
- Keep the fixture as committed baseline input and run tests against a fresh copied workspace in a temporary directory on every scenario so test runs remain repeatable and do not mutate the committed fixture.
- Split the current large `test/run.ts` runner into smaller test modules and shared helpers for fixture copy, reset, command execution, and artifact assertions.
- Cover CLI, roadmap, migration, and validation scenarios against the copied todo project fixture instead of relying only on single-file YAML examples.
- Preserve deterministic outputs, repeatable diagnostics, and clean fixture reset behavior across repeated test runs in the same process and across separate invocations.

## Out of Scope
- Turning the repository into a generic multi-project fixture farm with many unrelated demo apps.
- Introducing flaky external services, network dependencies, or long-lived background infrastructure into the test workflow.
- Replacing all existing focused YAML fixtures that still provide useful narrow validation coverage.

## Done Criteria
- A committed real todo project fixture exists with enough workflow and source structure to exercise init, propose, list, modify, verify, roadmap-status, roadmap-sync, and migrate style scenarios.
- Every project-level scenario copies the fixture into a fresh temporary workspace before running commands and cleans that workspace afterward so the committed baseline stays unchanged.
- `test/run.ts` is reduced to a thin orchestration layer or replaced by smaller modular suites plus shared helpers rather than remaining a single very large script.
- The regression suite can run the same todo-project scenarios repeatedly and produce consistent pass or fail results, output shapes, and diagnostics.
- Milestones 07 and 08 can use this suite as the shared acceptance gate for command-surface and domain-module refactors.

## Planned Changes
- `create-real-todo-project-fixture` - Declared: planned - add a committed todo project fixture under `test/fixtures/projects/` with realistic source files, repository metadata, and workflow artifacts that exercise the strict CLI meaningfully.
- `add-repeatable-project-copy-and-reset-harness` - Declared: planned - add shared test helpers that copy the committed todo project fixture into a temporary workspace, run commands there, and clean up afterward so tests are repeatable.
- `split-monolithic-test-runner-into-modules` - Declared: planned - decompose `test/run.ts` into smaller suites and helpers for CLI, roadmap, migration, validation, and project-fixture scenarios.
- `add-todo-project-cli-regression-scenarios` - Declared: planned - cover init, propose, list, modify, cancel, verify-spec-mappings, and other command-surface behavior against the copied todo project fixture.
- `add-todo-project-roadmap-and-migration-scenarios` - Declared: planned - cover roadmap-status, roadmap-sync, migrate, and related artifact assertions against the copied todo project fixture and its expected outputs.
- `prove-todo-project-suite-repeatability` - Declared: planned - add explicit checks that the same copied-fixture scenarios can run repeatedly without baseline drift and with deterministic diagnostics or output ordering.

## Dependencies
- Milestones 07 and 08 define the refactor scopes whose safety this suite must guard, but this shared regression harness should land before either milestone is declared complete.
- Existing narrow YAML fixtures should remain in place as fast focused checks while this project-level suite becomes the broader acceptance gate.

## Risks
- A fixture that is too toy-like may fail to catch the integration breakages that matter during script decomposition.
- A fixture that is too large or too snapshot-heavy could become noisy to maintain and discourage frequent updates.
- If copied-workspace reset rules are not explicit, repeated test runs could accidentally pass only because stale temp state leaked between scenarios.

## Status
- Declared: proposed

## Notes
- Current evidence: `test/run.ts` is about 5949 lines and the existing fixtures are mostly single-file YAML cases under `test/fixtures/validation/` and small roadmap Markdown inputs under `test/fixtures/roadmap/`.
- The todo project fixture should be realistic enough to represent a consumer repository, but small enough to be copied and tested repeatedly inside normal local and CI runs.
