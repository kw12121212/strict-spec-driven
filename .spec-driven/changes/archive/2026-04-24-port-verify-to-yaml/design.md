# Design: port-verify-to-yaml

## Approach

1. Create `src/verify.ts` with a `verifyChange()` function that orchestrates all verification checks for a named active change directory.

2. The verify function reads each artifact file (proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and any delta specs under specs/), validates them against their registered schemas, and collects diagnostics from each check into a single result.

3. Structural checks run in order:
   - **Schema validation**: each artifact validated against its registry-looked-up schema using `validateArtifact()`
   - **Task completion**: all tasks across all sections must have `status: complete`
   - **Open questions**: `questions.yaml` `open` list must be empty
   - **Testing gates**: `tasks.yaml` `testing_gates.validation_task` and `testing_gates.unit_test_task` must reference existing task IDs within the Testing section
   - **Delta spec validation**: each `.yaml` file under the change `specs/` directory validated against the delta-spec schema
   - **Exclusive active target**: for each active change's delta specs, collect MODIFIED and REMOVED `target_requirement` values and reject overlaps across different active changes

4. Output is a deterministic JSON object with `valid` (boolean), `diagnostics` (array), `changeName`, `totalTasks`, `completeTasks`, `remainingPending`, and `openQuestionCount`.

5. Register `verify` as a CLI subcommand in `strict-spec-cli.ts` following the same pattern as `apply`.

## Key Decisions

- **Reuse validation.ts primitives**: `validateArtifact()` with `DuplicateIdRule` and `ReferenceCheckRule` already handles schema, duplicate-ID, and reference checks. The verify orchestrator calls these rather than reimplementing validation.
- **All diagnostics in one pass**: verify collects all diagnostics rather than stopping at the first failure, so the user can fix multiple issues in one iteration.
- **Testing gates check task existence, not execution**: verify validates that the referenced task IDs exist in the Testing section; it does not run the commands.
- **Exclusive active target scans all active changes**: to enforce the constraint that a requirement ID is not MODIFIED or REMOVED in multiple active changes simultaneously, verify scans the sibling change directories.

## Alternatives Considered

- **Stop-on-first-failure**: rejected because the reference workflow reports all issues at once, which is more productive for the user.
- **Run test commands during verify**: rejected because verify is a static analysis gate, not an execution environment. Running commands would conflate verify with CI behavior.
- **Separate verify into multiple subcommands**: rejected because the reference project has a single `verify` that runs all checks. Splitting would add complexity without benefit.
