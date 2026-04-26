---
mapping:
  implementation:
    - src/cli/output.ts
    - src/cli/cmd-change.ts
    - src/cli/cmd-migration.ts
    - src/cli/cmd-operations.ts
    - src/cli/cmd-roadmap.ts
    - src/cli/cmd-scaffold.ts
  tests:
    - test/suites/change-lifecycle.ts
    - test/suites/foundation-and-fixtures.ts
    - test/suites/operations.ts
    - test/suites/roadmap-and-migration.ts
---

## ADDED Requirements

### Requirement: cli-shared-output-helpers
The system MUST provide a shared `src/cli/output.ts` module with typed helpers for writing JSON, human-readable text, usage hints, and error messages to stdout and stderr so command modules do not call `process.stdout.write` or `process.stderr.write` directly.

#### Scenario: json output is written through shared helper
- GIVEN a CLI command produces a structured result
- WHEN the command writes its result
- THEN the JSON is written via the shared `writeJson` helper
- AND the output format is identical to the pre-centralization behavior

#### Scenario: error output is written through shared helpers
- GIVEN a CLI command encounters a usage or runtime error
- WHEN the command writes its error or usage hint
- THEN the message is written via `writeUsage` or `writeError` as appropriate
- AND the stderr format is identical to the pre-centralization behavior
