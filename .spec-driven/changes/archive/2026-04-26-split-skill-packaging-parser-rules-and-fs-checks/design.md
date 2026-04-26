# Design: split-skill-packaging-parser-rules-and-fs-checks

## Approach

Mirror the module layout that `split-roadmap-load-validate-derive-sync` established for `src/roadmap/`. Create a `src/skills/` directory with five files, each covering one cohesive responsibility, and convert `src/skills.ts` into a thin re-export and orchestration layer.

**Module boundaries (derived from current function groupings in `src/skills.ts`):**

- `src/skills/model.ts` (L1–253) — `SkillPackagingDiagnostic`, `SkillPackagingValidationResult`, `SkillFrontmatter`, `SkillContentExpectation`, shared constants (`REQUIRED_METADATA_FIELDS`, `EXPECTED_SCRIPT_SYMLINK`, `EXPECTED_TEMPLATE_SYMLINK`, `COMMAND_PREFIX`, `GENERIC_COMMAND_PLACEHOLDER`), and the `makeDiagnostic` factory (L255–319)
- `src/skills/frontmatter.ts` (L321–439) — `validateFrontmatterFields`, `validateLegacyReferences`
- `src/skills/content.ts` (L441–723) — `validateSkillContentAgainstExpectation`, the four domain-specific content validators (`validateCoreSkillContent`, `validateRoadmapSkillContent`, `validatePlanningSkillContent`, `validateMigrationSkillContent`), and `validateCommandSection`
- `src/skills/fs-checks.ts` (L725–894) — `validateRequiredSymlink`, `validateMarketplaceMetadata`
- `src/skills/diagnostics.ts` (L896–907) — diagnostic sorting/normalization helper
- `src/skills.ts` → thin orchestrator: imports from `src/skills/*`, assembles `validateSkillPackages`, re-exports public types

## Key Decisions

**Keep `src/skills.ts` as the public entry point.** Any code that currently imports from `src/skills.ts` continues to work without changes. The orchestrator re-exports `SkillPackagingDiagnostic`, `SkillPackagingValidationResult`, and `validateSkillPackages` from the same path.

**Do not move the public export path.** `src/cli/cmd-operations.ts` imports from `src/skills.js`. Keeping the same entry-point module avoids ripple changes to callers.

**Follow line-range boundaries, not a top-down rewrite.** The current function structure already maps cleanly to the five modules. Move functions in groups rather than restructuring their internals.

## Alternatives Considered

**Merge content + fs-checks into one validator module.** Rejected — symlink and metadata checks are filesystem concerns that are logically separate from content expectation checks. Keeping them separate matches the stated roadmap scope and makes each module independently testable.

**Flatten all helpers into a single `src/skills/validation.ts`.** Rejected — this would reproduce the original problem (one large file with mixed responsibilities) under a different name.
