---
name: strict-roadmap-defer
description: Declare a strict roadmap milestone as planned but deliberately not yet elaborated, because a precondition has not matured, so automation stops treating its placeholder content as ready work.
metadata:
  skill_id: strict_roadmap_defer
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user record that a strict roadmap milestone is real, planned
work whose detail cannot be written yet.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-status: strict-spec-cli roadmap-status
roadmap-defer: strict-spec-cli roadmap-defer <milestone-id> [--reason "..."]
roadmap-recommend: strict-spec-cli roadmap-recommend [--details] [--milestone <milestone-id>] [--allow-unrefined]
roadmap-sync: strict-spec-cli roadmap-sync [--fix-names]
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Roadmap Linking Rules

- Milestone ownership for standalone work items is defined by
  `planned_change.milestone`.
- Do not expect milestone files to list standalone planned-change file paths.
- Use `roadmap-status` output to locate planned-change source files; each
  `plannedChanges[]` entry reports its `path`.
- Treat filenames as helpful conventions only. `planned_change.id` and
  `planned_change.milestone` are the source of truth.

## Deferral Semantics

- Deferring records a sticky top-level `awaiting_refinement` mapping
  (`status: true`, optional `reason`, deterministic `deferred_on` date) on the
  milestone artifact. It survives `roadmap-sync` canonical rewrite.
- **Deferral is not a pause.** It does **not** force the milestone status to
  `blocked`: the milestone keeps the status derived from its planned-change
  state, because work whose detail is deferred is not work that is blocked. A
  milestone with no planned changes stays `proposed`.
- `roadmap-recommend` follows strict roadmap order. When the earliest-ordered
  incomplete milestone is deferred, the command returns `status:
  refine-milestone` with a `refineAction` naming it, and does **not** fall
  through to implementable work owned by later milestones. Every planned change
  the deferred milestone owns also carries a `milestone-awaiting-refinement`
  skip reason.
- Because of that ordering rule, a long-lived deferral blocks downstream work.
  `/strict-roadmap-pause` is the supported release valve: a milestone that is
  both deferred and paused yields no refine action, so later milestones' work
  becomes recommendable again.
- The declaration is cleared only by `/strict-roadmap-refine`. It is never
  cleared by deriving maturity from the presence of planned changes, because
  whether the precondition has matured is a human judgement.
- Deferral never modifies any standalone planned-change file or any archived
  artifact. It only rewrites the milestone artifact (adding the
  `awaiting_refinement` field plus a dated note) and re-syncs the roadmap index.
- Deferral is rejected for unknown milestone ids and for a milestone whose
  derived status is `complete`, each with a deterministic diagnostic and no file
  write.

## Required Milestone Fields Are Not Relaxed

A deferred milestone still satisfies every milestone schema requirement,
including `goal`, `scope`, `done_criteria`, and at least one `intake_questions`
entry. Deferral does not license placeholder content. Record the unmatured
precondition as an intake question — that field already models what is not yet
known — and as the `--reason` on the deferral. Never invent a goal or done
criterion to satisfy the schema.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `roadmap-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli roadmap-defer --help --json`, `strict-spec-cli roadmap-sync --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show roadmap-index`, `strict-spec-cli schema-show roadmap-milestone`, `strict-spec-cli schema-show planned-change`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show roadmap-index`, `strict-spec-cli sample-show roadmap-milestone`, `strict-spec-cli sample-show planned-change`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli roadmap-defer`, `strict-spec-cli roadmap-sync`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
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

1. **Load milestone context** — read `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/roadmap/INDEX.yaml`, the target milestone YAML file
   under `.strict-spec-driven/roadmap/milestones/`, and any standalone
   planned-change files that the milestone owns.

2. **Confirm deferral is the right answer** — run:
   ```bash
   strict-spec-cli roadmap-status
   ```
   Deferral fits a milestone that is genuinely planned but whose detail depends
   on something that has not happened yet. It does not fit:
   - a milestone whose detail is simply unwritten — that is authoring work for
     `/strict-roadmap-review` or `roadmap-generate`
   - a milestone that is fully specified but must not be worked on right now —
     that is `/strict-roadmap-pause`
   - a milestone whose derived status is `complete` — the command refuses it
   If the milestone already carries an `awaiting_refinement` mapping, say so and
   stop unless the user wants to restate the reason.

3. **Capture the precondition and defer** — ask the user what specifically has
   to become true before this milestone can be elaborated, then run:
   ```bash
   strict-spec-cli roadmap-defer <milestone-id> --reason "<the unmatured precondition>"
   ```
   A good reason names an observable event ("the auth interface stops changing",
   "the vendor publishes their v2 contract"), not a feeling of uncertainty.
   Confirm the returned `deferred.awaitingRefinement` carries `status: true`, the
   supplied reason, and a `deferred_on` date, and that `deferred.status` is the
   status derived from planned-change state rather than `blocked`.

4. **Confirm recommendation behavior** — run:
   ```bash
   strict-spec-cli roadmap-recommend --details
   ```
   When this milestone is the earliest-ordered incomplete one, verify `status` is
   `refine-milestone` and `refineAction` names it. Tell the user plainly that
   later milestones' work is now suppressed, and that `/strict-roadmap-pause`
   releases it if that is not what they want.

5. **Report the result** — summarize the milestone id, its status, the recorded
   declaration (status, reason, deferred_on), which downstream work is now
   suppressed, and the next step: `/strict-roadmap-refine` once the precondition
   matures.

## Rules

- Keep the milestone rooted in `.strict-spec-driven/roadmap/`
- Defer only non-archived, incomplete milestones
- Never modify any standalone planned-change file during a deferral
- Never edit the milestone file by hand to add an `awaiting_refinement` field —
  use `roadmap-defer` so the canonical write and index sync stay deterministic
- Never invent milestone content to satisfy the schema; record what is unknown
  as an intake question instead
- Never resolve a deferral on the user's behalf; only the user knows whether the
  precondition has matured
