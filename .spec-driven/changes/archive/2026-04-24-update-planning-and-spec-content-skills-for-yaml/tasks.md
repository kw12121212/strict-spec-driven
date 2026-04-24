# Tasks: update-planning-and-spec-content-skills-for-yaml

## Implementation

- [x] Rewrite `strict-spec-brainstorm` and `strict-spec-simple-task` so they use
      explicit strict CLI command mappings and `.strict-spec-driven/` YAML
      workflow guidance.
- [x] Rewrite `strict-spec-spec-edit`, `strict-spec-sync-specs`, and
      `strict-spec-resync-code-mapping` to describe strict YAML spec editing and
      mapping-repair behavior.
- [x] Extend `src/skills.ts` with validation expectations for the planning skill
      family and keep `strict-spec-spec-content` out of the strict package
      surface.
- [x] Update or add automated checks in `test/run.ts` for passing and failing
      strict planning-skill content states.

## Testing

- [x] Run `bun run validate-skills` — validation coverage for strict planning
      skill command references and packaging expectations.
- [x] Run `bun test/run.ts` — unit tests for strict planning skill content and
      validation behavior.

## Verification

- [x] Verify implementation matches proposal scope and does not add a separate
      `strict-spec-spec-content` package.
