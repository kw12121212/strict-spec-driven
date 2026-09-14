---
name: strict-roadmap-recommend
description: Recommend the next strict roadmap-backed change, then scaffold it as a normal strict change without extra user interaction.
metadata:
  skill_id: strict_roadmap_recommend
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user choose the next strict roadmap-backed change and turn
that recommendation into a normal strict change without pausing for human
confirmation during the recommend step.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-status: strict-spec-cli roadmap-status
roadmap-recommend: strict-spec-cli roadmap-recommend [--milestone <milestone-id>] [--allow-unrefined]
propose: strict-spec-cli propose <change-name>
generate: strict-spec-cli generate <change-name> <proposal|design|questions|tasks|delta-spec|delta-tech> --<named-args>
ready: strict-spec-cli ready <change-name>
```

## Roadmap Linking Rules

- Milestone ownership is defined by `planned_change.milestone`.
- Do not expect milestone files to list standalone planned-change file paths.
- Use `roadmap-status` output to locate planned-change source files; each
  `plannedChanges[]` entry reports its `path`.
- Treat filenames as helpful conventions only. `planned_change.id` and
  `planned_change.milestone` are the source of truth.
- If `roadmap-status` reports legacy inline milestone `planned_changes`, stop
  and materialize them before recommending work.

## Roadmap Hint Parameters

When the user supplies a roadmap hint or parameter with the request, treat it as
a milestone selector before running the recommendation command.

- If the hint is an exact milestone id, use it directly.
- If the hint is only a number, resolve it to the milestone whose id has the
  matching numeric prefix after ignoring leading zeros. For example, `5`
  resolves to a single milestone id such as `0005-migration-and-self-hosting`
  when that is the only milestone with numeric prefix `5`.
- If the hint is not numeric, first try an exact milestone id match, then a
  case-insensitive substring match against milestone id or title.
- Use `.strict-spec-driven/roadmap/INDEX.yaml` or `roadmap-status` only to
  resolve the milestone selector. Do not inspect broad planned-change context
  before running the scripted recommendation.
- If the hint matches zero milestones or more than one milestone, stop and
  report the ambiguity. Do not manually choose a planned change.
- After resolving the hint to exactly one milestone id, run
  `strict-spec-cli roadmap-recommend --milestone <resolved-milestone-id>` and
  treat that scripted result as authoritative.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `change-planning-state`, `change-delta-state`. Before
the first mutation run `strict-spec-cli yaml-authoring-protocol
<artifact-kind>` for each of them: that command reports the ordered authoring
steps, the owning command for each operation, and the bundled schema and
example keys with their cache-resolved paths, bound to the artifact kind and
current where a copy would go stale. Validate the result with `strict-spec-cli
verify <change-name>`.

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

## Roadmap-Backed Intake Evidence

Apply the same plain change-intake checklist used by proposal skills, but treat
the selected roadmap data as first-class evidence. The selected standalone
planned-change `summary`, `details`, `depends_on`, labels, and owning milestone
`details` can answer checklist items. Carry those answers into
generated proposal, design, task, question, and delta artifacts instead of
asking the human again.

Preserve the existing rule that `roadmap-recommend` chooses exactly one eligible
planned change through the scripted command; do not manually select another
candidate. Do not mutate roadmap planned-change files during proposal creation
except through the existing roadmap workflows.

When roadmap detail is thin or focused spec/code search fails to identify
affected behavior, create `questions.yaml.open` entries before implementation.
Human-facing question text, context, impact, recommendations, options, and
summaries must use `preferred_human_language`. The open-question impact must
be included in `questions.yaml.open[*].context`, because the `questions`
generator has no `--impact` or `--recommendation` flags. The context must name
whether the uncertainty affects proposal scope, spec delta, implementation
files, tests, dependencies, or technical standards.

## Spec and Technical Artifact Routing

A strict change may legitimately have no delta spec. Do not invent a
`delta-spec` just to satisfy artifact shape.

- Create `delta-spec` artifacts only when the roadmap-backed change modifies
  user-observable behavior or another requirement that belongs in a strict YAML
  main spec.
- For purely technical roadmap-backed changes such as refactors, build or test
  tooling, repository maintenance, architecture constraints, scripts,
  validation flows, archive behavior, or skill guidance, leave `specs/` empty
  when no main spec requirement changes.
- If a technical-only change alters, adds, or retires an engineering rule,
  create a `delta-tech` artifact for the affected standard. If it only complies
  with existing standards, leave `tech/` absent too.
- A technical-only change still needs complete workflow tasks: script or
  tooling edits when applicable, focused tests, validation commands,
  `ready`/`verify` checks, and archive-readiness or archive-merge checks when
  the change affects artifacts consumed by archive.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Obtain the scripted recommendation first** — if the user supplied a roadmap
   hint, resolve it with the Roadmap Hint Parameters rules, then run
   `strict-spec-cli roadmap-recommend --milestone <resolved-milestone-id>`.
   Without a user roadmap hint, run `strict-spec-cli roadmap-recommend`. Run the
   scripted recommendation command before reading broad roadmap context,
   selecting work, or opening candidate planned-change files, and treat the
   command's selected planned change as authoritative for the recommendation
   step. The scripted result already accounts for active strict change
   conflicts, invalid roadmap state, dependency blockers, and milestones
   awaiting refinement. The concise JSON output includes a `status` field with
   one of four values. Branch on `status`:
   - `"roadmap-error"` — the roadmap has validation diagnostics, or a
     `--milestone` selector named a milestone awaiting refinement. Surface the
     JSON diagnostics and stop. Suggest running `roadmap-status` for details.
     When the diagnostic names `--allow-unrefined`, report the refusal and the
     override to the user; **never supply `--allow-unrefined` yourself.** The
     gate exists to stop automation building a placeholder, and an override an
     agent adds on its own is not a gate.
   - `"refine-milestone"` — the earliest-ordered incomplete milestone is
     deliberately deferred, so no implementation work is recommended. Do **not**
     scaffold a strict change. Surface `refineAction` with the milestone id and
     the recorded `reason`, and tell the user their options: elaborate that
     milestone through `/strict-roadmap-transition` with the `refine`
     operation, or run the reported `releaseWith` command to pause it so later
     milestones' work becomes recommendable. Then stop.
   - `"no-candidate"` — the roadmap is valid but no planned change is eligible
     right now. Surface `candidateSummary` and the actionable `blockers[]`
     entries with their `skipReasons`, then stop. If the concise output is not
     enough to explain the blockers, rerun
     `strict-spec-cli roadmap-recommend --details` or
     `strict-spec-cli roadmap-recommend --milestone <resolved-milestone-id> --details`
     and surface the full `candidates[].skipReasons`.
   - `"recommended"` — proceed to step 2 with the returned recommendation.
   Do not manually choose among planned changes; branch on `status`
   instead of manually choosing among planned changes. Use the returned
   recommendation `path` to open the exact standalone planned-change file you
   are recommending from.

2. **Read targeted recommendation context** — after a successful scripted
   recommendation, read only the files needed to explain and scaffold that
   selected change:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/roadmap/INDEX.yaml`
   - the owning milestone YAML file for the selected planned change
   - the standalone planned-change YAML artifact reported by the
     scripted recommendation result `path`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - the strict YAML main specs the selected change is likely to touch, if any;
     for a purely technical selected change, confirm from the spec index that no
     main spec requirement is implicated instead of forcing one
   - `roadmap-status` output only when needed to explain diagnostic context or
     legacy inline planned-change state
   - the owning milestone YAML file's `details` field, if present, as targeted
     planning guidance for the recommended change
   - the selected standalone planned-change artifact's `details` field, if the
     planned change comes from a split-file artifact
   Use the selected roadmap fields as change-intake evidence before generating
   artifacts. If the roadmap data and focused repository search do not identify
   scope, specs, implementation, tests, dependencies, or technical standards,
   record blocking questions rather than guessing.

3. **Present a checkpoint before scaffolding** — summarize:
   - the proposed change name
   - the milestone it comes from
   - the standalone planned-change file path from the scripted recommendation result
   - why it is the best next step
   - which strict specs are likely to change, or that no strict spec changes
     are expected for a technical-only change
   - any open questions that would need to go into the strict change proposal
   Include any intake questions that result from thin roadmap details, missing
   implementation/test/spec impact, dependency uncertainty, or technical
   standard uncertainty.
   Do not stop for human confirmation here — use the checkpoint only to explain
   the recommendation before creating the scaffold.

4. **Scaffold the recommended change immediately** — run:
   ```bash
   strict-spec-cli propose <change-name>
   ```
   Then populate normal strict change artifacts under
   `.strict-spec-driven/changes/<change-name>/` in this exact order. Generate
   every supported artifact, including `tasks.yaml`, with direct named
   arguments, and do not create JSON payload files.
   - `strict-spec-cli generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..." --milestone <milestone-id> --planned-change <planned-change-id>`
   - `strict-spec-cli generate <change-name> design --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."`
   - populate `tasks.yaml` with `strict-spec-cli generate <change-name> tasks`, **one invocation per task** so no task list is hand-written:
     - read `strict-spec-cli generate --help --json` (or `--help`) first.
       Choose `--implementation`, `--testing`, or `--verification` for the
       corresponding fixed section. Each takes no value and opens one task group;
       following task fields belong to that group. Repeat a selector for each task
       in a multi-task call. Removal and gate flags are global and need no selector.
     - first task: `strict-spec-cli generate <change-name> tasks --implementation --task <task-id> --text "..." [--status pending|complete] [--command "..."]` — the task list starts absent and is created by this first call, so there are no placeholder tasks to remove
     - each later task: one selector/`--task`/`--text` group per call
     - restating an existing `(section, task-id)` is a field-level merge — it overwrites only the fields you pass, so a task's `status: complete` and `command` survive a text-only edit; a brand-new task still needs `--text`
     - delete a task with `--remove <task-id>` (a repeatable global flag); to move a task between sections, `--remove` it and restate it under the new section in the same call
     - place a task with `--before <task-id>` or `--after <task-id>` instead of letting
       it append; task order is the order `apply` walks, so a task that must run before
       existing pending work is anchored rather than appended, and naming an existing
       task id with an anchor moves it there while preserving its `status` and
       `command`
     - values may begin with a dash via `--text=...` or `--command=...` (the `--flag=value` form)
     - set the gates with `--validation-task <task-id>` and `--unit-test-task <task-id>`; both must reference `Testing` task ids
     - the command upserts by `(section, task-id)` and is idempotent; each call returns `{valid, ready, diagnostics}` — `valid` reports write success and `ready` reports completeness, so a `ready: false` result naming empty sections or unset gates is not a failed write, keep adding tasks and confirm with `verify` before handoff
     - cover concrete Implementation tasks for script, tooling, generated asset, documentation, or skill-prompt edits in scope; Testing tasks with runnable validation and unit/regression commands; and Verification tasks for `ready`, `verify`, and archive-readiness or archive-merge checks when relevant
   - `strict-spec-cli generate <change-name> questions --open <question-id> --question "..." --context "..."`
     Include impact analysis and recommendation/options in `--context`; do
     not pass nonexistent `--impact` or `--recommendation` flags.
   - only when the change has observable spec impact, `strict-spec-cli generate <change-name> delta-spec --target-spec <spec-id> --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."` for each target spec
     One requirement can include multiple scenario groups by repeating
     `--scenario`. A later compatible call for the same operation, requirement
     id, strength, and statement appends new scenario ids and remains idempotent
     for equivalent scenarios. Scenarios append on their own, so nothing needs rebuilding or hand-editing to add one. Drop a single scenario with `--remove-scenario <requirement-id>:<scenario-id>` and a whole requirement with `--remove-requirement <id>`.
   - when the change alters a technical standard, generate delta tech under `.strict-spec-driven/changes/<change-name>/tech/` with `generate <change-name> delta-tech --target-standard <id> ...`; for user interface work, capture observable UI behavior as delta-spec requirements and UI engineering and design rules as a `ui`-category technical standard, with visual fidelity governed by visual-regression snapshots rather than inlined
   - if the change has no observable spec impact, leave the `specs/` directory
     empty rather than inventing a prose-only file
   Prefer one invocation per supported generated artifact (or per target spec
   for delta specs).
   Do this without copying full milestone-level planning metadata into the
   change. If the selected planned change is a standalone artifact, keep that
   artifact as the canonical home for its status, summary, dependencies, and
   details. If the owning milestone has a `details` field or the standalone
   planned-change artifact has a `details` field, extract only the portions
   relevant to the selected planned change and use them as targeted planning
   guidance when generating the change artifacts. Do not copy the full milestone
   plan or the full planned-change details — only extract guidance relevant to
    this one planned change. If `details` is absent, proceed normally.

5. **Run the proposal checkpoint and validate the proposed strict change** —
   before running `ready`, perform a proposal checkpoint over the populated
   change artifacts against the selected roadmap planned change, relevant main
   specs, technical standards, and project constraints. Check for decision-ready
   detail in scope, unchanged behavior, design decisions, task coverage,
   unresolved-question impact, delta spec scenarios, and delta tech use when
   applicable. When no delta specs are appropriate, replace delta spec scenario
   review with a justified absence check for the technical-only change. For technical-only changes, verify that
   tasks cover scripts or tooling, validation commands, `ready`/`verify`, and
   archive or archive-merge checks when archive behavior is affected. The checkpoint should fix safe,
   in-scope documentation gaps immediately, and record real ambiguity in
   `questions.yaml` without expanding scope or answering unresolved human
   questions.

   Then run:
   ```bash
   strict-spec-cli ready <change-name>
   ```
   Use `ready` as the proposal handoff validation for deterministic blockers.
   Do not run a separate full verify command at proposal time solely to
   rediscover expected pending implementation tasks. Do not stop for human
   question resolution during `strict-roadmap-recommend`; leave open questions
   for `strict-spec-auto` or `strict-spec-apply` to surface before
   implementation.

6. **Automatically continue with implementation** — immediately hand off to the
   `/strict-spec-auto <change-name>` skill with the populated change scaffold
   to carry the recommended change through the rest of the strict lifecycle
   (review, apply, verify, archive). If `questions.yaml.open` is non-empty,
   `strict-spec-auto` will surface those questions before implementation
   begins. Do not offer a choice or ask the user which workflow to use — hand
   off to `strict-spec-auto` and follow its guidance, however the running
   harness loads it, relying on its populated-scaffold resume path instead of
   regenerating the planning artifacts.

## Rules

- Recommend only work that already exists under `.strict-spec-driven/roadmap/`
- Keep `.strict-spec-driven/roadmap/` as the canonical home of milestone-level
  and planned-change planning metadata
- Use the standalone planned-change artifact path from the scripted
  recommendation result when opening or quoting roadmap work
- Convert exactly one planned change into one normal strict change scaffold
- Do not pause for user confirmation during the recommend step
- Do not manually choose among eligible roadmap planned changes once the
  scripted recommendation command returns a recommendation
