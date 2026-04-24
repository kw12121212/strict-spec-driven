# port-review-to-yaml

## What

Implement a `review` subcommand that reads strict YAML change artifacts (proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and delta specs) from an active `.strict-spec-driven/changes/<name>/` directory along with structured verification evidence, then reports code-quality findings as deterministic JSON.

## Why

The strict workflow lifecycle is missing its `review` step. Six of seven milestone 03 planned changes are archived; closing this one completes the full propose → apply → verify → archive → review lifecycle and unblocks milestone 04 (Strict Workflow Skills and Roadmap), which declares an explicit dependency on milestone 03.

Review is distinct from verify: verify enforces lifecycle gates (schema validity, task completion, open questions), while review reports code-quality observations (clarity of requirements, mapping coverage adequacy, delta spec coherence) that do not block archiving but inform agent-assisted improvement.

## Scope

In scope:
- New `src/review.ts` module implementing review artifact reading and finding generation
- `review` subcommand registration in `src/strict-spec-cli.ts`
- New `cli-review-*` requirements in the delta spec for `specs/cli/foundation.md`
- Test coverage in `test/run.ts` for review happy path and edge cases

Out of scope:
- Modifying or duplicating verify gates (schema validation, task completion, open questions)
- Roadmap-aware review or cross-change comparison
- CI integration or review report persistence

## Unchanged Behavior

- `verify` behavior and exit codes must not change
- All existing subcommands (`init`, `propose`, `apply`, `verify`, `archive`, `list`, `modify`, `cancel`, `verify-spec-mappings`) must continue to work as before
- The strict YAML schema contracts and schema registry are read-only from this change's perspective
