---
name: strict-roadmap-reorder
description: Reorder strict roadmap milestones by changing one active milestone order value through the strict roadmap CLI.
metadata:
  skill_id: strict_roadmap_reorder
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user reorder active strict roadmap milestones.

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

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Ordering Model

- Milestone identity is the milestone id; it may be a slug-only id or a legacy
  `NNNN-` prefixed id.
- Roadmap state lives under `.strict-spec-driven/roadmap/`.
- Roadmap order comes from the optional integer `order` field, not from the
  milestone id prefix or filename.
- `roadmap-status` and `roadmap-overview` report milestones in derived roadmap
  order. Use that order as the source of truth before choosing a command.
- `roadmap-reorder` changes exactly one active milestone's `order` field and
  then synchronizes the roadmap index.
- `roadmap-renumber` respreads active milestone order values to the canonical
  gap spacing while preserving relative order.
- Archived milestones are frozen history and cannot be reordered or renumbered.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `roadmap-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli roadmap-reorder --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show roadmap-index`, `strict-spec-cli schema-show roadmap-milestone`, `strict-spec-cli schema-show planned-change`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show roadmap-index`, `strict-spec-cli sample-show roadmap-milestone`, `strict-spec-cli sample-show planned-change`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli roadmap-reorder`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
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

1. **Inspect current roadmap order** — run:
   ```bash
   strict-spec-cli roadmap-status
   ```
   If human-readable context helps, also run `roadmap-overview`. Use the
   returned milestone order, ids, declared statuses, derived statuses, and
   diagnostics as the deterministic facts for this reorder.

2. **Resolve the reorder intent** — translate the user's request into exactly
   one command:
   ```bash
   strict-spec-cli roadmap-reorder <milestone-id> --before <neighbor-id>
   strict-spec-cli roadmap-reorder <milestone-id> --after <neighbor-id>
   strict-spec-cli roadmap-reorder <milestone-id> --order <integer>
   ```
   Do not edit milestone files by hand. If there is no integer gap between the
   requested neighbors, run `strict-spec-cli roadmap-renumber` first, then rerun
   the requested reorder.

3. **Check dependency order** — before running a reorder, inspect the target
   milestone and its owned planned changes for explicit dependencies on other
   milestones or planned changes. If the requested new position would place a
   milestone before work it depends on, report that dependency-order concern and
   ask for confirmation instead of silently moving it.

4. **Run the reorder** — run the resolved `roadmap-reorder` command. Confirm
   the result is valid, reports the changed target, and lists only the expected
   milestone and roadmap index files plus any deterministic sync updates.

5. **Confirm state** — rerun:
   ```bash
   strict-spec-cli roadmap-status
   ```
   Report the new milestone order and any remaining diagnostics.

## Rules

- Reorder only active milestones; archived milestones and archived planned
  changes are immutable
- Use `roadmap-status` or `roadmap-overview` order, never id-prefix order, as
  the sequencing source
- Translate reorder intent into one CLI command; do not hand-edit roadmap YAML
- Use `roadmap-renumber` only when integer gaps are exhausted or the user
  explicitly asks to normalize order spacing
- Stop for an explicit human answer when the requested move appears to violate
  dependency order
