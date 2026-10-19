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

**Depends on:** `document-render`, `schema-validation`

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

### Technical Standards Status (`standards-status`)

Reads every registered technical standard and reports the standards, their rules, and their MUST/SHOULD/MAY strengths for tech-status.

**Boundaries**

- Read-only: it reports standards content and never edits a standard.

**Depends on:** `schema-validation`

**Implementation**

- `src/cli/tech-status.ts`

### Scene Store and Coverage (`scene-coverage`)

Owns the scene artifact family: authoring and reconciling live scenes and the scene index, reporting each flow step as covered, waived, or unresolved, and reporting the coverage gaps that block ready and verify when a change's delta scenes leave a step uncovered.

**Boundaries**

- Coverage references are declared on the scene side only; no main spec or requirement is modified to record that a scene covers it.
- Checking is triggered by the presence of a scene, never by the presence of a spec, so a repository holding no scene produces no diagnostic.

**Depends on:** `schema-validation`

**Implementation**

- `src/scenes.ts`

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

| Spec | ID | Requirements |
| --- | --- | --- |
| [Architecture Document Domain Behavior](.strict-spec-driven/specs/architecture/domain-behavior.yaml) | `architecture-domain-behavior` | 7 |
| [CLI Foundation](.strict-spec-driven/specs/cli/foundation.yaml) | `cli-foundation` | 232 |
| [Strict YAML Artifact Schemas](.strict-spec-driven/specs/contracts/yaml-artifacts.yaml) | `contracts-yaml-artifacts` | 125 |
| [Design System Document Domain Behavior](.strict-spec-driven/specs/design/domain-behavior.yaml) | `design-domain-behavior` | 8 |
| [DSH Strict Document Viewer Behavior](.strict-spec-driven/specs/dsh-viewer/behavior.yaml) | `dsh-viewer-behavior` | 29 |
| [Lessons Domain Behavior](.strict-spec-driven/specs/lessons/domain-behavior.yaml) | `lessons-domain-behavior` | 9 |
| [Migrate Domain Behavior](.strict-spec-driven/specs/migrate/domain-behavior.yaml) | `migrate-domain-behavior` | 7 |
| [Operations Domain Behavior](.strict-spec-driven/specs/operations/domain-behavior.yaml) | `operations-domain-behavior` | 10 |
| [Roadmap Domain Behavior](.strict-spec-driven/specs/roadmap/domain-behavior.yaml) | `roadmap-domain-behavior` | 29 |
| [SOP Domain Behavior](.strict-spec-driven/specs/sop/domain-behavior.yaml) | `sop-domain-behavior` | 6 |
| [Testing Coverage Gate](.strict-spec-driven/specs/testing/coverage-gate.yaml) | `testing-coverage-gate` | 4 |

## Technical Standards

Projected from `.strict-spec-driven/tech/`. MUST rules are binding; SHOULD rules are the default.

### [CLI Command Metadata](.strict-spec-driven/tech/cli-command-metadata.yaml) (`cli-command-metadata`) — architecture

- **MUST** `single-source-command-descriptions` — Every registered strict CLI command MUST have an entry in the shared command-metadata registry, and root help, subcommand help, JSON help, and the MCP capability inventory MUST derive their command descriptions from that registry rather than from inline string literals.
- **MUST** `help-describes-argument-semantics` — A command-metadata entry MUST document each accepted flag's meaning together with its required, repeatable, removal, and delete semantics, plus the command's output keys and exit-code meaning; describing operational semantics only in skill prompts instead of the metadata registry is not sufficient.
- **MUST** `authoring-metadata-names-artifact-assets` — The shared command-metadata registry MUST expose, for every CLI command that authors repository-owned YAML, the artifact kinds it writes together with each artifact's bundled schema key, declared schema_file path, and bundled example key, derived from the mutation inventory's declared CLI owners rather than restated per command; text help, machine-readable help, and MCP tool descriptions MUST render that single source, and MUST route callers to schema-show and sample-show instead of inlining schema or example content.
- **MUST** `help-surfaces-render-the-whole-artifact-projection` — Every help surface that describes a YAML-authoring command MUST render the whole derived artifact-surface projection its medium can carry — asset keys and paths, supported operations with owning commands, refused deletions, cross-file effects, discovery and inspection commands, and shared schema cache state — and a surface that can carry only part of it MUST name the command that returns the rest; no surface may silently omit a projection field, and no surface may restate a projection fact from its own literal.
- **MUST** `authoring-protocol-has-one-source` — The ordered AI YAML authoring protocol steps and their terminal missing-capability behavior MUST be declared in exactly one typed module. Every AI-facing surface that resolves the protocol at request time -- CLI text output, machine-readable output, and the MCP capability surface -- MUST render that module rather than restating a step, its order, or the no-fallback boundary from a surface-local literal. A surface that is delivered as static text and cannot execute at load time is governed instead by the static-surface rule, which requires a checked restatement.
- **MUST** `skill-packages-are-static-protocol-surfaces` — A bundled skill package that directs a CLI-owned YAML mutation is an AI-facing protocol surface that cannot render the protocol module at load time, so it MUST name the artifact kinds it writes, the 'strict-spec-cli yaml-authoring-protocol <artifact-kind>' command that renders the ordered steps and the bound owning, schema, example, and validation commands, its own artifact validation command, and the verbatim no-fallback boundary statement; it MUST NOT restate the ordered step titles or its per-artifact schema-show and sample-show lookups, and an automated check MUST fail when a mutation-capable skill omits the pointer command, its artifact kind, its validation command, or the boundary statement, or restates a step title.
- **MUST** `blocking-diagnostics-name-how-to-apply-each-remedy` — A diagnostic that blocks a workflow gate MUST state how to apply every remedy it names, not merely that the remedy exists: for each remedy, the artifact it writes and a runnable command with the target's identifiers already filled in, plus the source to consult for any identifier the caller must still supply. When a remedy is accepted only for a fixed set of values, the diagnostic MUST name that set and MUST derive it from the same declaration the check evaluates, never from a surface-local literal. Naming an alternative remedy in an expected, actual, or suggestion field without naming its command does not satisfy this rule.
- **MUST** `skill-guidance-states-each-shared-instruction-once` — An instruction that every bundled skill must carry MUST appear at most once per skill file and MUST NOT be restated in a second section of the same file, whichever two sections those are; when one of the copies is the section a shipped check reads, that copy is the one retained and the other MUST be removed rather than shortened, and an automated check MUST fail naming the offending skill when a skill restates it. The rule constrains repetition, not placement: a skill stating the instruction in exactly one section complies regardless of which section that is, and the section that declares the skill's commands is a reference rather than a statement.
- **MUST** `guidance-names-only-packaged-skills` — Guidance that ships to an agent or operator MUST NOT name a skill package that does not exist under skills/. In the routing surfaces — bundled skills and operator documentation — the reference MUST be recognized whether it is written as a slash command, a backticked name, or a bare prose mention, because all three read to the reader as a command they can type. In source files the prefixed forms are the governed ones, since a comment naming a deleted skill while explaining that it was deleted states a fact rather than routing anyone. The bundled-skill portion of that scope MUST be enforced by the shipped skill validation command so a consuming project observes the failure, and the wider scope of operator documentation and source MUST additionally be scanned by an automated check that fails naming both the offending file and the missing skill. Text whose purpose is to state that a name is retired — a removal sweep test, or a marked retirement section of an upgrade note — MUST be placed outside the scanned scope rather than excused inside it, and the banned name MUST NOT be added to the check's allowlist, because an allowlist entry is global and silences the real routing reference as well as the fixture.
- **MUST** `delegating-skills-do-not-restate-the-delegated-procedure` — A bundled skill that delegates a lifecycle phase to the skill that owns it MUST NOT also restate that phase's procedure. The delegation MUST name the owning skill in a form the packaged-skill reference check already recognizes, and the shipped skill validation command MUST fail, naming the delegating skill, the restated content, and the owning skill, when a declared delegation coexists with a restatement of the same procedure. The rule's subject is the delegating skill only: a skill that owns and performs a phase itself is outside the rule, and stating a procedure it owns is never a violation. Content the delegating skill states that its owning skill does not state is an increment rather than a restatement, and MUST be retained in the delegating skill rather than merged into the owner.
- **MUST** `delegable-obligation-checks-accept-a-delegation` — A per-skill content check that governs an obligation the delegation registry declares delegable MUST accept a checked delegation as satisfying it, excusing the delegating skill from stating the guidance inline once the delegation-target check confirms the named owner states every element. The requirement the check enforces MUST carry the same two branches, so the contract and the check agree on what satisfies the obligation. A check that governs a delegable obligation while admitting only inline statement is the defect this rule names, because it forces a delegating skill to restate exactly the procedure the no-restatement rule forbids it from restating.
- **MUST** `skill-handoff-names-no-harness-mechanism` — A bundled skill that routes an agent to another skill MUST state a plain skill handoff and MUST NOT name a harness tool as the mechanism for reaching it, because how a named skill is loaded belongs to the running harness rather than to the guidance. An automated check MUST fail, naming the offending skill file, the line, and the named mechanism, when a line that routes the reader to a skill also names such a mechanism. Naming a command-line program on a line that routes the reader to no skill is outside the rule.
- **MUST** `skill-guidance-addresses-a-generic-agent` — Bundled skill guidance MUST address whichever agent is running it and MUST NOT name a specific AI product, in the body or in the frontmatter description, either as a bare mention or as the actor a use-when clause casts. An automated check MUST fail, naming the offending skill file, the line, and the matched text, when such text is present. A clause whose actor is a condition rather than a capitalised product name is outside the rule.
- **SHOULD** `shared-guidance-phrases-have-one-constant` — A guidance phrase that more than one skill-content expectation requires SHOULD be declared once as an exported constant in src/skills/model.ts and referenced by every expectation, contract element list, or delegable obligation that requires it, rather than repeated as a string literal in each.

### [DSH Plugin Client Conventions](.strict-spec-driven/tech/dsh-plugin-client.yaml) (`dsh-plugin-client`) — ui

- **MUST** `shared-dsh-modules-external` — Plugin client code compiles to the dsh ModuleLoader closure-factory CommonJS bundle with every dsh shared module, including React and the host's shared client APIs, declared external, so the bundle never inlines a copy of a shared module.
- **MUST** `css-modules-dsw-tokens` — Plugin styles are written as CSS Modules that consume --dsw-alias design tokens through var() for colors and border radii, and a plugin style sheet declares no literal color value and no literal border-radius.
- **MUST** `zh-en-locale-registration` — Every user-visible string the plugin renders is registered in both the zh and en locale catalogs, and components render text only through those registered entries.
- **MUST** `props-and-stores-data-flow` — Data reaches plugin components only through props or stores, and no component reads the remote workspace API, the filesystem, or module-scope mutable state directly.
- **MUST** `narrow-engines-dsh-pin` — The plugin's package.json declares engines.dsh pinned to the patch line of the dsh release the plugin was built against, and widening the pin is its own planned change.
- **MUST** `dsh-free-component-tests` — Component tests render plugin components without a running dsh host, for example through react-dom/server static rendering, and the plugin adds no browser or DOM test dependency unless the change that adds it justifies why static rendering cannot exercise the behavior under test.
- **MUST** `declaration-aware-slot-registration` — A dynamic plugin fiber registers into shell-owned slots through the registry's declaration-aware installation path, ctx.slots.inject with the slot key and a callback that performs the registration, never through a bare register call in apply, because the fiber can activate before the shell entries that declare the slot have committed their children tables and a bare registration into an undeclared slot throws.
- **MUST** `model-modules-behind-owned-remote-port` — Plugin model and business modules must not import generated dsh client remote modules or touch the client remote face directly; they close over a plugin-owned port interface that mirrors the pinned wire contract — including parameter requiredness, so a wire-required options object is never forwarded as undefined — with a single adapter at the client entry converting the real remote face, and their tests script a fake that reproduces the pinned wire semantics: the directory-listing entry cap with its truncated flag and no paging, the complete-file cap with its too-large refusal, line pages terminated by eof, non-recursive per-target watches, and the typed workspace-files error codes.
- **MUST** `shared-primitives-runtime-devdependencies` — A plugin whose dsh-free component tests or build import a shared dsh UI package must declare that package's own runtime dependencies as plugin devDependencies, because bun resolves the unbundled shared lib's imports from the plugin's node_modules, and the served bundle must inline every module the host does not share.
- **MUST** `identity-stable-adapters-and-effect-free-controllers` — An adapter that feeds a React useSyncExternalStore source returns identity-stable snapshots — memoizing on the identity of the host snapshots it reads, so unchanged sources return the same object — and an effect-driven sequence a component needs at mount or transition (load, restore, teardown) is extracted into a plain controller object the component's effects only delegate to, so suites prove the ordering under bun test/run.ts with no React effect runtime.
- **MUST** `entry-declares-every-host-face-it-reads` — The client entry's inject export declares every ctx property its apply path and wired components read — service names, the bare remote face, and each remote namespace as a remote-prefixed name — and the package manifest's dsh.client.inject list declares every module the built bundle requires at runtime plus every entry whose fibers provide the declared services.
- **SHOULD** `type-only-dependency-type-closure` — A type-only contract devDependency should also declare, as pinned type-only devDependencies, every package whose types its published .d.ts files import, and the bundle-shape suite should list each added package among the type-only runtime-require prohibitions.
- **MUST** `renderer-suites-consume-registered-examples` — Every dedicated renderer the plugin adds is covered by a suite case that renders the registered strict example of its artifact type from examples/strict-spec-driven/, so a schema change that breaks a renderer's layout fails the regression suite rather than silently degrading the view.
- **MUST** `dedicated-renderers-react-free-view-models` — Every dedicated renderer maps a parsed strict artifact onto its presentation structure through a React-free view-model module — partitioning known and unrecognized top-level fields and computing any presented summary, such as task completion, from declared values — and renders every unrecognized top-level field through the one shared generic blocks implementation.
- **SHOULD** `view-model-partition-helpers-single-source` — View-model mappers for dedicated renderers SHOULD import the record-field readers (stringField, soleValue, stringEntries, scalarText) and the known-keys partition helper from the one shared module (plugins/dsh-strict-spec/src/client/recordFields.ts) instead of restating them per mapper module.
- **MUST** `rendered-view-navigation-through-open-action` — Cross-document navigation from a dedicated renderer flows only through the shared viewer open action and the tree documents record passed down as props from the entry points; a renderer never reads the workspace, mutates tree state, or opens a document by any other mechanism, and a link that resolves to no document renders the shared unresolved marker instead of acting.
- **SHOULD** `dedicated-views-render-context-free` — A dedicated renderer that consumes entry-point stores should read them only through the view context with identity-stable context-free fallbacks, never varying its hook structure on context presence, so the same component statically renders declared data alone when no context is passed.
- **SHOULD** `dedicated-views-share-one-tree-store-reader` — A dedicated renderer that reads the tree's documents record should consume one shared context-free tree-store reader — the fallback store and the useTreeDocuments hook exported from plugins/dsh-strict-spec/src/client/viewStores.ts — rather than restating the fallback per view module, keeping one hook shape that does not vary on the view context's presence.
- **MUST** `packed-tarball-allowlist` — A dsh plugin package MUST declare a package.json files allowlist naming exactly its built bundle directory, its declared bundle patch, and one README per shipped locale, so a locally packed tarball ships the bundle the host loads and never the plugin's sources, build scripts, test support, or lockfile.

### [TypeScript ESM Baseline](.strict-spec-driven/tech/typescript-esm-baseline.yaml) (`typescript-esm-baseline`) — coding

- **MUST** `esm-typescript-only` — Source modules MUST be authored in strict TypeScript using ESM syntax with NodeNext resolution, compiled from src/ to dist/.
- **MUST** `rebuild-after-source-edits` — Compiled output MUST be rebuilt after editing TypeScript sources before relying on dist/ behavior or running the dist-based test suite.
- **SHOULD** `tests-verify-observable-behavior` — Tests SHOULD verify observable behavior described in specs and prefer real dependencies over mocks for code the project owns.

### [Workflow Regression Coverage](.strict-spec-driven/tech/workflow-regression-coverage.yaml) (`workflow-regression-coverage`) — testing

- **MUST** `cover-workflow-critical-behaviors` — Changes that implement or alter YAML artifact support MUST add or update tests covering the workflow-critical behaviors they touch: schema validation, migration, archive and delta-merge behavior, and the error messages surfaced on invalid input.
- **MUST** `enforce-minimum-coverage` — The complete project regression command recorded in review_evidence.project_regression MUST enforce the minimum src/** line coverage declared in the workflow config coverage contract, exiting non-zero below the declared threshold; the threshold MUST start at the measured baseline and only be raised deliberately, never silently lowered or removed.
- **MUST** `test-helpers-isolate-developer-home` — Test helpers that spawn CLI subprocesses or exercise startup paths with home-directory side effects MUST redirect HOME, USERPROFILE, and recognized cache-root environment overrides to per-run temporary directories by default, with explicit per-call environment overrides still taking precedence, so the test suite never writes the developer's real home directory on any platform.
- **MUST** `static-content-checks-prove-a-negative-case` — A static check over content that the same change generates or inserts MUST derive the set of files or entries it checks from a source independent of that generated content, MUST be proven by a negative case in which the content is removed and the check is observed to fail, and MUST be proven by a positive case in which each matcher category is observed firing on realistic input, with any hand-enumerated set of governed files replaced by a scan. That negative case MUST exercise the same function the passing assertion calls, with synthetic input added to the real input, rather than restating the check's predicate inside the probe. A green suite over generated content is not coverage evidence until both cases have been run at least once.
- **MUST** `policy-enforcement-proven-through-shipped-entry-point` — A repository policy that blocks a class of authored guidance MUST be proven by a committed negative fixture driven through the shipped command an operator or agent actually runs, with the observed failure naming the offending file path, line, and policy category; a module-level scan of inline text is supporting evidence only and MUST NOT be the sole proof.
- **MUST** `mutation-coverage-spans-every-agent-facing-surface` — The mutation-surface coverage registry MUST declare a cell for every artifact family on every agent-facing entry surface, including both the CLI and the MCP tool surface, and each not-applicable cell MUST record why that family has no entry point on that surface.
- **MUST** `declared-surface-lists-are-checked-against-implementation` — When a coverage check derives its scope from a hand-maintained list inside a repository artifact — an inventory of surfaces, a family-to-tool mapping, a registry of owners — that list MUST itself be cross-checked against the implementation it describes, in both directions: an entry naming something the code does not provide, and a thing the code provides that no entry names, MUST both fail.
- **MUST** `subprocess-spawning-code-under-test-receives-the-isolated-runner` — When the code under test spawns a subprocess on the suite's behalf rather than through a test helper, the suite MUST supply the isolated runner through that module's own injection point, and MUST NOT rely on the module's default runner, which inherits the developer's environment.
- **MUST** `blocking-gate-commands-run-as-recorded` — A command recorded as a blocking workflow gate — in the workflow config, in a technical standard, or in repository agent instructions — MUST succeed when run exactly as recorded on an ordinary developer machine, with no environment variable, flag, or resource override the recorded form omits. When the command needs a runtime resource beyond a default, the command or its script MUST supply it rather than relying on the caller to discover it.
- **MUST** `manual-checks-record-observed-evidence` — A change whose acceptance needs a manual check against an external host must record each leg's observed evidence — what ran, what was observed, and which legs did not run with the reason — inside the change's own artifacts, so review verifies recorded evidence rather than trusting task completion status.

### [Workflow Scope Discipline](.strict-spec-driven/tech/workflow-scope-discipline.yaml) (`workflow-scope-discipline`) — architecture

- **MUST** `contract-first-scope-changes` — When a change alters a workflow contract — a registered schema, a main or delta spec, or a technical standard — the corresponding strict artifact MUST be updated first; implementation code MUST NOT silently widen workflow scope ahead of the contract it depends on.
- **MUST** `roadmap-commands-do-not-write-change-artifacts` — Roadmap commands MUST NOT create, modify, or delete any artifact under .strict-spec-driven/changes/, with one exception: roadmap-recommend --create MAY reserve an empty change container — the change directory and its empty specs directory, holding no file — named exactly the planned change id it recommends, through the same reservation boundary propose uses. No roadmap command may write a planning, delta, or scene artifact. When a roadmap operation leaves a change artifact's roadmap linkage stale or otherwise inconsistent, the command MUST report the drift as a non-blocking warning naming the command that repairs it rather than writing the change artifact itself.
- **MUST** `roadmap-dependency-targets-resolve-against-one-universe` — Every roadmap consumer that decides whether a planned-change depends_on target exists MUST resolve it against the shared universe of active planned-change ids unioned with the ids loaded from the roadmap archive, obtained from the loader that already computes that set. A consumer MUST NOT build its own dependency-target universe from active roadmap state alone, and MUST NOT re-derive archived membership by parsing archived artifacts.
- **SHOULD** `archive-merge-failures-surface-in-verify` — A merge that archive performs across more than one artifact family SHOULD be fully evaluated by verify, so a merge archive would refuse is rejected before archive writes any family. Archive applies its family merges in sequence without a transaction spanning them, so a refusal raised inside a later stage leaves the earlier stages already written and the change still active.
- **SHOULD** `shared-name-classification-registry` — When more than one check classifies a name against the same family of allowed values — skill name prefixes, artifact kinds, categories, or status values — those checks SHOULD resolve the family from one exported registry rather than each carrying its own literal copy, and any operator-facing expected value SHOULD render from that registry rather than restating the members.
- **SHOULD** `active-change-gates-resolve-against-post-archive-state` — A ready, verify, or archive gate that resolves ids or references during an active change SHOULD resolve them against the state archive will produce — the recorded main artifacts overlaid with that change's own delta artifacts, with added and modified entries present and removed entries absent — rather than against the recorded main artifacts alone.

### [YAML-First Artifact Authoring](.strict-spec-driven/tech/yaml-first-artifacts.yaml) (`yaml-first-artifacts`) — architecture

- **MUST** `artifacts-are-strict-yaml` — All spec-driven workflow artifacts MUST be authored as strict YAML that validates against a registered schema, not as Markdown prose or ad hoc text.
- **MUST** `scripts-own-mechanics` — Scripts MUST own filesystem mechanics, parsing, validation, and deterministic format enforcement; AI judgment belongs in skill prompts, not in scripts.
- **MUST** `generated-documents-are-not-hand-edited` — A human-readable document rendered from strict YAML MUST be produced only by its generator and carry a banner naming its YAML sources; neither the rendered document nor its repository-owned YAML sources may be hand-edited, so source changes MUST use the applicable artifact-aware CLI operation before re-rendering.
- **MUST** `artifact-writes-are-non-destructive` — An artifact-authoring operation MUST affect only fields or named entries supplied in that invocation: scalar and keyed-item restatement overwrites only the named value, repeated list values append without duplicates, named removal deletes only the identified entry, and whole-artifact deletion is an isolated delete-only operation. Every unnamed field, item, list value, and sibling artifact MUST remain unchanged.
- **MUST** `yaml-mutation-surfaces-stay-inventoried` — Every repository-owned YAML or YML artifact family and every repository code, CLI, MCP, skill, or documentation mutation surface MUST remain represented in inventory/yaml-mutation-surfaces.yaml with its ownership, supported operations, reference side effects, current CLI ownership or direct-write paths, and repository evidence; the dedicated inventory check MUST fail when coverage is missing, invalid, or stale.
- **MUST** `cli-owns-repository-yaml-mutations` — Every supported creation, update, named-entry removal, or whole-artifact deletion of repository-owned YAML MUST flow through an artifact-aware CLI operation that accepts named semantic arguments, resolves a confined artifact-family path, and owns document shape; AI-facing workflows MUST NOT supply raw YAML payloads, arbitrary output paths, or direct file edits.
- **MUST** `artifact-writes-validate-and-commit-atomically` — A YAML mutation MUST validate the complete candidate document, registered schema, declared relationships, confined path, and reference side effects before an atomic commit; any validation, reference, or filesystem failure MUST leave all pre-existing files unchanged and emit deterministic machine-readable diagnostics.
- **MUST** `artifact-creation-persists-meaningful-state-only` — A YAML creation operation MUST persist only real caller-supplied or workflow-required state; blank documents, placeholder values, and empty artifact containers MUST NOT be written, and a rejected or failed first write MUST leave the target absent.
- **MUST** `runtime-repository-evidence-is-embedded` — Repository-owned evidence a CLI command must read while running inside another project MUST be embedded in the bundled asset set and read embedded-first, with a working-tree read only as a fallback; a command MUST NOT depend on a repository path that exists only in this repository's checkout.
- **MUST** `bundled-asset-writes-regenerate-derived-output` — A mutation of a repository-bundled asset that is embedded, registered, or referenced elsewhere MUST regenerate and revalidate its derived output inside the same transaction as the source write; regeneration MUST NOT be deferred to a separate command, build step, or post-write hook.
- **MUST** `retired-schema-fields-leave-a-tombstone` — Retiring a field from a strict artifact schema MUST remove it from the schema's required list and replace its sub-schema with a description-only permissive allowance, rather than deleting the property, unless the change explicitly decides that artifacts still carrying the field must fail validation.
- **MUST** `schemas-declare-contracts-in-the-enforced-dialect` — A registered strict YAML artifact schema MUST express its validation contract in the dialect the shared validator executes, so every rule the schema declares is actually checked; a validation path MUST NOT be described as validating a candidate against a declared contract when the schema behind it carries keywords the validator does not interpret.
- **MUST** `contract-first-families-declare-no-unshipped-operation` — A repository-owned artifact family whose registered schema ships in a change that ships no command writing it MUST declare every mutation operation as not-applicable, MUST name no CLI owner and no direct-write path, and MUST record a reference side effect naming the later change that will flip the operations a command comes to own.
- **MUST** `named-removal-prunes-the-container-it-empties` — A named-entry removal MUST also remove any grouping container the removal leaves empty — a keyed map, a nested flow, a category or area subdirectory, or a whole index whose contract requires at least one member — so the store after a removal is a state the family's own schema still accepts and a later write does not have to repair.
