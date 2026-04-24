# Design: update-planning-and-spec-content-skills-for-yaml

## Approach

Implement the change in three passes:

1. Replace placeholder planning-skill prompts with strict YAML workflow guidance
- author concrete `SKILL.md` content for `strict-spec-brainstorm`,
  `strict-spec-simple-task`, `strict-spec-spec-edit`,
  `strict-spec-sync-specs`, and `strict-spec-resync-code-mapping`
- give each skill an explicit command table that points at the strict bundled
  CLI subcommands it actually uses
- update prompt prose so these skills talk about `.strict-spec-driven/` YAML
  artifacts rather than generic or packaging-only placeholders

2. Extend validation for the planning/documentation skill family
- add a dedicated expectation set in `src/skills.ts` for the planning skills
  that are still scaffolds today
- require explicit command mappings, strict workflow directory references, and
  the core headings or guidance snippets needed for each skill's role
- keep the checks deterministic so `validate-skills` produces clear diagnostics
  when a planning skill regresses to a stub

3. Keep the strict planning surface aligned with the current reference workflow
- do not add a separate `strict-spec-spec-content` package
- preserve the split where `strict-spec-modify` handles delta-spec edits inside
  changes and `strict-spec-spec-edit` handles direct main-spec edits
- add or update automated tests so the planning-skill surface is protected by
  validation and smoke coverage instead of prompt review alone

## Key Decisions

- Align with the current reference workflow and keep `spec-content` out of the
  strict skill surface instead of reintroducing a separate strict package.
- Limit this change to planning/documentation skills rather than mixing in
  roadmap, maintenance, or ship workflows.
- Treat planning-skill content validation as part of the observable contract so
  placeholder stubs cannot pass as complete simply because package metadata and
  symlinks are valid.

## Alternatives Considered

- Follow the roadmap item literally and add a new `strict-spec-spec-content`
  skill.
  Rejected because the current reference workflow removed that dedicated skill
  and now covers its responsibilities through `modify` and `spec-edit`.
- Rewrite all remaining strict skills in one change.
  Rejected because the roadmap intentionally separates planning/documentation
  skills from roadmap and operations work.
- Update the `SKILL.md` files only and leave validation unchanged.
  Rejected because milestone 04's done criteria require automated validation or
  smoke coverage, not trust in prompt text alone.
