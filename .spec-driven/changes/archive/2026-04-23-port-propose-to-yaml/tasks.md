# Tasks: port-propose-to-yaml

## Implementation

- [x] Rename the CLI entry source filename from `src/index.ts` to
      `src/strict-spec-cli.ts` and update related source references.
- [x] Add strict CLI `propose` routing and name-validation behavior for
      `.strict-spec-driven/changes/<name>/` scaffolding.
- [x] Implement YAML artifact template seeding for `proposal.yaml`,
      `design.yaml`, `tasks.yaml`, and `questions.yaml` plus `specs/`
      initialization.
- [x] Add deterministic propose output, duplicate-change protection tests, and
      entrypoint-reference coverage.

## Testing

- [x] Run `bun run build` — build validation for strict propose command and
      template scaffolding integration
- [x] Run `bun test/run.ts` — unit tests covering strict propose creation,
      name validation, and duplicate-change rejection

## Verification

- [x] Verify implementation matches proposal scope
