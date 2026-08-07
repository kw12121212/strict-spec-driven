---
name: strict-roadmap-sync
description: Reconcile strict roadmap YAML state against active and archived strict changes.
metadata:
  skill_id: strict_roadmap_sync
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user reconcile strict roadmap state with the current strict
workflow.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-status: strict-spec-cli roadmap-status
roadmap-sync: strict-spec-cli roadmap-sync
roadmap-sync-materialize: strict-spec-cli roadmap-sync --materialize-planned-changes
roadmap-sync-fix-names: strict-spec-cli roadmap-sync --fix-names
roadmap-generate-planned-change: strict-spec-cli roadmap-generate planned-change --milestone <milestone-id> --id <planned-change-id> --summary "..." --details "..." [--depends-on <planned-change-id>] [--status <planned|complete>] [--remove-depends-on <planned-change-id>]
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Roadmap Linking Rules

- Milestone ownership is defined by `planned_change.milestone`.
- Do not expect milestone files to list standalone planned-change file paths.
- Use `roadmap-status` output to locate planned-change source files; each
  `plannedChanges[]` entry reports its `path`.
- Treat filenames as helpful conventions only. `planned_change.id` and
  `planned_change.milestone` are the source of truth.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `roadmap-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli roadmap-sync --help --json`, `strict-spec-cli roadmap-generate --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show roadmap-index`, `strict-spec-cli schema-show roadmap-milestone`, `strict-spec-cli schema-show planned-change`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show roadmap-index`, `strict-spec-cli sample-show roadmap-milestone`, `strict-spec-cli sample-show planned-change`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli roadmap-sync`, `strict-spec-cli roadmap-generate`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
6. **Inspect the structured result and changed paths** — read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.
7. **Run the artifact's validation command** — `strict-spec-cli roadmap-status`

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

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Inspect current roadmap state** — run:
   ```bash
   strict-spec-cli roadmap-status
   ```
   Read diagnostics, milestone ordering, declared statuses, derived statuses,
   planned change state, and planned-change file `path` values under
   `.strict-spec-driven/roadmap/`.

2. **Fix or surface blocking roadmap shape issues** — if strict roadmap YAML is
   malformed, repair safe issues first. Stop and ask the user if the roadmap
   cannot be reconciled safely.

3. **Run sync** — run:
   ```bash
   strict-spec-cli roadmap-sync
   ```
   Use this to regenerate canonical roadmap index state and reconcile milestone
   and planned change completion against active and archived strict changes.

   If diagnostics report legacy inline milestone `planned_changes`, switch to:
   ```bash
   strict-spec-cli roadmap-sync --materialize-planned-changes
   ```
   This converts the inline entries into standalone planned-change files before
   reconciliation.

   If diagnostics report a standalone planned-change file whose basename does
   not match the canonical `<milestone-id>-<planned-change-id>.yaml` form (the
   milestone prefix is not duplicated when the id already starts with it),
   run:
   ```bash
   strict-spec-cli roadmap-sync --fix-names
   ```
   This renames misnamed active planned-change files to their canonical names
   deterministically and reports each rename; default `roadmap-sync` only
   reports the diagnostic. New planned-change files are created through
   `roadmap-generate planned-change`, which computes the canonical filename
   itself — never pick planned-change filenames by hand.

4. **Confirm the reconciled state** — rerun `roadmap-status` and report which
   files changed, which milestone statuses moved, and whether any diagnostics
   remain.

## Rules

- Keep all reconciliation inside `.strict-spec-driven/roadmap/`
- Do not invent new planned changes during sync
- Let strict CLI commands handle deterministic reconciliation mechanics
