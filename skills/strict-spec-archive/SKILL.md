---
name: strict-spec-archive
description: Archive a completed strict YAML change. Uses the strict archive command to merge delta specs into main specs, regenerate the spec index, reconcile roadmap status when present, and move the change into archive.
metadata:
  skill_id: strict_spec_archive
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user archive a completed strict YAML change.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
modify: strict-spec-cli modify [change-name|archive-dir]
verify: strict-spec-cli verify <change-name>
generate: strict-spec-cli generate <change-name> delta-tech --<named-args>
archive: strict-spec-cli archive <change-name>
lesson-status: strict-spec-cli lesson-status [--category <category>]
```

## Responsibility Split

**Handled by CLI scripts**
- merge strict YAML delta specs into main specs during archive
- regenerate `.strict-spec-driven/specs/INDEX.yaml`
- reconcile `.strict-spec-driven/roadmap/` milestone and index status when archive changes roadmap-derived completion state
- move the change directory into `.strict-spec-driven/changes/archive/`

**Handled by the AI**
- choose the change to archive
- perform a final current-change-scoped technical-standard synchronization
- pause for operator confirmation when a possible reusable convention is not
  covered by applicable standards or current delta tech
- confirm verification and review readiness
- interpret archive output and summarize the final result

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `change-planning-state`, `change-delta-state`, `spec-state`, `tech-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli archive --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show change-proposal`, `strict-spec-cli schema-show change-design`, `strict-spec-cli schema-show task-list`, `strict-spec-cli schema-show question-list`, `strict-spec-cli schema-show delta-spec`, `strict-spec-cli schema-show delta-tech`, `strict-spec-cli schema-show spec-index`, `strict-spec-cli schema-show main-spec`, `strict-spec-cli schema-show tech-index`, `strict-spec-cli schema-show main-tech`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show change-proposal`, `strict-spec-cli sample-show change-design`, `strict-spec-cli sample-show task-list`, `strict-spec-cli sample-show question-list`, `strict-spec-cli sample-show delta-spec`, `strict-spec-cli sample-show delta-tech`, `strict-spec-cli sample-show spec-index`, `strict-spec-cli sample-show main-spec`, `strict-spec-cli sample-show tech-index`, `strict-spec-cli sample-show main-tech`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli archive`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
6. **Inspect the structured result and changed paths** — read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.
7. **Run the artifact's validation command** — `strict-spec-cli verify <change-name>`

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

1. **Select the change** — run `modify` without an argument to list active
   changes. If the change is already specified, use it.

2. **Run the final current-change tech sync** — before final verification or
   invoking the raw archive command, apply the active-change procedure from
   `strict-tech-sync` to the selected change.
   - bound the scan to the selected change's proposal, design, tasks, questions,
     delta specs, delta tech, attributable tracked and untracked files, and
     applicable technical standards
   - exclude unrelated repository drift and surface ambiguous file ownership
     instead of silently widening the archive scope
   - continue immediately when applicable main standards and current delta tech
     already cover the change and no reusable convention gap remains
   - when a possible reusable convention is uncovered, present the target or
     proposed standard, operation, stable rule id, strength, statement,
     rationale, and enforcement; do not continue until the operator either
     confirms delta-tech capture or explicitly classifies the pattern as not
     reusable
   - never defer a convention confirmed as reusable until after archive; use
     `generate <change-name> delta-tech ...` so it remains part of the active
     change rather than editing a live main standard directly
   - after any delta-tech edit, review the final delta artifact and rerun strict
     verification; a write the configured regression command neither compiles
     nor reads — currently a change-local delta-tech artifact or a lesson — does
     not invalidate passing complete project regression evidence, so rerun the
     configured regression command here only when this step also changed a file
     outside that carve-out

3. **Confirm the lesson declaration** — confirm that review declared either a
   recorded lesson or a justified "no lesson" for this change. Experience is
   learned during implementation and is lost the moment the change is archived,
   so this is the last point at which it can be captured cheaply. If the
   declaration was never made, make it now against the objective criteria in
   `strict-spec-review` — an overturned design decision, an unforeseen question,
   a task added from a discovery, or a regression exposing a pre-existing trap —
   and record the lesson before continuing. Do not invent one to fill the slot.
   Recording it here costs no regression rerun: a lesson is inside the carve-out
   named in the previous step.

4. **Confirm readiness** — after the final tech-sync checkpoint and any required
   evidence reruns, run:
   ```bash
   strict-spec-cli verify <change-name>
   ```
   Stop if the command reports blockers.

5. **Check for observable spec impact** — inspect
   `.strict-spec-driven/changes/<name>/specs/`.
   - if it is empty, treat the change as having no delta specs to merge and
     continue directly to archive
   - otherwise proceed

6. **Archive the change** — use the raw command only as the deterministic
   verification, delta-merge, index-regeneration, roadmap-reconciliation, and
   change-move mechanism:
   ```bash
   strict-spec-cli archive <change-name>
   ```

7. **Confirm the result** — summarize:
    - the archive destination
    - the strict main specs that were updated
    - any roadmap files the archive command reconciled

## Rules

- Never archive a change with verification blockers
- Never invoke archive before the final current-change tech-sync checkpoint is
  resolved
- Never defer a confirmed reusable convention until after archive; capture it as
  current-change delta tech
- Use the strict archive command rather than manually moving change directories
- Treat the current YAML artifacts and repository state as authoritative
