---
name: strict-spec-brainstorm
description: Discuss and shape a strict YAML change from a rough idea, then after explicit confirmation scaffold the proposal artifacts.
metadata:
  skill_id: strict_spec_brainstorm
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user turn an early-stage idea into a strict YAML change
proposal.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
tech-status: strict-spec-cli tech-status
lesson-status: strict-spec-cli lesson-status [--category <category>]
propose: strict-spec-cli propose <change-name>
generate: strict-spec-cli generate <change-name> <proposal|design|questions|tasks|delta-spec|delta-tech> --<named-args>
generate-delta-scene: strict-spec-cli generate <change-name> delta-scene --<named-args>
scene-status: strict-spec-cli scene-status [--area <area>] [--scene <scene-id>]
ready: strict-spec-cli ready <change-name>
verify: strict-spec-cli verify <change-name>
```

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `change-planning-state`, `change-delta-state`,
`scene-state`. Before the first mutation run `strict-spec-cli yaml-authoring-protocol
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

## Delegated Procedures

Each procedure below is owned by the skill named beside it. That skill's
guidance is authoritative for it, and this skill does not restate it. Follow the
owning skill's procedure at the step that needs it; how it is loaded is whatever
the running harness provides.

- requirement-interrogation: owned by `strict-spec-propose`
- scene-first-routing: owned by `strict-spec-propose`
- change-intake-gate: owned by `strict-spec-propose`
- spec-artifact-routing: owned by `strict-spec-propose`
- delta-artifact-authoring: owned by `strict-spec-propose`
- task-list-authoring: owned by `strict-spec-propose`

Delegation moves where a procedure is stated, never whether it runs. Every gate
this skill declares below still binds, and a delegated procedure that cannot be
followed stops the run exactly as an inline one would.

What brainstorming adds to those procedures stays here: the change-intake gate
runs before this skill's own proposal confirmation checkpoint, not only before
implementation handoff, because a summary the user confirms is already a
commitment.


## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Start from the idea, not the artifact list** — ask the user what they want
   to achieve, what problem they are trying to solve, and any known constraints
   or preferences. Do not require a change name up front.

2. **Read strict project context, existing specs, and technical standards
   early** — before narrowing scope, read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every relevant strict YAML main spec file the idea appears likely to touch,
     if any; for a purely technical change, confirm from the spec index that no
     main spec requirement is implicated instead of forcing one
   - run `strict-spec-cli tech-status` and read
     the relevant files under `.strict-spec-driven/tech/` so the brainstorm
     stays inside the project's technical standards from the start
   - select the lesson category that matches the likely spec or technical area, run
     `strict-spec-cli lesson-status --category <category>`, and read the lessons it ranks first.
     Repeat for another category when the idea genuinely spans more than one; use the unfiltered
     command only when repository evidence cannot identify a relevant category.
     Lessons are recorded experience, not binding rules: they carry no MUST or
     SHOULD strength, so treat each one as a warning worth checking against this
     change rather than a constraint to satisfy. Match on `applies_when` — that
     field states the condition under which the lesson is worth recalling. A
     lesson with several occurrences has bitten this project repeatedly and
     deserves weight even though nothing enforces it.
   Use this evidence to run the delegated change-intake-gate procedure before
   asking the human for details the repository already answers.

3. **Brainstorm until the change is decision-ready** — use the discussion to
   converge on:
   - the desired outcome and user-visible behavior
   - what is in scope and explicitly out of scope
   - important tradeoffs, constraints, risks, and unchanged behavior
   - how the idea fits the applicable technical standards: MUST rules are hard
     constraints on the approach, SHOULD rules are the default, and any tension
     with a standard is a tradeoff to settle now or raise as an open question
   - for user interface work, how it splits: user-observable UI behavior becomes
     spec requirements, UI engineering and design rules become a `ui`-category
     technical standard, and visual fidelity is governed by visual-regression
     snapshots rather than inlined detail
   - which existing strict YAML spec files will likely be modified, or whether a
     new strict spec area is needed, or why no strict spec area should change
     because the change is purely technical, decided with the delegated
     spec-artifact-routing procedure
   - the answers the delegated requirement-interrogation procedure asks for, which
     only the requester can give and which shape every choice above
   - the situation the idea occurs in, asked with the delegated
     scene-first-routing procedure before any requirement is discussed, so the
     spec areas above are derived from a flow rather than recalled
   - any other questions that still need a human answer before implementation

4. **Suggest the change name** — once the idea is coherent enough, propose a
   short kebab-case change name. If the user already provided a valid name, keep
   it. Otherwise derive one from the agreed strict workflow scope.

5. **Present a proposal checkpoint** — before creating any files, summarize:
   - the proposed change name
   - the goal and scope
   - the main strict spec areas expected to change, or "no strict spec changes"
     with the technical-only rationale
   - key decisions or tradeoffs already settled
   - any unresolved questions that would go into `questions.yaml`

   Then ask for explicit confirmation. If the user wants revisions, continue the
   brainstorm and re-summarize until confirmed.

6. **Scaffold the change after confirmation** — run:
   ```bash
   strict-spec-cli propose <change-name>
   ```
   This creates `.strict-spec-driven/changes/<name>/` with strict planning
   artifacts and an empty `specs/` directory for strict YAML delta files.

7. **Populate `proposal.yaml` and related artifacts step by step** — after
   scaffolding, follow this exact order. Generate every supported artifact,
   including `tasks.yaml`, with direct parameterized CLI invocations, and do not
   create JSON payload files.
    - `strict-spec-cli generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..."`
    - `strict-spec-cli generate <change-name> design --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."`
    - populate `tasks.yaml` by following the delegated task-list-authoring
      procedure
    - `strict-spec-cli generate <change-name> questions --open <question-id> --question "..." --context "..."` plus any needed `--resolved` entries
      Include impact analysis and recommendation/options in `--context`; do
      not pass nonexistent `--impact` or `--recommendation` flags.
    - when the change touches user-observable behavior, `strict-spec-cli generate <change-name> delta-scene --target-scene <scene-id> --operation ADDED --step <step-id> --action "..." --covered-by <spec-id>:<requirement-id>`
      before the delta spec below, following the delegated scene-first-routing
      procedure; run `strict-spec-cli scene-status` first to find a recorded
      scene that already describes the situation
    - only when the change has observable spec impact, `strict-spec-cli generate <change-name> delta-spec --target-spec <spec-id> --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."`
      once per target strict main spec path, following the delegated
      delta-artifact-authoring procedure
    - when the change alters a technical standard, `strict-spec-cli generate <change-name> delta-tech --target-standard <standard-id> [--title "..." --category <category>] --operation ADDED --rule <rule-id> --strength MUST --statement "..." --rationale "..." --method review`
    If the change has no observable spec impact, leave the `specs/` directory
    empty rather than inventing a prose-only file. Prefer one invocation per
    supported generated artifact (or per target spec for delta specs) so
    generated YAML matches the full document shape immediately.

8. **Run the proposal checkpoint over generated planning artifacts** — before
   validation, perform a semantic self-check of every generated or edited file under
   `.strict-spec-driven/changes/<change-name>/` against the confirmed brainstorm
   summary, the relevant main specs if any, technical standards, and the
   existing project constraints. Check for decision-ready detail in scope,
   unchanged behavior, design decisions, task coverage, unresolved-question
   impact, delta spec scenarios, and delta tech use when applicable. When no
   delta specs are appropriate, replace delta spec scenario review with a
   justified absence check for the technical-only change.
   For technical-only changes, verify that the task list includes the concrete
   scripts or generated assets to edit, validation commands to run, strict
   `ready`/`verify` checks, and archive or archive-merge checks whenever the
   change affects artifacts that archive consumes.
   The checkpoint should fix safe, in-scope documentation gaps immediately by
   rerunning the supported `generate` commands for script-owned artifacts,
   including `generate <change-name> tasks` for task-list structure. Do not
   expand scope or answer unresolved human questions during this checkpoint;
   record ambiguity in `questions.yaml` or return to the user checkpoint when the
   scope changes.

9. **Validate proposal readiness and artifact structure** — run:
   ```bash
   strict-spec-cli ready <change-name>
   ```
   Use this as the deterministic proposal-handoff check. It reports structural
   blockers without asking the CLI to decide product scope or requirement
   content. Then run:
   ```bash
   strict-spec-cli verify <change-name>
   ```
   Use this as a strict YAML schema and artifact-shape check. At proposal time,
   pending-task diagnostics are expected because implementation has not started
   yet. Fix safe structure issues before handing the proposal off.

10. **Hand off** — summarize the strict change scope, key decisions, whether
   delta specs are present or intentionally absent, proposal checkpoint
   refinements made, task count, unchanged behavior, and any open questions. If
   `questions.yaml` still has open entries, make clear that implementation must
   stop for explicit user resolution before coding starts.

## Rules

- Do not implement code during brainstorming
- Do not scaffold proposal artifacts until the user explicitly confirms the
  brainstorm summary and change name
- Keep all planning artifacts in strict YAML structures under
  `.strict-spec-driven/`
- Record ambiguity in `questions.yaml` instead of guessing silently
