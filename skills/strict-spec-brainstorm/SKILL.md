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
check-workflow-state: strict-spec-driven check-workflow-state
tech-status: strict-spec-driven tech-status
propose: strict-spec-driven propose <change-name>
generate: strict-spec-driven generate <change-name> <proposal|design|questions|delta-spec|delta-tech> --<named-args>
ready: strict-spec-driven ready <change-name>
verify: strict-spec-driven verify <change-name>
```

## Prerequisites

Run `strict-spec-driven check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

Before any other step, run `strict-spec-driven check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Start from the idea, not the artifact list** — ask the user what they want
   to achieve, what problem they are trying to solve, and any known constraints
   or preferences. Do not require a change name up front.

2. **Read strict project context, existing specs, and technical standards
   early** — before narrowing scope, read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every relevant strict YAML main spec file the idea appears likely to touch
   - run `strict-spec-driven tech-status` and read
     the relevant files under `.strict-spec-driven/tech/` so the brainstorm
     stays inside the project's technical standards from the start

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
     new strict spec area is needed
   - any questions that still need a human answer before implementation

4. **Suggest the change name** — once the idea is coherent enough, propose a
   short kebab-case change name. If the user already provided a valid name, keep
   it. Otherwise derive one from the agreed strict workflow scope.

5. **Present a proposal checkpoint** — before creating any files, summarize:
   - the proposed change name
   - the goal and scope
   - the main strict spec areas expected to change
   - key decisions or tradeoffs already settled
   - any unresolved questions that would go into `questions.yaml`

   Then ask for explicit confirmation. If the user wants revisions, continue the
   brainstorm and re-summarize until confirmed.

6. **Scaffold the change after confirmation** — run:
   ```bash
   strict-spec-driven propose <change-name>
   ```
   This creates `.strict-spec-driven/changes/<name>/` with strict planning
   artifacts and an empty `specs/` directory for strict YAML delta files.

7. **Populate `proposal.yaml` and related artifacts step by step** — after
   scaffolding, follow this exact order. Generate supported artifacts with
   direct parameterized CLI invocations, edit scaffolded `tasks.yaml` directly,
   and do not create JSON payload files.
    - `strict-spec-driven generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..."`
    - `strict-spec-driven generate <change-name> design --reset --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."`
    - edit `.strict-spec-driven/changes/<change-name>/tasks.yaml` directly according to the task-list schema
    - `strict-spec-driven generate <change-name> questions --reset --open <question-id> --question "..." --context "..."` plus any needed `--resolved` entries
    - `strict-spec-driven generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."` once per target strict main spec path
    Prefer one invocation per supported generated artifact (or per target spec
    for delta specs) so generated YAML matches the full document shape
    immediately.

8. **Run the proposal checkpoint over generated planning artifacts** — before
   validation, perform a semantic self-check of every generated or edited file under
   `.strict-spec-driven/changes/<change-name>/` against the confirmed brainstorm
   summary, the relevant main specs, technical standards, and the existing
   project constraints. Check for decision-ready detail in scope, unchanged
   behavior, design decisions, task coverage, unresolved-question impact, delta
   spec scenarios, delta tech use when applicable, and structured mapping fields.
   The checkpoint should fix safe, in-scope documentation gaps immediately by
   rerunning the supported `generate` commands for script-owned artifacts and by
   directly editing `tasks.yaml` for task-list structure. Do not expand scope or
   answer unresolved human questions during this checkpoint; record ambiguity in
   `questions.yaml` or return to the user checkpoint when the scope changes.

9. **Validate proposal readiness and artifact structure** — run:
   ```bash
   strict-spec-driven ready <change-name>
   ```
   Use this as the deterministic proposal-handoff check. It reports structural
   blockers without asking the CLI to decide product scope or requirement
   content. Then run:
   ```bash
   strict-spec-driven verify <change-name>
   ```
   Use this as a strict YAML schema and artifact-shape check. At proposal time,
   pending-task diagnostics are expected because implementation has not started
   yet. Fix safe structure issues before handing the proposal off.

10. **Hand off** — summarize the strict change scope, key decisions, proposal
   checkpoint refinements made, task count, unchanged behavior, and any open questions. If
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
