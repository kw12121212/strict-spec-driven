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
roadmap-recommend: strict-spec-cli roadmap-recommend [--milestone <milestone-id>]
propose: strict-spec-cli propose <change-name>
generate: strict-spec-cli generate <change-name> <proposal|design|questions|delta-spec|delta-tech> --<named-args>
ready: strict-spec-cli ready <change-name>
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
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `change-planning-state`, `change-delta-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli propose --help --json`, `strict-spec-cli generate --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show change-proposal`, `strict-spec-cli schema-show change-design`, `strict-spec-cli schema-show task-list`, `strict-spec-cli schema-show question-list`, `strict-spec-cli schema-show delta-spec`, `strict-spec-cli schema-show delta-tech`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show change-proposal`, `strict-spec-cli sample-show change-design`, `strict-spec-cli sample-show task-list`, `strict-spec-cli sample-show question-list`, `strict-spec-cli sample-show delta-spec`, `strict-spec-cli sample-show delta-tech`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli propose`, `strict-spec-cli generate`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
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
   conflicts, invalid roadmap state, and dependency blockers. The concise JSON
   output includes a `status` field with one of three values. Branch on
   `status`:
   - `"roadmap-error"` — the roadmap has validation diagnostics. Surface the
     JSON diagnostics and stop. Suggest running `roadmap-status` for details.
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
     - first task: `strict-spec-cli generate <change-name> tasks --section <Implementation|Testing|Verification> --task <task-id> --text "..." [--status pending|complete] [--command "..."]` — the task list starts absent and is created by this first call, so there are no placeholder tasks to remove
     - each later task: one `--section`/`--task`/`--text` group per call
     - restating an existing `(section, task-id)` is a field-level merge — it overwrites only the fields you pass, so a task's `status: complete` and `command` survive a text-only edit; a brand-new task still needs `--text`
     - delete a task with `--remove <task-id>` (a repeatable global flag); to move a task between sections, `--remove` it and restate it under the new section in the same call
     - values may begin with a dash via `--text=...` or `--command=...` (the `--flag=value` form)
     - set the gates with `--validation-task <task-id>` and `--unit-test-task <task-id>`; both must reference `Testing` task ids
     - the command upserts by `(section, task-id)` and is idempotent; each call returns `{valid, ready, diagnostics}` — `valid` reports write success and `ready` reports completeness, so a `ready: false` result naming empty sections or unset gates is not a failed write, keep adding tasks and confirm with `verify` before handoff
     - cover concrete Implementation tasks for script, tooling, generated asset, documentation, or skill-prompt edits in scope; Testing tasks with runnable validation and unit/regression commands; and Verification tasks for `ready`, `verify`, mapping checks, and archive-readiness or archive-merge checks when relevant
   - `strict-spec-cli generate <change-name> questions --open <question-id> --question "..." --context "..."`
     Include impact analysis and recommendation/options in `--context`; do
     not pass nonexistent `--impact` or `--recommendation` flags.
   - only when the change has observable spec impact, `strict-spec-cli generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."` for each target spec
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
   unresolved-question impact, delta spec scenarios, delta tech use when
   applicable, and structured mapping fields. When no delta specs are
   appropriate, replace delta spec scenario review with a justified absence
   check for the technical-only change. For technical-only changes, verify that
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

6. **Automatically continue with implementation** — immediately invoke the
   `/strict-spec-auto <change-name>` skill with the populated change scaffold
   to carry the recommended change through the rest of the strict lifecycle
   (review, apply, verify, archive). If `questions.yaml.open` is non-empty,
   `strict-spec-auto` will surface those questions before implementation
   begins. Do not offer a choice or ask the user which workflow to use —
   invoke the `strict-spec-auto` skill via the Skill tool (do not run it as a
   bash command or raw slash command), and rely on its populated-scaffold
   resume path instead of regenerating the planning artifacts.

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
