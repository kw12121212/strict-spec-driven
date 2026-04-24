# Tasks: convert-core-workflow-artifacts-to-yaml

## Implementation

- [x] Implement legacy main-spec and delta-spec converters for requirement,
      scenario, operation, and mapping structures in `strict-spec-driven
      migrate`
- [x] Implement active and archived change-artifact converters for proposal,
      design, tasks, and questions YAML outputs while preserving status and
      archive-date behavior
- [x] Extend migration fixtures and report handling so converted core workflow
      artifacts are emitted as converted outputs and unsupported
      roadmap/project-state artifacts remain deferred

## Testing

- [x] Run `bun run build` — build validation for core-workflow migration
      converter integration
- [x] Run `bun test/run.ts` — unit tests covering legacy spec, delta, active
      change, and archived change migration behavior

## Verification

- [x] Verify implementation matches the milestone-05 scope without absorbing
      roadmap/project-state conversion, the migrate skill, self-hosting, or
      milestone-06 operations work
