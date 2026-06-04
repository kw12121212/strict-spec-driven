# RTK.md

Instructions for AI agents working in this repository.

## What This Repo Is

`strict-spec-driven` is a YAML-first spec-driven development workflow.
It provides the spec-driven lifecycle, skill set, and CLI behavior
for spec-driven development. Specs and related workflow documents are
strict YAML formats that scripts can validate and enforce.

## Product Constraint

All spec-driven artifacts and related documentation formats should be represented
as strict YAML where practical. Scripts should create, parse, and validate YAML
through structured APIs rather than ad hoc text manipulation.

`.strict-spec-driven/` is the single active workflow state for this
repository's self-hosted strict workflow. This repository completed its
migration and retains no root `.spec-driven/` directory; do not recreate one.
A `.spec-driven/` directory is meaningful only as migration *input* in external
projects that still use the legacy Markdown workflow — the `migrate` command and
`/strict-spec-migrate` skill convert such a directory without modifying it. Keep
that external-project migration capability distinct from this repository's own
workflow state.

`.strict-spec-driven/` is reserved for generated or migrated workflow state.
Repository-bundled schema and scaffold assets live under
`templates/strict-spec-driven/` so validators, generators, and init tooling can
consume them without treating them as active project artifacts. Minimal valid
examples live under `examples/strict-spec-driven/` as repository reference
assets and are not part of skill template packaging. Installed skills should
inspect bundled schemas and scaffold templates through the strict CLI's
`schema-list`, `schema-show`, `template-list`, and `template-show` commands
rather than through per-skill `templates` symlinks.

Skills may remain Markdown `SKILL.md` files because they are part of the Agent
Skills packaging format. Skill behavior should be updated only when required to
describe YAML artifact contracts accurately.

## Development Conventions

- Prefer the reference project's TypeScript, ESM, and Node.js conventions unless
  this repository establishes a stricter local pattern.
- Keep scripts responsible for filesystem mechanics, parsing, validation, and
  deterministic format enforcement; keep AI judgment in skill prompts.
- Rebuild compiled output after editing TypeScript sources once this repository
  has a build pipeline.
- Add tests for schema validation, migration, archive/merge behavior, and error
  messages when implementing YAML artifact support.
- Do not silently widen workflow scope. If the desired YAML contract changes,
  update the relevant spec-driven artifacts first.
