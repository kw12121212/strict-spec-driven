# port-verify-to-yaml

## What

Implement the `verify` CLI subcommand for the strict YAML spec-driven workflow. Given a named active change under `.strict-spec-driven/changes/<name>/`, verify validates all change artifacts (proposal, design, tasks, questions, delta specs) against their registered schemas, checks task completion status, enforces open-question blocking, validates testing gates, checks delta operation consistency, and enforces exclusive active target constraints. It emits deterministic JSON diagnostics to stdout.

## Why

The strict workflow currently has `init`, `propose`, and `apply` subcommands but no verification gate. Without `verify`, there is no quality gate between applying tasks and archiving a change. The reference project enforces schema validity, task completion, unresolved-question blocking, explicit test commands, mapping coverage, and delta conflict detection — all of which must be ported to the strict YAML workflow before archive can function safely.

## Scope

In:
- `verify` CLI subcommand that reads a named active strict change
- Schema validation of proposal.yaml, design.yaml, tasks.yaml, questions.yaml against registered schemas
- Task completion check: all tasks must have status `complete`
- Open questions check: `open` list in questions.yaml must be empty
- Testing gates validation: referenced task IDs must exist and their sections must match
- Delta spec validation: each YAML file under `specs/` validated against delta-spec schema
- Exclusive active target enforcement: MODIFIED/REMOVED targets must not overlap across active changes
- Deterministic JSON output with `valid`, `diagnostics`, and summary fields
- Dist-only execution support (resolves templates from bundled assets)

Out:
- Archive merge behavior (separate planned change `port-archive-to-yaml-merge`)
- Roadmap reconciliation after verify
- Review/reporting of code quality (separate planned change `port-review-to-yaml`)
- Mapping coverage audits (separate planned change `port-spec-mapping-validation-commands`)

## Unchanged Behavior

- `init`, `propose`, and `apply` subcommands remain unchanged
- Existing validation layer (`validation.ts`) is reused, not replaced
- Existing schema registry and bundled schemas are used as-is
- Test command (`bun test/run.ts`) and build command (`bun run build`) remain unchanged
