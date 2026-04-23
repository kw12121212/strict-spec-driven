# Tasks: port-verify-to-yaml

## Implementation
- [x] Create `src/verify.ts` with `verifyChange()` that reads and schema-validates all change artifacts (proposal, design, tasks, questions) against registered schemas
- [x] Add task completion check (all tasks must be `status: complete`) and open questions check (`open` list must be empty)
- [x] Add testing gates validation that resolves `validation_task` and `unit_test_task` references against the Testing section task IDs
- [x] Add delta spec validation for all `.yaml` files under the change `specs/` directory against the delta-spec schema
- [x] Add exclusive active target enforcement that scans sibling active changes for overlapping MODIFIED/REMOVED target_requirement values
- [x] Register `verify` subcommand in `strict-spec-cli.ts` with change name argument, JSON output, and non-zero exit on invalid state
- [x] Export new verify functions from `strict-spec-cli.ts` for test access

## Testing
- [x] Run `bun run build` — build validation
- [x] Run `bun test/run.ts` — unit tests covering valid change, incomplete tasks, open questions, invalid testing gates, malformed delta specs, exclusive target conflicts, and missing change errors

## Verification
- [x] Verify implementation matches proposal scope
