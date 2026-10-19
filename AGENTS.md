# AGENTS.md

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
projects that still use the legacy Markdown workflow — the `strict-spec-cli
migrate` command converts such a directory without modifying it. Keep
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

## Scene-First Requirement Routing

A change that touches user-observable behavior answers the scene questions
before a requirement is drafted: who acts and what each actor does, what must
already be true before the main flow begins, what happens step by ordered step
when nothing goes wrong, and what can go wrong, what triggers each exception
flow, and what happens then. The scene is then written down as a delta scene
under the change, before the delta spec, so each requirement is derived from a
flow step rather than recalled.

The scene is mandatory as a question and optional as an artifact. A purely
technical change — a refactor, build or test tooling, repository maintenance, an
architecture constraint, a script, or skill guidance — has no actor flow to
describe, and records why no scene applies instead of inventing one.

Every flow step declares either the requirements covering it or an explicit
reason it is deliberately covered by none, and one step may name covering
requirements across several spec areas. Once a change carries a delta scene,
`ready` and `verify` block on a step naming neither, and the diagnostic names
the runnable command that records it. Checking is triggered by the presence of a
scene, never by the presence of a spec, so a repository holding no scene
observes no new diagnostic. Survey coverage with `strict-spec-cli scene-status`,
author a live scene outside a change with `strict-spec-cli scene-edit`, and a
change-scoped one with `strict-spec-cli generate <change-name> delta-scene`.

## CLI-Only YAML Authoring

CLI code owns YAML shape and filesystem mutation for every repository-owned
strict artifact. An AI workflow expresses each creation, update, named-entry
removal, and whole-artifact deletion through the owning strict CLI command with
named semantic arguments — raw YAML payloads, heredocs, temporary payload
files, arbitrary output paths, and direct file edits are not part of any
supported AI workflow. Read-only YAML inspection is always allowed, and human
manual editing is not technically blocked; the policy governs AI mutation
workflows.

The canonical statement of the protocol is the `strict-spec-cli
yaml-authoring-protocol` command. Follow its ordered steps: read the owning
command's `--help --json`, resolve the schema with `schema-list`/`schema-show`,
inspect the registered example with `sample-list`/`sample-show`, translate
confirmed facts into documented named arguments, execute the owning command,
inspect the structured result, and run the artifact's validation command.
Discover each artifact family's mutation surface with `yaml-surface-list` and
`yaml-surface-show <kind>`.

When a required command, argument, or artifact kind is unavailable, stop and
report the missing capability — the operation, the artifact kind and target,
the missing command or argument, and the discovery commands already consulted.
An unavailable command is a reason to stop, not a reason to improvise.

Declared `schema_file` paths resolve beneath the shared schema cache root
`~/.strict-spec-schemas/` (or `STRICT_SPEC_SCHEMA_CACHE_DIR`), and schema
`example_ref` paths resolve beneath the cached examples tree. Installed skills
never assume a source-repository `templates` or `examples` directory.

## Development Conventions

- Prefer the reference project's TypeScript, ESM, and Node.js conventions unless
  this repository establishes a stricter local pattern.
- Keep scripts responsible for filesystem mechanics, parsing, validation, and
  deterministic format enforcement; keep AI judgment in skill prompts.
- Rebuild compiled output after editing TypeScript sources once this repository
  has a build pipeline.
- Add tests for schema validation, migration, archive/merge behavior, and error
  messages when implementing YAML artifact support.
- Redirect test, lint, and coverage output to a file and read the exit status of
  the command itself, never a pipeline's:

  ```bash
  bun test/run.ts > /tmp/suite.log 2>&1; echo "EXIT=$?"
  grep -n FAIL /tmp/suite.log
  ```

  The suite prints thousands of lines, so a filter is needed to read it — but
  applying that filter with a pipe destroys the evidence. A pipeline's exit
  status is its **last** command's, so `bun test/run.ts | tail -25` reports
  `tail`'s success and silently discards a failing run. Redirecting first keeps
  the full output for analysis and the runner's own status for the pass/fail
  decision. The same applies to `bun scripts/coverage-gate.ts`, whose non-zero
  exit below the declared threshold is a blocking archive gate.
- Do not silently widen workflow scope. If the desired YAML contract changes,
  update the relevant spec-driven artifacts first.
