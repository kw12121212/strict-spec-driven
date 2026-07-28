# strict-spec-driven Architecture

> **Generated file — do not edit by hand.**
> Rendered by `strict-spec-cli architecture-generate` from these source artifacts:
> - `.strict-spec-driven/architecture.yaml`
> - `.strict-spec-driven/config.yaml`
> - `.strict-spec-driven/specs/INDEX.yaml`
> - `.strict-spec-driven/tech/`
>
> Change the sources and re-render; edits made here are discarded by the next render.

## Overview

strict-spec-driven is a YAML-first spec-driven development workflow.
It keeps the existing Agent Skills workflow concept intact, converting all
spec-driven artifacts and related documentation formats into strict YAML schemas.
Scripts create, validate, parse, and enforce those YAML schemas deterministically.
YAML schema enforcement is the primary product constraint.
Tech stack: Bun (runtime and package manager), TypeScript (strict, ESM,
NodeNext), compiled from src/ to dist/ via tsc. Tests run with
`bun test/run.ts` against compiled dist/ output. Build command: bun run build.
Test command: bun test/run.ts.

## Components

### CLI Command Surface (`cli-surface`)

Parses invocations, resolves help requests, dispatches every registered subcommand, and serves the single command-metadata registry that root help, subcommand help, JSON help, and the MCP capability inventory all read their descriptions from.

**Boundaries**

- Owns no workflow behavior; every command delegates to a domain module.
- Does not define command descriptions inline; they live in the metadata registry.

**Depends on:** `schema-validation`

**Implementation**

- `src/strict-spec-cli.ts`
- `src/cli/entrypoint.ts`
- `src/cli/registry.ts`
- `src/cli/argv.ts`
- `src/cli/usage.ts`
- `src/cli/output.ts`
- `src/cli/command-metadata.ts`
- `src/cli/command-metadata-entries.ts`
- `src/cli/fs.ts`

### Schema Registry and Validation (`schema-validation`)

Parses strict YAML, resolves the bundled schema registry, compiles JSON Schema validators, and returns structured diagnostics that every other component reports failures through.

**Boundaries**

- Decides whether an artifact is well formed, never whether its content is the right product decision.
- Reads schemas from the embedded template bundle so an installed CLI needs no repository checkout.

**Implementation**

- `src/validation.ts`
- `src/yaml.ts`
- `src/embedded-templates.ts`
- `src/shared-schema-cache.ts`
- `src/diagnostics.ts`
- `templates/strict-spec-driven/schemas/registry.yaml`

### Scaffolding and Artifact Generation (`artifact-generation`)

Creates the workflow directory scaffold and change scaffolds from bundled templates, and writes or merges planning artifacts from named CLI arguments so no strict YAML is hand-authored by an agent.

**Boundaries**

- Merges fields it was given and never invents requirement, task, or question content.
- Owns file mechanics only; what a change should contain is a skill-prompt decision.

**Depends on:** `schema-validation`

**Implementation**

- `src/scaffold.ts`
- `src/propose-generation.ts`
- `src/task-list.ts`
- `src/cli/cmd-scaffold.ts`
- `src/cli/cmd-generation.ts`

### Change Lifecycle (`change-lifecycle`)

Advances a change from proposed to archived: reports readiness and next state, marks the next pending task complete, verifies artifact structure and task completion, and merges delta specs and delta tech into the main artifacts on archive.

**Boundaries**

- Reports blockers deterministically; it never resolves an open question or decides scope.
- Archive is the only path that mutates main specs and technical standards.

**Depends on:** `schema-validation`, `artifact-generation`, `roadmap`

**Implementation**

- `src/apply.ts`
- `src/verify.ts`
- `src/workflow-state.ts`
- `src/archive.ts`
- `src/cli/cmd-change.ts`
- `src/cli/changes.ts`

### Mapping and Standards Audit (`mapping-audit`)

Audits that spec implementation and test mappings and technical-standard implementation and enforcement mappings resolve to real repository files, and reports the registered standards with their rules and strengths.

**Boundaries**

- Reports drift; it never rewrites a mapping to make an audit pass.

**Depends on:** `schema-validation`

**Implementation**

- `src/cli/spec-mapping.ts`
- `src/cli/tech-mapping.ts`

### Generated Document Rendering (`document-render`)

Provides the machinery both generated-document families share: schema-validated artifact loading, block assembly, generated-banner rendering, deterministic serialization, block-by-block check-mode comparison that attributes drift to a source artifact, and the output-path override.

**Boundaries**

- Owns no artifact of its own; each document family supplies its own blocks and source artifacts.
- Renders whatever blocks it is given and never decides what a document contains.

**Depends on:** `schema-validation`

**Implementation**

- `src/document-render.ts`

### Architecture Document Rendering (`architecture-document`)

Renders ARCHITECTURE.md deterministically from the architecture artifact plus the workflow config, the spec index, and the technical standards, detects drift against the rendered output without writing, and reports architecture artifact validity and implementation-mapping drift.

**Boundaries**

- Owns no source of truth of its own beyond the architecture artifact; specification and standards content is projected, never duplicated.
- Deliberately not wired into verify, ready, or archive; staleness is an on-demand check.

**Depends on:** `document-render`, `schema-validation`, `mapping-audit`

**Implementation**

- `src/architecture.ts`
- `src/cli/cmd-architecture.ts`
- `templates/strict-spec-driven/schemas/architecture.yaml`
- `templates/strict-spec-driven/scaffold/architecture.yaml`

### Design System Document Rendering (`design-system-document`)

Renders DESIGN.md in the design.md interchange format from the optional design-system artifact as YAML front-matter tokens followed by the canonical sections, and reports design-system artifact validity, token and component counts, and implementation and snapshot mapping drift.

**Boundaries**

- Holds visual identity only; observable UI behavior belongs to main specs and UI engineering rules belong to ui-category technical standards.
- Treats the design-system artifact as optional and absent for projects with no user interface; init deliberately does not scaffold it.

**Depends on:** `document-render`, `schema-validation`

**Implementation**

- `src/design-system.ts`
- `src/cli/cmd-design.ts`
- `templates/strict-spec-driven/schemas/design-system.yaml`

### Roadmap Domain (`roadmap`)

Owns milestones and standalone planned changes: their ordering, status derivation, pause and resume state, moves between milestones, recommendation of the next change, reconciliation against active and archived changes, and milestone archive and reopen.

**Boundaries**

- Never creates, modifies, or deletes any artifact under .strict-spec-driven/changes/; it reports stale linkage as a warning naming the repairing command.

**Depends on:** `schema-validation`

**Implementation**

- `src/roadmap.ts`
- `src/roadmap/load.ts`
- `src/roadmap/model.ts`
- `src/roadmap/order.ts`
- `src/roadmap/status.ts`
- `src/roadmap/sync.ts`
- `src/roadmap/validate.ts`
- `src/roadmap/author.ts`
- `src/roadmap/archive.ts`
- `src/roadmap/move.ts`
- `src/roadmap/pause.ts`
- `src/roadmap/reopen.ts`
- `src/roadmap/shared.ts`
- `src/cli/cmd-roadmap.ts`
- `src/converters/roadmap.ts`

### Standard Operating Procedures (`sop`)

Creates, lists, shows, edits, and validates categorized operator-facing procedures, where the bundled category definition drives the interview questions and the deterministic constraints enforced over each SOP.

**Boundaries**

- Categories are bundled data, so adding or tuning a category requires no code change.

**Depends on:** `schema-validation`

**Implementation**

- `src/sops.ts`
- `src/sop-categories.ts`
- `src/cli/cmd-sops.ts`

### Harness (`harness`)

Infers and validates the project harness declaration, plans and starts and stops declared long-running components, reports their status and logs, and records harness investigation sessions with their evidence.

**Boundaries**

- Starts only components the harness declaration names; it never guesses undeclared startup steps.

**Depends on:** `schema-validation`

**Implementation**

- `src/harness.ts`
- `src/cli/cmd-harness.ts`

### Legacy Migration and Maintenance (`migration`)

Converts a legacy Markdown .spec-driven/ directory into strict YAML under .strict-spec-driven/ with a structured migration report, and runs configured maintenance checks over the strict workflow state.

**Boundaries**

- Treats the legacy directory strictly as read-only input and never modifies it.

**Depends on:** `schema-validation`, `artifact-generation`

**Implementation**

- `src/migrate.ts`
- `src/migrate/preflight.ts`
- `src/migrate/reporting.ts`
- `src/migrate/shared.ts`
- `src/migrate/parsers/specs.ts`
- `src/migrate/parsers/change-artifacts.ts`
- `src/migrate/parsers/shared.ts`
- `src/migrate/converters/specs.ts`
- `src/migrate/converters/changes.ts`
- `src/migrate/converters/roadmap.ts`
- `src/maintenance.ts`
- `src/cli/cmd-migration.ts`

### MCP Server (`mcp-server`)

Exposes a curated subset of workflow commands as MCP tools, prompts, and resources, taking every tool description from the shared command-metadata registry so one command surface is described in one place.

**Boundaries**

- Exposes a curated subset, not every registered CLI command.
- Writes no descriptions of its own; it reads them from the metadata registry.

**Depends on:** `cli-surface`

**Implementation**

- `src/mcp/entrypoint.ts`
- `src/mcp/server.ts`
- `src/mcp/tools.ts`
- `src/mcp/prompts.ts`
- `src/mcp/resources.ts`
- `src/mcp/inventory.ts`
- `src/cli/cmd-mcp-install.ts`

### Skill Packaging (`skill-packaging`)

Validates that every bundled strict skill is packaged correctly: required frontmatter, the workflow-state precheck every non-init skill must perform, the scripts symlink, and agreement between the skill directories and the marketplace metadata.

**Boundaries**

- Validates packaging structure, never the quality of a skill's instructions.

**Depends on:** `schema-validation`

**Implementation**

- `src/skills.ts`
- `src/skills/model.ts`
- `src/skills/frontmatter.ts`
- `src/skills/content.ts`
- `src/skills/fs-checks.ts`
- `src/skills/diagnostics.ts`
- `skills/marketplace.json`

## Data Flows

### Change Lifecycle (`change-lifecycle-flow`)

**Trigger:** An operator or skill proposes a new strict change.

**Components:** `artifact-generation` → `change-lifecycle` → `schema-validation` → `roadmap`

1. propose scaffolds the change directory from bundled change templates.
2. generate writes proposal, design, tasks, questions, and any delta spec or delta tech from named arguments, validating each write against its registered schema.
3. ready reports deterministic handoff blockers before implementation starts.
4. apply marks the next pending task complete, one task at a time, after the work is done.
5. verify checks artifact shape, task completion, and open questions.
6. archive merges delta specs into main specs and delta tech into technical standards, regenerates the spec index, reconciles roadmap status, and moves the change into the archive.

### Generated Document Rendering (`generated-document-render`)

**Trigger:** An operator runs architecture-generate or design-generate, or either with --check to detect staleness.

**Components:** `architecture-document` → `design-system-document` → `document-render` → `schema-validation`

1. The document family's source artifact is read and validated against its registered schema, failing with the artifact path and its authoring entry point when absent.
2. The family builds its own blocks. Architecture renders components, data flows, and decisions from the architecture artifact, then projects the overview from the workflow config context, the specification surface from the spec index and the main specs it references, and the technical standards from the technical standards directory. Design renders YAML front-matter tokens and the canonical design.md sections from the design-system artifact, omitting sections whose token group is absent.
3. The rendered blocks are joined into one document carrying a generated banner that names every source artifact.
4. Write mode writes the document; check mode compares block by block against the file on disk, writes nothing, and exits non-zero naming the source artifacts that went stale.

### Artifact Validation (`artifact-validation-flow`)

**Trigger:** Any command reads a strict YAML artifact.

**Components:** `schema-validation` → `cli-surface`

1. The YAML is parsed with source attribution so parse failures name the artifact.
2. The bundled schema registry resolves the artifact type to its embedded schema.
3. The compiled validator produces structured diagnostics carrying source, artifact path, field path, expected, and actual.
4. The calling command reports those diagnostics and exits non-zero rather than continuing on invalid state.

## Architecture Decisions

### Every workflow artifact is strict YAML (`yaml-first-artifacts`)

**Status:** accepted

All spec-driven workflow artifacts are authored as strict YAML validated against a registered schema, rather than as Markdown prose. Skill files stay Markdown only because the Agent Skills packaging format requires it.

**Rationale:** Machine-validatable workflow state is the product constraint. Markdown prose cannot be validated, parsed, or enforced structurally, so a prose workflow degrades into convention that nothing checks.

**Alternatives considered**

- Keep the legacy Markdown artifacts and add a linter over them, rejected because a linter over prose cannot enforce structure that prose does not have.

### Scripts own mechanics, skills own judgment (`scripts-own-mechanics`)

**Status:** accepted

Filesystem mechanics, parsing, validation, and deterministic format enforcement live in the CLI; product judgment lives in skill prompts.

**Rationale:** Separating deterministic mechanics from probabilistic judgment keeps the workflow reproducible and testable, and keeps agents from hand-rolling YAML that then fails validation.

**Alternatives considered**

- Let skills write artifacts directly, rejected because hand-authored YAML drifts from the schema and cannot be merged idempotently.

### Schemas, scaffolds, and examples are embedded in the compiled CLI (`embedded-bundled-assets`)

**Status:** accepted

Bundled schema, scaffold, and example assets are generated into a single embedded module at build time and read from there, with a shared on-disk cache exported for external inspection.

**Rationale:** An installed CLI must validate and scaffold in projects that have no checkout of this repository, so bundled assets cannot be resolved by walking a relative templates directory at runtime.

**Alternatives considered**

- Ship the templates directory alongside the CLI and resolve it relatively, rejected because packaging and install paths vary across install methods and compiled binaries.

### One active workflow directory (`single-active-workflow-directory`)

**Status:** accepted

.strict-spec-driven/ is the single active workflow state directory. A .spec-driven/ directory is meaningful only as read-only migration input from an external legacy project.

**Rationale:** Two live workflow directories would make every command ambiguous about which state it reads and writes, and would let the legacy format persist indefinitely instead of migrating once.

**Alternatives considered**

- Support both directories concurrently, rejected because it doubles the state surface and invites divergence.

### At most two active changes (`bounded-active-changes`)

**Status:** accepted

The scaffold refuses to create a new change while two other active changes already exist; one must be archived or cancelled first.

**Rationale:** Active changes carry delta artifacts that merge into main specs and technical standards on archive. Unbounded concurrent changes multiply merge conflicts in exactly the artifacts the workflow exists to keep authoritative.

**Alternatives considered**

- Allow unlimited concurrent changes, rejected because delta merge conflicts land in main specs where they are most expensive.

### Human-readable design documentation is rendered, never hand-written (`generated-documents-are-rendered`)

**Status:** accepted

DESIGN.md is generated from the architecture artifact plus existing strict artifacts, carries a generated banner, and is never hand-edited. Its freshness is checked on demand rather than gated in the change lifecycle.

**Rationale:** A hand-maintained architecture document drifts from the code it describes and cannot be validated. Rendering it reduces maintenance to editing validated YAML, and keeping the check on demand avoids penalizing downstream projects that have no architecture artifact yet.

**Alternatives considered**

- Hand-write DESIGN.md and validate only the spec and standard ids it references, rejected because the narrative sections that matter most would still drift unchecked.
- Project DESIGN.md purely from existing artifacts with no new source, rejected because no existing schema holds component boundaries, data flows, or architecture decisions.

## Specification Surface

Projected from `.strict-spec-driven/specs/INDEX.yaml` and the main specs it references.

| Spec | ID | Requirements | Implementation files | Test files |
| --- | --- | --- | --- | --- |
| [Architecture Document Domain Behavior](.strict-spec-driven/specs/architecture/domain-behavior.yaml) | `architecture-domain-behavior` | 6 | 9 | 1 |
| [CLI Foundation](.strict-spec-driven/specs/cli/foundation.yaml) | `cli-foundation` | 176 | 85 | 11 |
| [Strict YAML Artifact Schemas](.strict-spec-driven/specs/contracts/yaml-artifacts.yaml) | `contracts-yaml-artifacts` | 115 | 78 | 7 |
| [Design System Document Domain Behavior](.strict-spec-driven/specs/design/domain-behavior.yaml) | `design-domain-behavior` | 7 | 12 | 1 |
| [Harness Domain Behavior](.strict-spec-driven/specs/harness/domain-behavior.yaml) | `harness-domain-behavior` | 9 | 14 | 5 |
| [Migrate Domain Behavior](.strict-spec-driven/specs/migrate/domain-behavior.yaml) | `migrate-domain-behavior` | 7 | 11 | 1 |
| [Operations Domain Behavior](.strict-spec-driven/specs/operations/domain-behavior.yaml) | `operations-domain-behavior` | 6 | 9 | 1 |
| [Roadmap Domain Behavior](.strict-spec-driven/specs/roadmap/domain-behavior.yaml) | `roadmap-domain-behavior` | 19 | 31 | 3 |
| [Sessions Domain Behavior](.strict-spec-driven/specs/sessions/domain-behavior.yaml) | `sessions-domain-behavior` | 4 | 10 | 3 |
| [SOP Domain Behavior](.strict-spec-driven/specs/sop/domain-behavior.yaml) | `sop-domain-behavior` | 5 | 4 | 1 |
| [Testing Coverage Gate](.strict-spec-driven/specs/testing/coverage-gate.yaml) | `testing-coverage-gate` | 4 | 3 | 1 |

## Technical Standards

Projected from `.strict-spec-driven/tech/`. MUST rules are binding; SHOULD rules are the default.

### [CLI Command Metadata](.strict-spec-driven/tech/cli-command-metadata.yaml) (`cli-command-metadata`) — architecture

- **MUST** `single-source-command-descriptions` — Every registered strict CLI command MUST have an entry in the shared command-metadata registry, and root help, subcommand help, JSON help, and the MCP capability inventory MUST derive their command descriptions from that registry rather than from inline string literals.
- **MUST** `help-describes-argument-semantics` — A command-metadata entry MUST document each accepted flag's meaning together with its required, repeatable, and reset semantics, plus the command's output keys and exit-code meaning; describing operational semantics only in skill prompts instead of the metadata registry is not sufficient.

### [TypeScript ESM Baseline](.strict-spec-driven/tech/typescript-esm-baseline.yaml) (`typescript-esm-baseline`) — coding

- **MUST** `esm-typescript-only` — Source modules MUST be authored in strict TypeScript using ESM syntax with NodeNext resolution, compiled from src/ to dist/.
- **MUST** `rebuild-after-source-edits` — Compiled output MUST be rebuilt after editing TypeScript sources before relying on dist/ behavior or running the dist-based test suite.
- **SHOULD** `tests-verify-observable-behavior` — Tests SHOULD verify observable behavior described in specs and prefer real dependencies over mocks for code the project owns.

### [Workflow Regression Coverage](.strict-spec-driven/tech/workflow-regression-coverage.yaml) (`workflow-regression-coverage`) — testing

- **MUST** `cover-workflow-critical-behaviors` — Changes that implement or alter YAML artifact support MUST add or update tests covering the workflow-critical behaviors they touch: schema validation, migration, archive and delta-merge behavior, and the error messages surfaced on invalid input.
- **MUST** `enforce-minimum-coverage` — The complete project regression command recorded in review_evidence.project_regression MUST enforce the minimum src/** line coverage declared in the workflow config coverage contract, exiting non-zero below the declared threshold; the threshold MUST start at the measured baseline and only be raised deliberately, never silently lowered or removed.
- **MUST** `test-helpers-isolate-developer-home` — Test helpers that spawn CLI subprocesses or exercise startup paths with home-directory side effects MUST redirect HOME, USERPROFILE, and recognized cache-root environment overrides to per-run temporary directories by default, with explicit per-call environment overrides still taking precedence, so the test suite never writes the developer's real home directory on any platform.

### [Workflow Scope Discipline](.strict-spec-driven/tech/workflow-scope-discipline.yaml) (`workflow-scope-discipline`) — architecture

- **MUST** `contract-first-scope-changes` — When a change alters a workflow contract — a registered schema, a main or delta spec, or a technical standard — the corresponding strict artifact MUST be updated first; implementation code MUST NOT silently widen workflow scope ahead of the contract it depends on.
- **MUST** `roadmap-commands-do-not-write-change-artifacts` — Roadmap commands MUST NOT create, modify, or delete any artifact under .strict-spec-driven/changes/; when a roadmap operation leaves a change artifact's roadmap linkage stale or otherwise inconsistent, the command MUST report the drift as a non-blocking warning naming the command that repairs it rather than writing the change artifact itself.
- **MUST** `relocated-mappings-declare-their-cleanup` — A change that renames or deletes a file referenced by a strict spec mapping or a technical-standard mapping MUST record the stale mapping entries that archive's additive merge will leave behind, together with the standalone command that removes them, before the change archives.

### [YAML-First Artifact Authoring](.strict-spec-driven/tech/yaml-first-artifacts.yaml) (`yaml-first-artifacts`) — architecture

- **MUST** `artifacts-are-strict-yaml` — All spec-driven workflow artifacts MUST be authored as strict YAML that validates against a registered schema, not as Markdown prose or ad hoc text.
- **MUST** `scripts-own-mechanics` — Scripts MUST own filesystem mechanics, parsing, validation, and deterministic format enforcement; AI judgment belongs in skill prompts, not in scripts.
- **SHOULD** `structured-fields-over-prose` — Spec-to-code links SHOULD live in structured mapping fields rather than being described in free-text prose.
- **MUST** `generated-documents-are-not-hand-edited` — A human-readable document that the workflow renders from strict YAML MUST be produced only by its generator, MUST carry a banner identifying it as generated and naming its source artifacts, and MUST NOT be edited by hand; content that belongs in such a document is changed by editing the strict YAML source and re-rendering.
