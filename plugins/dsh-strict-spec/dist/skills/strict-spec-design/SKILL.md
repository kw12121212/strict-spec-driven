---
name: strict-spec-design
description: Author or refresh the strict YAML design-system artifact from repository and design evidence, then render the generated DESIGN.md through the strict design CLI.
metadata:
  skill_id: strict_spec_design
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user author or refresh `.strict-spec-driven/design-system.yaml`
and render the generated design document from it.

`DESIGN.md` is a generated file. It is never hand-edited. It is rendered in the
design.md interchange format: YAML front matter carrying the machine-readable
design tokens, then a generated banner, then the canonical sections. Your job is
the design-system artifact; the CLI owns rendering, comparison, and validation.

The design-system artifact is optional. A project with no user interface — a
library, a backend service, a CLI — simply does not have one, and `init`
deliberately does not scaffold it. Do not create one to satisfy artifact shape.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
design-status: strict-spec-cli design-status
design-init: strict-spec-cli design-init
design-edit: strict-spec-cli design-edit [named semantic fields or removals]
design-generate: strict-spec-cli design-generate
design-check: strict-spec-cli design-generate --check
schema-show: strict-spec-cli schema-show design-system
sample-show: strict-spec-cli sample-show design-system
tech-status: strict-spec-cli tech-status
```

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `design-system-state`. Before the first mutation run
`strict-spec-cli yaml-authoring-protocol design-system-state`: that command
reports the ordered authoring steps, the owning command for each operation, and
the bundled schema and example keys with their cache-resolved paths, bound to
the artifact kind and current where a copy would go stale. Validate the result
with `strict-spec-cli design-status`.

**Stop rather than edit YAML directly.** When a required command, argument, or
artifact kind is unavailable, stop and report the missing capability. Editing
the YAML directly, writing a raw payload, or scripting around the CLI is never
an available fallback, and an unavailable command is a reason to stop rather
than a reason to improvise.

## Preferred Human Language

Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` —
the user's common human language, not a programming language — for all
user-facing and generated operator-facing text, including generated design
prose, unless that file is absent or the active user message asks otherwise.

## What Belongs in the Design-System Artifact

The strict workflow splits user interface work three ways. This artifact owns
exactly one of them.

- **This artifact — visual identity.** The design tokens the interface is built
  from (`tokens.colors`, `tokens.typography`, `tokens.layout`,
  `tokens.elevation`, `tokens.shapes`), the `components` that consume those
  tokens, and the `guidance` that explains the identity.
- **Main spec requirements — observable UI behavior.** What is shown, what is
  interactive, how state changes, and the loading, error, and empty conditions.
  These belong in a strict main spec, not here.
- **`ui`-category technical standards — UI engineering rules.** Design-system
  usage rules, styling conventions, accessibility baselines, and
  internationalization. These belong in `.strict-spec-driven/tech/`, not here.

Pixel-level visual fidelity is governed by visual-regression snapshots. Reference
them from `components.<id>.mapping.snapshots` so `design-status` can report a
snapshot path that no longer exists; never inline pixel detail into the artifact.

Token groups are fixed by the schema, but the entries inside each group are
open: no schema decides what a project's palette or spacing scale is named. A
token group you do not declare is omitted from the rendered document rather than
rendered empty, so declare only what the project actually has.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If
`.strict-spec-driven/` is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

1. **Check workflow state** — run `strict-spec-cli check-workflow-state` first.

2. **Read the current state** — run `strict-spec-cli design-status`. It reports
   whether the artifact validates, how many token groups, tokens, and components
   it declares, and which mapped implementation and snapshot paths no longer
   exist. Treat reported mapping drift as work to do: a component mapped to a
   deleted file is either a stale mapping or a component that no longer exists.
   The command exits non-zero when the artifact is absent, which is the expected
   state for a project that has no user interface.

3. **Create the artifact when it is absent** — once the project is confirmed to
   have a user interface, run `strict-spec-cli design-init`. It writes a
   schema-valid skeleton with empty token and component collections so you edit a
   valid artifact instead of composing one from nothing, and it reports an
   existing artifact as skipped rather than overwriting it, so it is safe to run
   before a refresh. `init` never creates this artifact, so this is the only way
   to scaffold it.

4. **Inspect the schema when the shape is unclear** — run
   `strict-spec-cli schema-show design-system` and
   `strict-spec-cli sample-show design-system`. Do not guess field names.

5. **Gather evidence before writing** — derive tokens from what the interface
   actually uses, not from an idealized palette: read the stylesheets, theme
   files, component library configuration, and existing UI source. Run
   `strict-spec-cli tech-status` and read any `ui`-category standard so the
   identity you record is consistent with the rules that bind the code.

6. **Write or update `.strict-spec-driven/design-system.yaml` through the CLI** — invoke `strict-spec-cli design-edit` once per identity, token, component, guidance, mapping, snapshot, or exact named removal. Never edit the YAML directly. Keep token and
   component ids stable across edits: they are the anchors readers, diffs, and
   component token references rely on. Preserve authoring order within a group,
   because the renderer emits entries in document order. Reference tokens from
   components by their dotted path, such as `colors.primary`, so a reader can
   follow a component property back to the token that defines it.

7. **Render the document** — run `strict-spec-cli design-generate`. It writes
   `DESIGN.md` at the repository root, or the path given to `--output`.

8. **Confirm the result** — run `strict-spec-cli design-status` again for a clean
   validation and no mapping drift, then `strict-spec-cli design-generate --check`
   to confirm the rendered document matches its source. Check mode exits non-zero
   and names the stale source artifact when it does not.

## Detecting Staleness Later

`strict-spec-cli design-generate --check` is the drift gate. It renders in
memory, compares against the file on disk, never writes, and exits non-zero when
the document is stale or absent, naming which source artifact changed. It is an
on-demand check: it is deliberately not wired into `verify`, `ready`, or
`archive`. A project that wants it run on a schedule instead declares a
`generated-doc-check` entry under `maintenance.checks` in
`.strict-spec-driven/config.yaml`, which reports a stale document as a
maintenance finding.

That check compares the document against the artifact. It cannot tell that the
artifact itself has fallen behind the interface code — that a component was
deleted or a palette retuned. Use `/strict-spec-design-sync` for that: it scans
the UI sources, reports the divergence, and reconciles the artifact after you
confirm each edit.

## Rules

- Never hand-edit `DESIGN.md` or any file carrying the generated banner; change
  the source artifact and re-render
- Never hand-edit `.strict-spec-driven/design-system.yaml`; use `design-edit` named fields and removals so unrelated entries are preserved and the full candidate validates before commit
- Never record observable UI behavior or UI engineering rules here; they belong
  in main specs and `ui`-category technical standards respectively
- Keep token and component ids stable; renaming an id is a content change
  readers see as a deletion plus an addition, and it silently breaks every
  component token reference that points at it
- Map components to real repo-relative implementation and snapshot paths and fix
  mapping drift rather than deleting the mapping to silence it
- Do not create a design-system artifact for a project with no user interface,
  and do not invent tokens or components the interface does not have; ask the
  user when the intended identity is genuinely ambiguous
