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
generate: strict-spec-cli generate <change-name> <proposal|design|questions|delta-spec|delta-tech> --<named-args>
ready: strict-spec-cli ready <change-name>
verify: strict-spec-cli verify <change-name>
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Requirement Interrogation

Run this before the change-intake checklist below. That checklist interrogates
the proposed solution — scope, files, tests, rules. This one interrogates the
need, and it comes first because a well-scoped change built against a misread
need is still the wrong change.

Requirement answers are **never answered from repository evidence**. Code shows
what the system does; it cannot show what a person wants. Only the requester's
own words, or replayed roadmap planned-change and milestone detail, may answer
these. What the requester already said in the active request counts — never
re-ask something they have already told you.

Authoring `questions.yaml` seeds these five as open questions, so a fresh change starts blocked:

- `requirement-problem` — what is concretely going wrong today, and for whom
- `requirement-outcome` — what observable difference proves it is solved
- `requirement-trigger` — why now, what forced this
- `requirement-non-goals` — what must explicitly not change
- `requirement-interpretation` — which reading is intended, where more than one exists

Resolve each with:

```bash
strict-spec-cli generate <change-name> questions --resolve <id> --answer "..." --answered-by human
```

### How to ask

Asking these badly collects five restated solutions and passes the gate, so the
technique is part of the requirement:

- **Ask one question at a time**, and let each answer shape the next. A batch of
  five questions returns five shallow answers.
- **Carry a concrete guess into every question** rather than posing a blank
  prompt. People correct a wrong specific statement far more readily than they
  fill in a blank. Where the harness provides `AskUserQuestion`, use it with two
  to four concrete options so you must commit to a guess.
- **Ask about the last concrete occurrence**, not the general case. Episodic
  memory produces facts; general questions produce theories, and people theorize
  badly about their own workflows.
- **Reject an answer that names a solution** instead of a problem. If it names a
  button, field, page, or endpoint, ask what they would do next once that
  existed, until the answer is a behavior.
- **Ask what happens if nothing is done.** This tests whether the trigger is real.
- **Replay a deliberately imperfect summary** and let them correct it. A
  correction carries more information than agreement.

### Explain before you ask

Never assume the requester knows how to answer. Before posing a question,
**explain why the question matters** and what a sufficient answer contains,
defining any workflow vocabulary — problem versus solution, observable outcome,
non-goal — in plain terms. The requester is the domain expert; you are the
workflow expert, so the vocabulary is your job to explain.

When an answer cannot be used yet, **state the reason for the pushback** and
supply the missing criterion. Never silently re-ask the same question: that
reads as not having listened, and it pushes the requester into repeating
themselves rather than adding what is missing.

When interrogation cannot land — the requester will not engage, or the answer
stays a restated solution — record `--answered-by assumption` rather than
inventing a plausible answer. An assumption blocks `ready` and forces an
explicit human decision; a fabricated answer passes silently and is worse.

## Change Intake Question Gate

Before proposal confirmation or implementation handoff, perform the required
plain change-intake checklist from the strict workflow contract. First use
project evidence to answer every recoverable item: `.strict-spec-driven/config.yaml`,
relevant strict specs, technical standards, existing change artifacts, mapped
implementation and test files, `git status`, and focused code search for the
affected behavior.

- Do not ask the human for information already recoverable from the request or
  repository evidence.
- Do ask when a required answer remains absent after discovery, even if you have
  a plausible guess.
- Record missing required answers in `questions.yaml.open` with stable
  language-neutral ids, `preferred_human_language` question text, concrete
  context that includes impact analysis and a recommended answer or options.
  The `questions` generator has no `--impact` or `--recommendation` flags; put
  those details in the `--context` text.
- Stop before implementation while `questions.yaml.open` is non-empty.
- When the user answers, resolve the item into `questions.yaml.resolved` before
  continuing implementation or automatic workflow execution.

Keep the proposal checkpoint focused on what changes, what stays the same,
where the work likely lives, how it will be tested, and which technical rules
apply.

## Spec and Technical Artifact Routing

A strict change may legitimately have no delta spec. Do not invent a
`delta-spec` just to satisfy artifact shape.

- Create `delta-spec` artifacts only when the change modifies user-observable
  behavior or another requirement that belongs in a strict YAML main spec.
- For purely technical changes such as refactors, build or test tooling,
  repository maintenance, architecture constraints, or skill guidance, leave
  `.strict-spec-driven/changes/<change-name>/specs/` empty when no main spec
  requirement changes.
- If a technical-only change alters, adds, or retires an engineering rule,
  create a `delta-tech` artifact for the affected standard. If it only complies
  with existing standards, leave `tech/` absent too.
- A technical-only change still needs concrete workflow tasks: script or tooling
  edits when applicable, focused tests, validation commands, `ready`/`verify`
  checks, and archive-readiness checks when the change affects merge or archive
  behavior.
- In the proposal checkpoint, explicitly say either which strict spec areas
  will change or that no strict spec area is expected to change, with the reason.
- Still require `proposal.yaml`, `design.yaml`, `tasks.yaml`, `questions.yaml`,
  testing tasks, verification tasks, and any applicable structured mappings.

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
   Use this evidence for the change-intake question gate before asking the
   human for details the repository already answers.

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
     because the change is purely technical
   - any questions that still need a human answer before implementation

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
    - populate `tasks.yaml` with `strict-spec-cli generate <change-name> tasks`,
      issuing **one invocation per task** so no task list is hand-written:
      - first task: `strict-spec-cli generate <change-name> tasks --section <Implementation|Testing|Verification> --task <task-id> --text "..." [--status pending|complete] [--command "..."]` — the task list starts absent and is created by this first call, so there are no placeholder tasks to remove
      - each later task: one `--section`/`--task`/`--text` group per call
      - restating an existing `(section, task-id)` is a field-level merge — it overwrites only the fields you pass, so a task's `status: complete` and `command` survive a text-only edit; a brand-new task still needs `--text`
      - delete a task with `--remove <task-id>` (a repeatable global flag); to move a task between sections, `--remove` it and restate it under the new section in the same call
      - values may begin with a dash via `--text=...` or `--command=...` (the `--flag=value` form), needed when a task names a CLI flag
      - set the testing gates with `--validation-task <task-id>` and `--unit-test-task <task-id>`; both must reference task ids in the `Testing` section
      - the command upserts by `(section, task-id)` and is idempotent — re-running an identical call changes nothing
      - each call returns `{valid, ready, diagnostics}`: `valid` reports write success like every other artifact, and `ready` reports completeness — while the list is still incomplete `ready` is `false` and `diagnostics` names the empty sections or unset gates, so keep adding tasks and run `verify` before handoff (a `ready: false` result is not a failed write and is resolved by adding the missing tasks)
      - cover Implementation tasks for script, tooling, documentation, or
        skill-prompt edits in scope; Testing tasks with runnable validation and
        unit/regression commands; and Verification tasks for `ready`, `verify`,
        mapping checks, and archive-readiness or archive-merge checks when
        relevant
    - `strict-spec-cli generate <change-name> questions --open <question-id> --question "..." --context "..."` plus any needed `--resolved` entries
      Include impact analysis and recommendation/options in `--context`; do
      not pass nonexistent `--impact` or `--recommendation` flags.
    - only when the change has observable spec impact, `strict-spec-cli generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."` once per target strict main spec path
      One requirement can include multiple scenario groups by repeating
      `--scenario`. A later compatible call for the same operation, requirement
      id, strength, and statement appends new scenario ids and remains idempotent
      for equivalent scenarios. Scenarios append on their own, so nothing needs rebuilding or hand-editing to add one. Drop a single scenario with `--remove-scenario <requirement-id>:<scenario-id>` and a whole requirement with `--remove-requirement <id>`.
    - when the change alters a technical standard, `strict-spec-cli generate <change-name> delta-tech --target-standard <standard-id> [--title "..." --category <category>] [--implementation "src/file.ts"] [--enforcement "config"] --operation ADDED --rule <rule-id> --strength MUST --statement "..." --rationale "..." --method review`
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
   impact, delta spec scenarios, delta tech use when applicable, and structured
   mapping fields. When no delta specs are appropriate, replace delta spec
   scenario review with a justified absence check for the technical-only change.
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
- Keep spec-code mappings in structured YAML mapping fields, not prose
