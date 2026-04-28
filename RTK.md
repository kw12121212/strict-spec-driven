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

`.strict-spec-driven/` is the preferred active workflow state for this
repository's self-hosted strict workflow. `.spec-driven/` remains preserved as
bootstrap or migration input and should not be treated as an equivalent active
target.

`.strict-spec-driven/` is reserved for generated or migrated workflow state.
Repository-bundled schema and example assets live under
`templates/strict-spec-driven/` so validators, generators, and init tooling can
consume them without treating them as active project artifacts.

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
