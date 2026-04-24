# port-archive-to-yaml-merge

## What

Implement the strict `archive` lifecycle command so a verified active change can be merged into main strict YAML specs, moved into a date-prefixed archive directory, and reported deterministically.

## Why

Milestone 03 is currently blocked on archive behavior. `propose`, `apply`, and `verify` are already delivered, but the lifecycle cannot complete without deterministic merge and archive mechanics. Downstream roadmap, migration, and self-hosting changes depend on this command being stable.

## Scope

In:
- Add an `archive` CLI subcommand for `.strict-spec-driven/changes/<name>/`
- Require the target change to pass strict verification gates before archive proceeds
- Merge strict YAML delta specs back into main strict YAML specs using stable requirement IDs
- Apply merge edge-case rules from strict delta contracts (missing MODIFIED target becomes ADDED; missing REMOVED target is skipped)
- Move archived changes to `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/` using local date naming
- Regenerate strict specs index artifacts after merge
- Emit deterministic machine-readable archive results (including merge summary and archive destination)
- Add automated tests for happy path and failure/edge cases

Out:
- Roadmap command behavior and roadmap reconciliation UX
- Review command behavior
- New mapping-audit commands (`verify-spec-mappings`)
- Migration from bootstrap `.spec-driven/` Markdown artifacts

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- Existing `init`, `propose`, `apply`, and `verify` command behavior remains unchanged
- Strict artifact schema contracts remain unchanged; this change consumes them
- Build and unit-test command surface remains `bun run build` and `bun test/run.ts`
