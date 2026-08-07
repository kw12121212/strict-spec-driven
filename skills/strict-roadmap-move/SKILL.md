---
name: strict-roadmap-move
description: Move a strict roadmap planned change from one active milestone to another through the strict roadmap CLI, renaming it to its canonical milestone-prefixed filename.
metadata:
  skill_id: strict_roadmap_move
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user reassign a strict roadmap planned change to a different
milestone.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-status: strict-spec-cli roadmap-status
roadmap-overview: strict-spec-cli roadmap-overview
roadmap-move-planned-change: strict-spec-cli roadmap-move-planned-change <planned-change-id> --milestone <milestone-id> [--allow-complete]
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Move Model

- Roadmap state lives under `.strict-spec-driven/roadmap/`.
- A standalone planned-change artifact carries its owning milestone in
  `planned_change.milestone`, and its filename must be the canonical
  milestone-prefixed basename `<milestone-id>-<planned-change-id>.yaml` (the
  prefix is not duplicated when the id already starts with the milestone id).
- Because both must agree, a move rewrites the declared milestone and renames
  the file in one command. Never hand-edit the milestone field and never rename
  the file yourself; a mismatched basename is a blocking validation diagnostic.
- `roadmap-move-planned-change` moves exactly one planned change. It never
  edits summary, details, status, or `depends_on`, never touches another planned
  change, and never writes under `.strict-spec-driven/changes/`.
- Ordering inside the target milestone follows the canonical filename, so the
  moved planned change sorts by its own id. There is no position flag; use
  `depends_on` when work must follow other work.
- Archived milestones and archived planned changes are frozen history and can
  never be moved or receive a move.
- Moving milestones themselves is a different operation; use
  `/strict-roadmap-reorder` for that.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `roadmap-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli roadmap-move-planned-change --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show roadmap-index`, `strict-spec-cli schema-show roadmap-milestone`, `strict-spec-cli schema-show planned-change`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show roadmap-index`, `strict-spec-cli sample-show roadmap-milestone`, `strict-spec-cli sample-show planned-change`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli roadmap-move-planned-change`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
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
   If human-readable context helps, also run `roadmap-overview`. Use the
   reported milestone ids, planned-change ids, source paths, derived statuses,
   and diagnostics as the deterministic facts for this move. Resolve any
   existing blocking diagnostic first; the move command refuses to run against
   an invalid roadmap.

2. **Confirm the target milestone** — the target must be an active,
   non-archived milestone that already exists. If the user names a milestone
   that is archived or absent, report that instead of creating one.

3. **Check the work state of the planned change** — a planned change whose
   strict change is already archived is completed work. Moving it can flip the
   source milestone from complete back to proposed and makes the target
   milestone report work it never contained. Confirm the user really wants that
   before adding `--allow-complete`.

4. **Check dependency direction** — inspect `depends_on` edges touching the
   planned change. If the move would leave an earlier milestone depending on
   work that now sits in a later milestone, report that dependency-order concern
   and ask for confirmation instead of silently moving it.

5. **Run the move** — run:
   ```bash
   strict-spec-cli roadmap-move-planned-change <planned-change-id> --milestone <milestone-id>
   ```
   Add `--allow-complete` only when step 3 confirmed a deliberate move of
   completed work. Confirm the result is valid and reports the expected
   planned-change id, source milestone, target milestone, source path, and
   target path.

6. **Relay any warnings** — the command reports non-blocking warnings when the
   planned change has an active strict change whose `proposal.yaml` roadmap
   linkage is now stale, and when a `depends_on` edge points against roadmap
   order. Refresh a stale linkage with the reported
   `strict-spec-cli generate <change-name> proposal` command; the move command
   deliberately never writes change artifacts itself.

7. **Confirm state** — rerun:
   ```bash
   strict-spec-cli roadmap-status
   ```
   Report the new milestone ownership, both milestones' derived statuses, and
   any remaining diagnostics.

## Rules

- Move only active planned changes into active milestones; archived roadmap
  artifacts are immutable
- Translate move intent into one CLI command; do not hand-edit roadmap YAML and
  do not rename planned-change files yourself
- Use `--allow-complete` only after the user confirms that moving completed work
  and re-deriving both milestone statuses is intended
- Stop for an explicit human answer when the requested move appears to violate
  dependency order
- Never edit `.strict-spec-driven/changes/` artifacts from this skill; relay the
  reported proposal refresh command instead
