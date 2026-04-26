# 08 Workflow Domain Module Decomposition

## Goal
Split oversized workflow-domain scripts into smaller modules so roadmap, skill validation, and migration behavior can continue evolving without concentrating unrelated responsibilities in single files.

## In Scope
- Split `src/roadmap.ts` into focused modules for artifact loading, schema or semantic validation, status derivation, canonical index generation, and sync rewrites.
- Split `src/skills.ts` into focused modules for frontmatter parsing, command-snippet validation, symlink checks, marketplace metadata checks, and diagnostic aggregation.
- Split `src/migrate.ts` into focused modules for legacy Markdown parsing, strict artifact building, roadmap and index conversion, reporting, and orchestration.
- Extract shared deterministic helpers such as path normalization, ordered directory walking, and diagnostic sorting only where the same semantics are truly shared across modules.
- Preserve current `.strict-spec-driven/` behavior, schema expectations, diagnostics, generated artifact ordering, and command outputs while the code is reorganized.
- Add or update regression coverage needed to prove roadmap, skill-validation, and migration behavior remains stable after decomposition, including real-project scenarios from milestone 09.

## Out of Scope
- Changing roadmap schema rules, skill packaging rules, migration policy, or strict artifact semantics.
- Reworking product behavior solely to justify a refactor.
- Collapsing unrelated command-surface work back into this milestone when it belongs to milestone 07.

## Done Criteria
- `src/roadmap.ts`, `src/skills.ts`, and `src/migrate.ts` are reduced to thinner orchestration layers or small index modules instead of single large implementation files.
- Roadmap loading, validation, status derivation, canonical rewrite generation, and sync writing are separated into modules with clear interfaces.
- Skill packaging checks are separated by responsibility rather than concentrated in one validator file.
- Migration parsing, conversion, reporting, and orchestration responsibilities are separated into dedicated modules with behavior-preserving tests.
- Deterministic diagnostics, generated artifact ordering, and path normalization behavior remain stable after the split.
- Automated coverage confirms roadmap status and sync, skill validation, and migration outputs remain observably stable after the split, including regression runs against the shared real todo project fixture from milestone 09.

## Planned Changes
- `split-roadmap-load-validate-derive-sync` - Declared: complete - separate roadmap artifact loading, schema validation, semantic validation, status derivation, canonical milestone rebuilding, and sync writes into focused modules instead of one large file.
- `split-skill-packaging-parser-rules-and-fs-checks` - Declared: complete - separate frontmatter parsing, skill-content expectation checks, symlink validation, marketplace metadata validation, and diagnostic sorting into smaller validation modules.
- `split-migration-legacy-parsers-by-artifact-family` - Declared: planned - extract legacy Markdown parsing for specs, proposals, designs, tasks, questions, roadmap files, and index files into dedicated parser modules with explicit interfaces.
- `split-migration-builders-and-converters` - Declared: planned - extract strict artifact builders, roadmap conversion, spec-index conversion, and related helper logic from `src/migrate.ts` into focused converter modules.
- `split-migration-reporting-and-run-orchestration` - Declared: planned - separate migration preflight, deferred-artifact handling, result sorting, manual-follow-up reporting, and write orchestration from content parsing logic.
- `stabilize-domain-diagnostic-ordering` - Declared: complete - centralize deterministic ordering and normalization rules that roadmap, skill-validation, and migration modules must preserve during extraction.
- `bind-domain-refactors-to-real-todo-project-regression` - Declared: planned - validate roadmap, skill-validation, and migration refactors against the shared copied todo project fixture so domain splits are checked in a repeatable project context.

## Dependencies
- `07-cli-command-surface-decomposition` should establish clearer command-surface boundaries first so domain-module splits do not duplicate CLI orchestration concerns.
- Current strict workflow specs and archived changes remain the baseline evidence for expected roadmap, skill, and migration behavior during this refactor.
- The shared real-project regression harness in milestone 09 should exist before this milestone is marked complete so behavior-preserving claims are proven in a reusable project fixture rather than only in isolated temp-dir assertions.

## Risks
- Migration refactors can subtly change generated artifact contents or diagnostic ordering if converters and reporting are separated without strong regression coverage.
- Roadmap and skill-validation code both depend on deterministic diagnostics, so careless module extraction can change user-visible error ordering.
- If the split is done only by file count instead of responsibility boundaries, the resulting modules may still be hard to extend safely.

## Status
- Declared: proposed

## Notes
- Current hotspot evidence: `src/migrate.ts` is about 2034 lines, `src/roadmap.ts` about 1046 lines, and `src/skills.ts` about 984 lines.
- Current test evidence: `test/run.ts` is about 5949 lines, so part of the decomposition safety story is to stop relying on one monolithic runner as the only integration surface.
- This milestone follows milestone 07 so CLI dispatch concerns stay separate from deeper domain-logic decomposition.



