# Design: port-archive-to-yaml-merge

## Approach

1. Add a new archive module (for example `src/archive.ts`) that owns:
- loading active change artifacts and delta specs
- running pre-archive gates (schema validity, complete tasks, no open questions)
- applying delta operations to target main specs deterministically
- writing merged specs and archive metadata/report output

2. Register `archive` in `src/strict-spec-cli.ts` with the same command-shape guardrails as existing commands:
- validate `archive <change-name>` argument shape
- emit stderr on user/validation failures
- emit deterministic JSON to stdout on success

3. Implement deterministic merge flow:
- collect delta files under the change `specs/` tree
- resolve each delta target to the corresponding main strict spec
- apply ADDED, MODIFIED, and REMOVED by stable requirement IDs
- enforce missing-target rules from contract
- preserve non-targeted requirements and scenario ordering

4. After successful merge:
- regenerate strict specs index content from merged spec state
- move the active change directory into `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/`
- include merge outcomes (added, replaced, removed, skipped) in archive report output

5. Extend `test/run.ts` with archive coverage:
- successful archive path with spec merge + archive move
- incomplete task/open question/schema-failure preconditions
- missing MODIFIED target fallback to ADDED
- missing REMOVED target skip behavior
- archive destination naming and collision handling

## Key Decisions

- Keep archive merge semantics in one dedicated module so lifecycle state transitions are easy to test and reason about.
- Reuse existing verify-style gates for pre-archive eligibility instead of duplicating validation logic in multiple places.
- Keep merge behavior deterministic and report every non-trivial outcome (especially missing-target fallbacks/skips) to avoid silent drift.
- Regenerate spec indexes as part of archive rather than a separate manual step so archive is a complete lifecycle boundary.
- Use date-prefixed archive directories to preserve historical ordering and parity with roadmap expectations.

## Alternatives Considered

- Archive without pre-validation: rejected because it could persist invalid/incomplete change state into archived history.
- Fail archive when MODIFIED/REMOVED target is missing: rejected because strict delta contract already defines deterministic fallback/skip behavior.
- Put archive merge logic directly in the CLI router: rejected to avoid a large command file and to keep merge behavior unit-testable.
