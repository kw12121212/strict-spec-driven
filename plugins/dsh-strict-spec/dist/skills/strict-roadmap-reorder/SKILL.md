---
name: strict-roadmap-reorder
description: Reorder strict roadmap milestones by changing one active milestone's order value through the strict roadmap CLI, renumbering canonical spacing only when no integer gap remains.
metadata:
  skill_id: strict_roadmap_reorder
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user change where one milestone sits in strict roadmap
order. The whole operation is a single `roadmap-reorder` invocation against
`.strict-spec-driven/roadmap/`. The skill's job is to resolve the requested
position into exactly one placement argument, raise any dependency-order concern
the command does not check for you, run it once, and report what moved.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-status: strict-spec-cli roadmap-status
roadmap-overview: strict-spec-cli roadmap-overview
roadmap-reorder: strict-spec-cli roadmap-reorder <milestone-id> (--before <milestone-id> | --after <milestone-id> | --order <integer>)
roadmap-renumber: strict-spec-cli roadmap-renumber
```

## What This Skill Does and Does Not Move

`roadmap-reorder` changes one active milestone's `order` value. That is the
whole operation.

- It moves a **milestone**, never a planned change. Moving a standalone
  planned-change artifact to a different milestone is
  `/strict-roadmap-transition` with the `move` operation.
- It changes **position**, never status. Holding a milestone out of
  recommendation is `pause`, and declaring it not yet elaborated is `defer`;
  both are `/strict-roadmap-transition` operations.
- It changes **order**, never content. Authoring or elaborating milestone and
  planned-change content is `/strict-roadmap-plan` and `/strict-roadmap-review`.

## Ordering Rules

- Roadmap order comes from the optional integer `order` field, not from the
  milestone id prefix and not from the filename.
- Use `roadmap-status` or `roadmap-overview` order, never id-prefix order, as
  the sequencing source. The reported `displayOrdinal` is a rendering of
  position; the `order` integer is the stored value the command writes.
- Milestone ownership for standalone work items is defined by
  `planned_change.milestone`, so reordering a milestone carries its owned
  standalone planned-change artifacts with it without rewriting any of them.
- Treat filenames as helpful conventions only. Reorder never renames a file,
  and a planned-change basename stays in its canonical
  `<milestone-id>-<planned-change-id>.yaml` form; when a basename is already
  wrong, `roadmap-sync --fix-names` repairs it, not this skill.

## Preconditions

- **Archived milestones are frozen history.** Reorder applies only to active
  milestones. If the user names an archived milestone, report that and stop
  rather than reviving it to move it.
- **A roadmap with unresolved diagnostics blocks the reorder.** Run
  `roadmap-status` first and resolve blocking diagnostics before mutating; the
  command refuses to run against an invalid roadmap.
- **One command, once.** The placement must be expressible as a single
  `roadmap-reorder` invocation. Needing two is a signal the request is a
  different operation, not an invitation to chain commands.

## Resolving the Placement

Resolve the request into exactly one of these, and pass exactly one:

| the user means | flag |
| --- | --- |
| put it immediately before a named neighbour | `--before <milestone-id>` |
| put it immediately after a named neighbour | `--after <milestone-id>` |
| set a specific stored position | `--order <integer>` |

Prefer `--before` or `--after` when the user describes the move relative to
another milestone, because the command computes the integer and a hand-picked
`--order` can silently collide with an existing value.

If no integer gap exists between the requested neighbours, run
`roadmap-renumber` first, then rerun the reorder. Use `roadmap-renumber` only
when integer gaps are exhausted or the user asks to normalize spacing — it
rewrites every active milestone's `order`, so it is not a routine step before
an ordinary reorder.

## Dependency Order Is the One Judgment Call

Before running the command, inspect the target milestone and its owned planned
changes for dependencies on other milestones or planned changes. If the new
position would place a milestone before work it depends on, report that
dependency-order concern and stop for an explicit human answer instead of
silently moving it.

The command does not read `depends_on` edges, so a reorder that inverts a
dependency succeeds and leaves a roadmap that recommends work before its
prerequisite. This check is the reason the operation is not merely mechanical.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `roadmap-state`. Before the first mutation run
`strict-spec-cli yaml-authoring-protocol roadmap-state`: that command reports
the ordered authoring steps, the owning command for each operation, and the
bundled schema and example keys with their cache-resolved paths, bound to the
artifact kind and current where a copy would go stale. Validate the result with
`strict-spec-cli roadmap-status`.

**Stop rather than edit YAML directly.** When a required command, argument, or
artifact kind is unavailable, stop and report the missing capability. Editing
the YAML directly, writing a raw payload, or scripting around the CLI is never
an available fallback, and an unavailable command is a reason to stop rather
than a reason to improvise.

## Preferred Human Language

Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` —
the user's common human language, not a programming language — for all
user-facing and generated operator-facing text, unless that file is absent or
the active user message asks otherwise.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Confirm the request is a reorder** — the request must name one active
   milestone and a target position. If it names a planned change, a status
   change, or milestone content, route it to the skill that owns that work
   rather than reordering something adjacent.

2. **Load targeted roadmap context** — read `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/roadmap/INDEX.yaml`, the target milestone YAML file
   under `.strict-spec-driven/roadmap/milestones/`, and the milestone files
   named as neighbours. Read only what the placement needs.

3. **Inspect deterministic state** — run:
   ```bash
   strict-spec-cli roadmap-status
   ```
   If human-readable context helps, also run `roadmap-overview`. Use the
   reported milestone ids, `order` values, `declaredStatus`, `derivedStatus`,
   and diagnostics as the facts for this reorder. Resolve blocking diagnostics
   before mutating.

4. **Resolve the placement into one flag** — translate the request into exactly
   one of `--before`, `--after`, or `--order`, using the reported order rather
   than id prefixes. If the request is ambiguous about which neighbour it means,
   stop and ask rather than choosing the more likely one.

5. **Check dependency order** — inspect `depends_on` edges on the target
   milestone and its owned standalone planned changes. Report any
   dependency-order concern the new position would create and stop for an
   explicit human answer.

6. **Renumber only if the gap is exhausted** — if no integer gap exists between
   the requested neighbours, run:
   ```bash
   strict-spec-cli roadmap-renumber
   ```
   then rerun `roadmap-status` to read the new spacing before the reorder.

7. **Run the owning command once** — run `roadmap-reorder` with the single
   resolved placement flag. Inspect the structured result rather than assuming
   success: confirm it is valid, that it reports the expected milestone and new
   `order`, and that the changed paths are only the milestone artifact plus the
   roadmap index.

8. **Report the result** — summarize the milestone id, its previous and new
   `order` and position, whether a renumber ran and why, any dependency-order concern
   raised and how the user resolved it, any warnings the command
   relayed, and the natural next step: `/strict-roadmap-recommend` to see which
   work the new order recommends first.

## Rules

- Perform exactly one reorder per invocation, through the one owning command
- Pass exactly one of `--before`, `--after`, or `--order`; never combine them
- Keep every artifact this skill touches rooted in `.strict-spec-driven/roadmap/`
- Archived milestones are frozen history; never reorder or revive them
- Never hand-edit a milestone file to change an `order` field — the owning
  command exists so the canonical write and index sync stay deterministic
- Never rename a milestone or planned-change file as a way of changing order;
  order lives in the `order` field, not in the filename
- Never write under `.strict-spec-driven/changes/` from this skill
- Run `roadmap-renumber` only when integer gaps are exhausted or the user asks
  for it, and say so in the report when it runs
- Stop for an explicit human answer when the new position would place a
  milestone before work it depends on
