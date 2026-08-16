---
name: strict-roadmap-refine
description: Elaborate a deferred strict roadmap milestone once its precondition has matured, then clear its awaiting-refinement declaration so it re-enters the recommendation pipeline.
metadata:
  skill_id: strict_roadmap_refine
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user elaborate a strict roadmap milestone whose detail was
deliberately deferred, and then record that the deferral is over.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-status: strict-spec-cli roadmap-status
roadmap-generate-milestone: strict-spec-cli roadmap-generate milestone --<named-args>
roadmap-generate-planned-change: strict-spec-cli roadmap-generate planned-change --milestone <milestone-id> --id <planned-change-id> --summary "..." --details "..." [--depends-on <planned-change-id>] [--status <planned|complete>]
roadmap-refine: strict-spec-cli roadmap-refine <milestone-id> [--reason "..."]
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

## Refinement Semantics

- `roadmap-refine` **does not elaborate anything.** It records the operator's
  judgement that the precondition has matured and deletes the
  `awaiting_refinement` mapping. The elaboration itself is ordinary in-place
  editing through `roadmap-generate milestone` and
  `roadmap-generate planned-change`.
- The milestone is one continuous artifact throughout. There is no parent-child
  relationship, no successor entry, and nothing to trace back to: the same
  milestone simply gains content. Never create a replacement milestone or split
  the milestone into successors.
- Clearing the declaration returns the milestone to the ordinary recommendation
  pipeline, so its planned changes lose the `milestone-awaiting-refinement` skip
  reason and it stops producing a `refineAction`.
- `roadmap-refine` never modifies any standalone planned-change file or any
  archived artifact.
- `roadmap-refine` is rejected for unknown milestone ids and for a milestone that
  is not awaiting refinement, each with a deterministic diagnostic and no file
  write.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `roadmap-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli roadmap-refine --help --json`, `strict-spec-cli roadmap-generate --help --json`, `strict-spec-cli roadmap-sync --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show roadmap-index`, `strict-spec-cli schema-show roadmap-milestone`, `strict-spec-cli schema-show planned-change`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show roadmap-index`, `strict-spec-cli sample-show roadmap-milestone`, `strict-spec-cli sample-show planned-change`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli roadmap-refine`, `strict-spec-cli roadmap-generate`, `strict-spec-cli roadmap-sync`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
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
   planned-change files the milestone already owns. Run:
   ```bash
   strict-spec-cli roadmap-status
   ```
   Confirm the milestone reports `awaitingRefinement`. If it does not, say so
   and stop — there is nothing to refine.

2. **Confirm the precondition has matured** — read back the recorded `reason`
   and ask the user directly whether that specific condition is now true. Only
   the user can answer this; repository evidence cannot. If the answer is no,
   stop and leave the declaration in place. Do not infer maturity from the
   milestone having gained content in the meantime.

3. **Elaborate the milestone** — with the user, fill in what the deferral was
   waiting on. Use one invocation per edit:
   ```bash
   strict-spec-cli roadmap-generate milestone --id <milestone-id> --goal "..." --scope-in "..." --done "..."
   strict-spec-cli roadmap-generate planned-change --milestone <milestone-id> --id <planned-change-id> --summary "..." --details "..."
   ```
   Resolve the intake questions that recorded the unmatured precondition, by
   restating them with answered content or removing them with
   `--remove-intake-question <id>`. Every value must trace to what the user
   confirms; an unconfirmed field is still an open question, not a default.

4. **Clear the declaration** — once the milestone is genuinely executable, run:
   ```bash
   strict-spec-cli roadmap-refine <milestone-id> --reason "<what matured, in one line>"
   ```
   Confirm the returned `refined.previousAwaitingRefinement` reports the cleared
   declaration and that the milestone file no longer carries the
   `awaiting_refinement` field.

5. **Confirm the milestone re-entered the pipeline** — run:
   ```bash
   strict-spec-cli roadmap-recommend --details
   ```
   Verify no `refineAction` names this milestone and that its planned changes no
   longer carry a `milestone-awaiting-refinement` skip reason.

6. **Report the result** — summarize the milestone id, what was added during
   elaboration, the cleared declaration, and what `roadmap-recommend` now
   recommends.

## Rules

- Keep the milestone rooted in `.strict-spec-driven/roadmap/`
- Refine only non-archived milestones that actually carry the declaration
- Never create a successor milestone or split the milestone; refinement grows
  the same artifact in place
- Never edit the milestone file by hand to delete the `awaiting_refinement`
  field — use `roadmap-refine` so the canonical write and index sync stay
  deterministic
- Never decide on the user's behalf that the precondition has matured
- Clear the declaration only after the milestone is genuinely executable, not
  merely non-empty
