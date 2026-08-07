---
name: strict-roadmap-pause
description: Pause a strict roadmap milestone so it is intentionally held out of recommendation and forced to blocked status until roadmap-resume clears the pause.
metadata:
  skill_id: strict_roadmap_pause
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user pause a strict roadmap milestone that needs to be
deliberately held out of the recommendation pipeline until an external blocker
clears.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-status: strict-spec-cli roadmap-status
roadmap-pause: strict-spec-cli roadmap-pause <milestone-id> [--reason "..."]
roadmap-recommend: strict-spec-cli roadmap-recommend [--details] [--milestone <milestone-id>]
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

## Pause Semantics

- A pause records a sticky top-level `paused` mapping (`status: true`, optional
  `reason`, deterministic `paused_on` date) on the milestone artifact. While
  paused, the milestone's effective status is forced to `blocked`, surviving
  `roadmap-sync` canonical rewrite, and `roadmap-recommend` skips every
  standalone planned change the milestone owns with a `milestone-paused` skip
  reason.
- The pause is fully reversible. `/strict-roadmap-resume` clears the `paused`
  field and lets `roadmap-sync` re-derive status from planned-change state.
- Pause never modifies any standalone planned-change file or any archived
  artifact. It only rewrites the milestone artifact (adding the `paused` field
  plus a dated pause note) and re-syncs the roadmap index.
- Pause is allowed on any non-archived milestone regardless of declared status
  (proposed, planned, active, blocked, or complete). Pausing a complete
  milestone forces it back to blocked and prevents `roadmap-archive` from
  relocating it until the pause is cleared.
- Pause is rejected for unknown milestone ids with a deterministic diagnostic,
  and is rejected when the roadmap already has unresolved diagnostics.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `roadmap-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli roadmap-pause --help --json`, `strict-spec-cli roadmap-sync --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show roadmap-index`, `strict-spec-cli schema-show roadmap-milestone`, `strict-spec-cli schema-show planned-change`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show roadmap-index`, `strict-spec-cli sample-show roadmap-milestone`, `strict-spec-cli sample-show planned-change`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli roadmap-pause`, `strict-spec-cli roadmap-sync`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
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
   under `.strict-spec-driven/roadmap/milestones/`, and the standalone
   planned-change files that the milestone owns.

2. **Confirm the milestone is the right target** — run:
   ```bash
   strict-spec-cli roadmap-status
   ```
   Inspect the milestone's `declaredStatus` and `derivedStatus`, plus each owned
   planned change's `state`. Pause is meaningful when there is real work to
   defer — otherwise suggest `roadmap-archive` for complete milestones with no
   pending work. If the milestone is already paused (the artifact carries a
   `paused` mapping with `status: true`), tell the user and stop unless they
   want to update the reason via another `roadmap-pause` invocation.

3. **Capture the reason and pause** — collect a short, concrete reason for the
   pause from the user if not already provided, then run:
   ```bash
   strict-spec-cli roadmap-pause <milestone-id> --reason "<concrete blocker description>"
   ```
   Confirm the returned `paused.newStatus` is `blocked`, the returned
   `paused.paused.paused_on` is set, and the milestone file now carries the
   structured `paused` field plus a `Paused on ...` note.

4. **Confirm recommendation skips the paused milestone** — run:
   ```bash
   strict-spec-cli roadmap-recommend --details
   ```
   Verify every standalone planned change the milestone owns appears in the
   candidate list with a `milestone-paused` skip reason.

5. **Report the pause result** — summarize the milestone id, previous and new
   status, the structured pause field (status, reason, paused_on), and the
   recommended next step (`/strict-roadmap-resume` when the blocker clears).

## Rules

- Keep the milestone rooted in `.strict-spec-driven/roadmap/`
- Pause only non-archived milestones; archived milestones are immutable
- Never modify any standalone planned-change file during a pause
- Never edit the milestone file by hand to add a `paused` field — use
  `roadmap-pause` so the canonical write and index sync stay deterministic
- Surface ambiguous scope to the user instead of pausing on speculation
- Treat pause as reversible; pair every pause with a clear resume criterion in
  the reason
