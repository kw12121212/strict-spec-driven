---
name: strict-spec-architecture
description: Author or refresh the strict YAML architecture artifact from repository evidence, then render the generated ARCHITECTURE.md through the strict architecture CLI.
metadata:
  skill_id: strict_spec_architecture
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user author or refresh `.strict-spec-driven/architecture.yaml`
and render the generated architecture document from it.

`ARCHITECTURE.md` is a generated file. It is never hand-edited. Everything a reader
sees in it comes from strict YAML: the components, data flows, and architecture
decisions come from the architecture artifact, and the specification-surface and
technical-standard sections are projected from the spec index, the main specs,
and `.strict-spec-driven/tech/`. Your job is the architecture artifact; the CLI
owns rendering, comparison, and validation.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
architecture-status: strict-spec-cli architecture-status
architecture-edit: strict-spec-cli architecture-edit [named semantic fields or removals]
architecture-generate: strict-spec-cli architecture-generate
architecture-check: strict-spec-cli architecture-generate --check
schema-show: strict-spec-cli schema-show architecture
sample-show: strict-spec-cli sample-show architecture
tech-status: strict-spec-cli tech-status
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If
`.strict-spec-driven/` is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `architecture-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli architecture-edit --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show architecture`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show architecture`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli architecture-edit`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
6. **Inspect the structured result and changed paths** — read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.
7. **Run the artifact's validation command** — `strict-spec-cli architecture-status`

**Stop rather than edit YAML directly.**

When a required command, argument, or artifact kind is unavailable, stop and
report the missing capability. Editing the YAML directly, writing a raw
payload, or scripting around the CLI is never an available fallback, and an
unavailable command is a reason to stop rather than a reason to improvise.

When you stop, report:

- the operation that could not be completed
- the artifact kind and target artifact it would have written
- the command or argument that is missing
- the discovery commands already consulted

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

Architecture artifact prose is operator-facing generated text, so it follows the
same configured language.

## What Belongs in the Architecture Artifact

Put in it only what no other strict artifact holds:

- **components** — each component's responsibility, the boundaries that say what
  it deliberately does not own, the components it depends on, and the
  repo-relative implementation files it maps to
- **data_flows** — the trigger that starts a flow, the ordered steps, and the
  components the flow crosses
- **decisions** — the architectural decision, its rationale, the alternatives
  that were rejected, and its status

Keep out of it anything the renderer already projects:

- spec ids, titles, paths, or requirement counts — these come from
  `.strict-spec-driven/specs/INDEX.yaml` and the main specs
- technical-standard rules, strengths, or categories — these come from
  `.strict-spec-driven/tech/`
- project context prose — this comes from the `context` field of
  `.strict-spec-driven/config.yaml`

Duplicating projected content creates a second source of truth that drifts.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If
`.strict-spec-driven/` is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

1. **Check workflow state** — run `strict-spec-cli check-workflow-state` first.

2. **Read the current state** — run `strict-spec-cli architecture-status`. It reports
   whether the artifact validates, how many components, data flows, and
   decisions it declares, and which mapped implementation paths no longer exist.
   Treat reported mapping drift as work to do: a component mapped to a deleted
   file is either a stale mapping or a component that no longer exists.

3. **Inspect the schema when the shape is unclear** — run
   `strict-spec-cli schema-show architecture` and
   `strict-spec-cli sample-show architecture`. Do not guess field names.

4. **Gather repository evidence before writing** — derive components from the
   real source layout, not from an idealized picture: read the top-level source
   directories, the CLI or entry-point wiring, the test layout, and the existing
   strict artifacts. Run `strict-spec-cli tech-status` so the architecture you
   describe is consistent with the standards that bind the code.

5. **Write or update `.strict-spec-driven/architecture.yaml` through the CLI** — invoke `strict-spec-cli architecture-edit` once per header, component, data-flow, decision, nested list addition, or exact named removal. Never edit the YAML directly. Keep component,
   flow, and decision ids stable across edits: they are the anchors readers and
   diffs rely on. Preserve authoring order, because the renderer emits
   components, flows, and decisions in document order. Record a decision only
   when it constrains future work; a decision with no rationale and no rejected
   alternative is a description, not a decision.

6. **Render the document** — run `strict-spec-cli architecture-generate`. It writes
   `ARCHITECTURE.md` at the repository root, or the path given to `--output`.

7. **Confirm the result** — run `strict-spec-cli architecture-status` again for a clean
   validation and no mapping drift, then `strict-spec-cli architecture-generate --check`
   to confirm the rendered document matches its sources. Check mode exits
   non-zero and names the stale source artifacts when it does not.

## Detecting Staleness Later

`strict-spec-cli architecture-generate --check` is the drift gate. It renders in
memory, compares against the file on disk, never writes, and exits non-zero when
the document is stale or absent, naming which source artifact changed. It is an
on-demand check: it is deliberately not wired into `verify`, `ready`, or
`archive`.

## Rules

- Never hand-edit `ARCHITECTURE.md` or any file carrying the generated banner; change
  the source artifact and re-render
- Never hand-edit `.strict-spec-driven/architecture.yaml`; use `architecture-edit` named fields and removals so unrelated entries are preserved and the full candidate validates before commit
- Never duplicate spec or technical-standard content into the architecture
  artifact
- Keep component, data flow, and decision ids stable; renaming an id is a
  content change readers see as a deletion plus an addition
- Map components to real repo-relative implementation paths and fix mapping
  drift rather than deleting the mapping to silence it
- Do not invent components, flows, or decisions that the repository does not
  support; ask the user when the intended boundary is genuinely ambiguous
