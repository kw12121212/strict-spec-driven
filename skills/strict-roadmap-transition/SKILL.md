---
name: strict-roadmap-transition
description: Perform one strict roadmap state transition — pause, resume, defer, refine, move, reopen, archive, or sync — through its owning strict CLI command, selected by an explicit operation named in the request.
metadata:
  skill_id: strict_roadmap_transition
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user move strict roadmap state from one condition to
another. Every transition this skill performs is one CLI command against
`.strict-spec-driven/roadmap/`. The skill's job is to pick the right one, check
the preconditions that command does not check for you, run it once, and report
what moved.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-status: strict-spec-cli roadmap-status
roadmap-overview: strict-spec-cli roadmap-overview
roadmap-recommend: strict-spec-cli roadmap-recommend [--details] [--milestone <milestone-id>]
roadmap-pause: strict-spec-cli roadmap-pause <milestone-id> [--reason "..."]
roadmap-resume: strict-spec-cli roadmap-resume <milestone-id> [--reason "..."]
roadmap-defer: strict-spec-cli roadmap-defer <milestone-id> [--reason "..."]
roadmap-refine: strict-spec-cli roadmap-refine <milestone-id> [--reason "..."]
roadmap-move-planned-change: strict-spec-cli roadmap-move-planned-change <planned-change-id> --milestone <milestone-id> [--allow-complete]
roadmap-reopen: strict-spec-cli roadmap-reopen <milestone-id> [--reason "..."]
roadmap-archive: strict-spec-cli roadmap-archive [milestone-id]
roadmap-sync: strict-spec-cli roadmap-sync
roadmap-sync-materialize: strict-spec-cli roadmap-sync --materialize-planned-changes
roadmap-sync-fix-names: strict-spec-cli roadmap-sync --fix-names
roadmap-generate-planned-change: strict-spec-cli roadmap-generate planned-change --milestone <milestone-id> --id <planned-change-id> --summary "..." --details "..."
```

## Operations

The request names exactly one operation. Each maps one to one onto its owning
CLI command; there is no operation this skill performs by combining two.

| operation | target | owning command | effect |
| --- | --- | --- | --- |
| `pause` | milestone | `roadmap-pause` | hold a milestone out of recommendation and force it `blocked` |
| `resume` | milestone | `roadmap-resume` | clear a pause so status re-derives from planned-change state |
| `defer` | milestone | `roadmap-defer` | declare a milestone planned but not yet elaborated |
| `refine` | milestone | `roadmap-refine` | clear an awaiting-refinement declaration once its precondition matured |
| `move` | planned change | `roadmap-move-planned-change` | move one planned change to another milestone and rename it canonically |
| `reopen` | milestone | `roadmap-reopen` | reopen a completed milestone and seed a follow-up planned change |
| `archive` | milestone | `roadmap-archive` | relocate completed milestones and their completed planned changes |
| `sync` | whole roadmap | `roadmap-sync` | reconcile roadmap state against active and archived strict changes |

## Selecting the Operation

**The operation must be explicit.** Read it from the request — the operation
name, the slash-command form, or an unambiguous restatement of exactly one row
above.

When the request names no operation, or its wording fits more than one row,
stop and ask the user which of the eight is intended before running anything.
Do not infer the operation from roadmap state, and do not pick the operation
that seems most useful. Naming the wrong row is not a recoverable mistake:
`pause` and `resume` undo each other, `defer` and `refine` undo each other, and
`archive` and `reopen` move milestones in opposite directions.

Two neighbouring requests are not this skill's work at all:

- authoring or elaborating milestone and planned-change content is
  `/strict-roadmap-plan` and `/strict-roadmap-review`
- choosing and scaffolding the next change is `/strict-roadmap-recommend`
- changing a milestone's position in roadmap order is `/strict-roadmap-reorder`

## Roadmap Linking Rules

- Milestone ownership for standalone work items is defined by
  `planned_change.milestone`.
- Do not expect milestone files to list standalone planned-change file paths.
- Use `roadmap-status` output to locate planned-change source files; each
  `plannedChanges[]` entry reports its `path`.
- Treat filenames as helpful conventions only. `planned_change.id` and
  `planned_change.milestone` are the source of truth.
- Use `roadmap-status` or `roadmap-overview` order, never id-prefix order, as
  the sequencing source.

## Preconditions Every Operation Shares

- **Archived milestones and archived planned changes are frozen history.** No
  operation here may pause, resume, defer, refine, move, reopen, or
  re-archive them. If the user names an archived target, report that and stop
  rather than reviving it.
- **Completed planned changes are immutable.** Follow-up work is always a new
  standalone planned-change artifact, never an edit to one that shipped.
- **Filenames are computed, never chosen.** A standalone planned-change file's
  basename must be the canonical `<milestone-id>-<planned-change-id>.yaml` form
  (the prefix is not duplicated when the id already starts with the milestone
  id). `roadmap-generate planned-change` and `roadmap-move-planned-change`
  compute it; `roadmap-sync --fix-names` repairs it. Never pick or rename a
  planned-change filename by hand — a mismatched basename is a blocking
  validation diagnostic.
- **A roadmap with unresolved diagnostics blocks the transition.** Run
  `roadmap-status` first and resolve blocking diagnostics before the mutation;
  most of these commands refuse to run against an invalid roadmap.
- **One command, once.** Translate the request into a single owning-command
  invocation. If it cannot be expressed as one, that is a signal the operation
  was misidentified, not an invitation to chain commands.

## Operation Semantics

### pause and resume — a reversible inverse pair

- Pause records a sticky top-level `paused` mapping (`status: true`, optional
  `reason`, deterministic `paused_on` date). While paused, the milestone's
  effective status is forced to `blocked`, surviving `roadmap-sync` canonical
  rewrite, and `roadmap-recommend` skips every planned change it owns with a
  `milestone-paused` skip reason.
- Pause is allowed on any non-archived milestone regardless of declared status.
  Pausing a complete milestone forces it back to blocked and prevents
  `archive` from relocating it until the pause is cleared.
- Resume deletes the `paused` field and lets status re-derive from
  planned-change state. Resuming a milestone that carries no pause exits
  non-zero and changes nothing.
- Neither ever modifies a planned-change file. Pause is meaningful only when
  there is real work to defer; for a complete milestone with no pending work,
  suggest `archive` instead. Pair every pause with a clear resume criterion in
  the `--reason`.

### defer and refine — a reversible inverse pair

- Deferring records a sticky `awaiting_refinement` mapping (`status: true`,
  optional `reason`, deterministic `deferred_on` date) that survives
  `roadmap-sync` canonical rewrite.
- **Deferral is not a pause.** It does not force `blocked`; the milestone keeps
  the status derived from its planned-change state, because work whose detail
  is deferred is not work that is blocked.
- `roadmap-recommend` follows strict roadmap order, so when the
  earliest-ordered incomplete milestone is deferred the command returns
  `status: refine-milestone` and does not fall through to later milestones'
  work. Say that plainly to the user: a long-lived deferral blocks downstream
  work, and `pause` is the supported release valve.
- Deferral is rejected for a milestone whose derived status is `complete`, and
  it never relaxes the milestone schema. A deferred milestone still needs
  `goal`, `scope`, `done_criteria`, and at least one intake question. Record the
  unmatured precondition as an intake question and as the `--reason`; never
  invent content to satisfy the schema.
- Refine records the operator's judgement that the precondition matured and
  clears the declaration. It elaborates nothing: the elaboration itself is
  ordinary in-place editing through `roadmap-generate`. Ask the user directly
  whether the recorded precondition is now true — repository evidence cannot
  answer that, and a milestone that merely gained content has not matured.
- The milestone is one continuous artifact. Never create a successor milestone
  or split it during refinement.

### move — check work state, then dependency order

- A move rewrites the declared `planned_change.milestone` and renames the file
  to its canonical basename in one command, because both must agree.
- The target must be an existing active milestone. If the user names an
  archived or absent milestone, report that rather than creating one.
- A planned change whose strict change is already archived is completed work.
  Moving it can flip the source milestone from complete back to proposed and
  makes the target report work it never contained. Confirm the user really
  wants that before adding `--allow-complete`.
- Inspect `depends_on` edges touching the planned change. If the move would
  leave an earlier milestone depending on work that now sits in a later
  milestone, report that dependency-order concern and stop for an explicit
  human answer.
- The command never edits summary, details, status, or `depends_on`, never
  touches another planned change, and never writes under
  `.strict-spec-driven/changes/`. Relay its non-blocking warnings — a stale
  `proposal.yaml` roadmap linkage is refreshed with the reported
  `strict-spec-cli generate <change-name> proposal` command, by the operator,
  not by this skill.
- Reordering milestones themselves is `/strict-roadmap-reorder`, not this one.

### reopen — only a complete milestone, and history stays frozen

- Reopen appends a dated note, seeds exactly one pending follow-up planned
  change, and rewrites the milestone to the status derived from planned-change
  state — `proposed` while only the seeded follow-up is pending. Milestone
  status is never held sticky.
- If the milestone is `active`, `blocked`, `proposed`, or `planned`, there is
  nothing to reopen; add the follow-up work directly through
  `/strict-roadmap-plan` instead.
- Confirm `frozenPlannedChanges` lists every completed planned change that must
  remain untouched, and refine the seeded follow-up at
  `seededFollowUp.path` with `roadmap-generate planned-change`. Additional gaps
  become further new standalone planned-change artifacts owned by the same
  milestone — never folded back into a completed one.
- Run the `sync` operation afterwards so the reopened milestone and its new
  planned changes participate in the canonical index.

### archive — completed milestones only, all of them by default

- With no `milestone-id`, `roadmap-archive` must default to all unarchived
  milestones, and it archives only milestones whose derived status is complete.
- It moves each archived milestone and its completed standalone planned-change
  files into `.strict-spec-driven/roadmap/archive/`, then rewrites the active
  roadmap index.
- Incomplete milestones and incomplete planned changes stay active and are
  reported as skipped. Read `skippedMilestones` and relay why each was skipped
  rather than reporting a clean archive.
- A paused complete milestone is not archivable until the pause is cleared with
  the `resume` operation.

### sync — reconcile, never invent

- `roadmap-sync` regenerates canonical index state and reconciles milestone and
  planned-change completion against active and archived strict changes.
- When diagnostics report legacy inline milestone `planned_changes`, use
  `roadmap-sync --materialize-planned-changes` to convert them into standalone
  files before reconciliation.
- When diagnostics report a non-canonical planned-change basename, use
  `roadmap-sync --fix-names`; plain `roadmap-sync` only reports the diagnostic.
- Do not invent planned changes during a sync. If the roadmap cannot be
  reconciled safely, stop and ask the user.

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

1. **Resolve the operation** — identify which one of the eight rows in the
   Operations table the request names. If the request names none, or fits more
   than one, stop and ask the user which is intended. Do not proceed on a guess.

2. **Load targeted roadmap context** — read `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/roadmap/INDEX.yaml`, the target milestone YAML file
   under `.strict-spec-driven/roadmap/milestones/`, and the standalone
   planned-change files the operation touches. Read only what the resolved
   operation needs.

3. **Inspect deterministic state** — run:
   ```bash
   strict-spec-cli roadmap-status
   ```
   If human-readable context helps, also run `roadmap-overview`. Use the
   reported milestone order, ids, `declaredStatus`, `derivedStatus`, planned
   change `state` and `path` values, and diagnostics as the facts for this
   transition. Resolve blocking diagnostics before mutating.

4. **Check the operation's own preconditions** — apply the shared preconditions
   and the Operation Semantics section for the resolved operation: the
   archived-artifact immutability rule for every operation, the dependency-order
   confirmation for `move`, the completed-work confirmation before
   `--allow-complete`, the complete-status requirement for `reopen` and
   `archive`, the not-complete requirement for `defer`, the
   declaration-present requirement for `resume` and `refine`, and the human
   confirmation that a deferred precondition has matured before `refine`. Stop
   for an explicit human answer when a precondition is unmet or ambiguous.

5. **Capture the reason** — for `pause`, `resume`, `defer`, `refine`, and
   `reopen`, collect a short concrete reason from the user if one was not
   supplied. A good reason names an observable condition, not a feeling.

6. **Run the owning command once** — run the single command the Operations
   table names for the resolved operation. Inspect the structured result rather
   than assuming success: confirm it is valid, that it reports the expected
   target, and that the changed paths are only the milestone or planned-change
   artifact plus the roadmap index.

7. **Confirm the effect on recommendation when it applies** — for `pause`,
   `resume`, `defer`, and `refine`, run:
   ```bash
   strict-spec-cli roadmap-recommend --details
   ```
   Verify the expected skip reason appeared or cleared: `milestone-paused` for
   pause and resume, `milestone-awaiting-refinement` and the `refineAction` for
   defer and refine.

8. **Report the result** — summarize the operation, the target id, previous and
   new status, the structured field written or cleared, any warnings the command
   relayed, any milestones or planned changes it deliberately left untouched,
   and the natural next step — the inverse operation for `pause` and `defer`,
   `/strict-roadmap-recommend` once work is recommendable again, and
   `roadmap-generate planned-change` to refine a seeded follow-up after `reopen`.

## Rules

- Perform exactly one operation per invocation, through its one owning command
- Require an explicit operation; stop and ask rather than inferring one from
  roadmap state or from what seems most useful
- Keep every artifact this skill touches rooted in `.strict-spec-driven/roadmap/`
- Archived milestones and archived planned changes are frozen history; never
  mutate them, and never rewrite a completed planned change
- Never hand-edit a milestone or planned-change file to add, clear, or change a
  `paused`, `awaiting_refinement`, `milestone`, or status field — the
  owning command exists so the canonical write and index sync stay deterministic
- Never pick or rename a planned-change filename yourself; the CLI computes the
  canonical name and `roadmap-sync --fix-names` repairs it
- Never write under `.strict-spec-driven/changes/` from this skill; relay the
  reported proposal refresh command instead
- Stop for an explicit human answer when a move appears to violate dependency
  order, when a transition moves completed work, or when it would resolve a
  deferral on the user's behalf
- Do not invent planned changes, milestone content, or planned-change state to
  satisfy a schema; record what is unknown as an intake question instead
