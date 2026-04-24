# Design: add-strict-spec-migrate-skill

## Approach

Implement the change in three passes:

1. Define the migration skill contract in delta specs
- add migration skill command and guidance requirements under
  `contracts/yaml-artifacts.md`
- add automated validation coverage requirements under `cli/foundation.md`

2. Add the strict migration skill package
- create `skills/strict-spec-migrate/SKILL.md`
- wire concrete command mappings around the existing strict CLI surfaces needed
  for migration and post-migration validation
- keep report review and manual follow-up decisions in prompt guidance instead
  of inventing new CLI behavior

3. Extend deterministic validation and test coverage
- teach `src/skills.ts` to treat the migration skill as a required validated
  strict skill surface
- update `test/run.ts` to cover passing and failing migration skill content
  states

## Key Decisions

- Model migration as its own strict skill surface instead of folding it into the
  general planning skill group, because the roadmap calls it out as a distinct
  operator workflow.
- Reuse existing strict CLI commands for migration execution and validation
  rather than inventing a migration-only validation command.
- Keep manual follow-up triage in prompt guidance while the CLI remains the
  source of deterministic report data and schema validation.

## Alternatives Considered

- Start milestone 06 maintenance, ship, packaging, or documentation work first.
  Rejected because the roadmap explicitly places those items after the migration
  milestone.
- Treat migration guidance as README-only documentation instead of a skill
  package. Rejected because the milestone requires a reusable migration skill,
  not prose-only documentation.
- Add `strict-spec-migrate` without validation coverage. Rejected because the
  repository already treats strict skills as validated product surface, and an
  unchecked migration skill would regress that standard.
