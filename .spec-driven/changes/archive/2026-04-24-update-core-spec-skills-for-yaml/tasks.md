# Tasks: update-core-spec-skills-for-yaml

## Implementation

- [x] Rewrite the nine core `strict-spec-*` lifecycle `SKILL.md` files so they
      describe `.strict-spec-driven/` YAML artifacts and the strict lifecycle
      responsibilities they own.
- [x] Replace generic command placeholders in those core skills with explicit
      strict bundled CLI command mappings for each supported subcommand.
- [x] Extend repository validation or smoke coverage so placeholder-only core
      skill content is rejected and aligned strict command references are
      checked.
- [x] Update or add automated checks that exercise passing and failing core
      strict skill content states.

## Testing

- [x] Run `bun run validate-skills` — validation coverage for strict core skill
      command references and packaging expectations.
- [x] Run `bun test/run.ts` — unit tests for strict core skill content and
      validation behavior.

## Verification

- [x] Verify implementation matches proposal scope
