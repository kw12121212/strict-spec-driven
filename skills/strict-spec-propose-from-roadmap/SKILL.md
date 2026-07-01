---
name: strict-spec-propose-from-roadmap
description: Propose a strict change from the next roadmap-recommended planned change. Use when Codex should run roadmap-recommend, treat the scripted recommendation as authoritative, scaffold exactly one roadmap-backed strict change proposal, link milestone and planned_change metadata, and stop before implementation.
metadata:
  skill_id: strict_spec_propose_from_roadmap
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user turn the next strict roadmap recommendation into a
normal strict YAML change proposal.

Do not ask follow-up questions or require confirmation during the proposal
stage. Use the scripted roadmap recommendation as the source of truth. Record
remaining ambiguity in `questions.yaml` for `strict-spec-auto` or
`strict-spec-apply` to surface before implementation.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
tech-status: strict-spec-cli tech-status
roadmap-status: strict-spec-cli roadmap-status
roadmap-recommend: strict-spec-cli roadmap-recommend
propose: strict-spec-cli propose <change-name>
generate: strict-spec-cli generate <change-name> <proposal|design|questions|delta-spec|delta-tech> --<named-args>
ready: strict-spec-cli ready <change-name>
verify: strict-spec-cli verify <change-name>
```

## Prerequisites

Run `strict-spec-cli check-workflow-state`
before any workflow work. If `.strict-spec-driven/` is missing, stop
immediately and tell the user to run `/strict-spec-init`. Do not run `init`
from this skill.

## Roadmap Linking Rules

- Milestone ownership is defined by `planned_change.milestone`.
- Use `roadmap-status` output only when you need diagnostic context or the
  exact standalone planned-change source path after scripted recommendation.
- Treat filenames as helpful conventions only. `planned_change.id` and
  `planned_change.milestone` are the source of truth.
- If `roadmap-status` reports legacy inline milestone `planned_changes`, stop
  and materialize them before continuing.

## YAML Writing Rules

- Keep artifacts in valid strict YAML structures. Do not switch to Markdown
  prose or freeform notes inside YAML files.
- If artifact fields are unclear, use `strict-spec-cli schema-show <schema-name>`;
  installed skills do not carry a `templates` directory.
- Shared schema cache root: `~/.strict-spec-schemas/`. When a YAML artifact
  already declares `schema_file`, resolve that relative path under the shared
  cache root to inspect the concrete schema file without relying on a local
  templates directory.
- If a valid artifact example would clarify the shape, use
  `strict-spec-cli sample-show <sample-name>`; installed skills do not rely on a
  local `examples` directory.
- Use block scalars only for free-text content. Prefer `>-` for wrapped prose
  such as longer `summary`, `approach`, `decision`, `rationale`, `question`,
  `context`, `answer`, and spec `statement` values. Use `|` only when literal
  line breaks must be preserved as part of the value.
- Quote short strings that may contain YAML-sensitive characters or ambiguous
  scalar values, including `command` strings, URLs, paths, text containing `:`
  or `#`, leading `-`, JSON-like fragments, boolean-like words, and timestamp-
  like values.
- Keep short structural fields as plain scalars unless quoting is needed for
  correctness. Do not force IDs, enums, schema identifiers, artifact types,
  task references, or similar fields into block scalars.
- Before handing off, self-check indentation, list nesting, quote closure, and
  colon spacing, then run `verify` to catch remaining schema or YAML issues.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.

1. **Obtain the scripted recommendation first** — run
   `strict-spec-cli roadmap-recommend` before
   reading broad roadmap context, selecting work, or opening candidate
   planned-change files, and treat the command's selected planned change as
   authoritative. Branch on the returned `status`:
   - `roadmap-error` — surface the JSON diagnostics and stop. Suggest
     `roadmap-status` for additional context.
   - `no-candidate` — surface `candidateSummary` and the actionable
     `blockers[].skipReasons`, explain which blockers must clear, and stop.
     If the concise output does not explain the blockage, rerun
     `strict-spec-cli roadmap-recommend --details`
     and surface the full `candidates[].skipReasons`.
   - `recommended` — use the returned `recommendation.changeName`,
     `recommendation.milestone`, and `recommendation.path` as the roadmap-backed
     proposal source.

2. **Read targeted project and roadmap context** — read only the context needed
   to scaffold the recommended change:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every strict YAML main spec the recommended change is likely to touch
   - the technical standards that govern the code this change will touch by
     running `strict-spec-cli tech-status` and
     reading the relevant files under `.strict-spec-driven/tech/`
   - `.strict-spec-driven/roadmap/INDEX.yaml`
   - the owning milestone YAML file
   - the recommended standalone planned-change YAML artifact reported by the
     scripted recommendation result
   - `roadmap-status` output only when needed to explain diagnostics, active
     strict change conflicts, or legacy inline planned-change blockers
   - any relevant milestone or standalone planned-change `details` field
     content, extracting only the guidance needed for this one proposal

   Treat every applicable technical standard MUST rule as a binding design
   constraint and every SHOULD rule as the default the proposal follows unless
   it records an explicit justification. If the change alters a standard, plan a
   delta tech artifact instead of editing the live standard.

3. **Present a checkpoint before scaffolding** — summarize the proposed change
   name, milestone, standalone planned-change file path, why it is the best next
   step, which strict specs are likely to change, and any open questions that
   still need to land in `questions.yaml`. Do not stop for human confirmation;
   use the checkpoint only to explain the recommendation.

4. **Scaffold the change** — run:
   ```bash
   strict-spec-cli propose <change-name>
   ```
   Use `recommendation.changeName` as `<change-name>`. Generate supported
   artifacts in the exact ordered steps below and edit scaffolded `tasks.yaml`
   directly. Do not create JSON payload files.

5. **Generate `proposal.yaml`** — run a direct CLI invocation with named
   arguments, including roadmap linkage:
   ```bash
   strict-spec-cli generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..." --milestone <milestone-id> --planned-change <planned-change-id>
   ```
   Populate `summary.what`, `summary.why`, `scope.in`, `scope.out`, and
   `unchanged_behavior`. Keep the content observable and concrete. Do not copy
   the whole milestone plan or planned-change details into `proposal.yaml`;
   preserve the roadmap source of truth under `.strict-spec-driven/roadmap/`.

6. **Generate `design.yaml`** — run one direct CLI invocation with named
   arguments:
   ```bash
   strict-spec-cli generate <change-name> design --reset --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."
   ```
   Populate `approach`, `decisions`, `alternatives`, and `risks`. Make the
   design conform to applicable technical standards. Record any SHOULD-rule
   deviation as a decision; record any MUST-rule conflict as an open question
   instead of silently breaking the standard.

7. **Edit `tasks.yaml` directly** — update the scaffolded
   `.strict-spec-driven/changes/<change-name>/tasks.yaml` according to the
   task-list schema. Keep concrete task sections for `Implementation`,
   `Testing`, and `Verification`.
   - every task needs `text` and `status`
   - testing tasks should include runnable `command` fields
   - `testing_gates.validation_task` and `testing_gates.unit_test_task` must
     point at the corresponding Testing task IDs
   - keep YAML valid and structured; do not use Markdown prose inside the file

8. **Generate `questions.yaml`** — run one direct CLI invocation for the full
   artifact. Use `--reset` when intentionally replacing scaffold content:
   ```bash
   strict-spec-cli generate <change-name> questions --reset --open <question-id> --question "..." --context "..." --resolved <question-id> --question "..." --context "..." --answer "..."
   ```
   Record open questions as structured entries under `open`; if everything is
   clear, leave `open: []`.

9. **Generate strict YAML delta specs** — run one direct CLI invocation per
   target spec and include all mapping paths and requirement operations needed
   for that target in the same command:
   ```bash
   strict-spec-cli generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."
   ```
   The generated files under `.strict-spec-driven/changes/<name>/specs/` should
   mirror target main spec paths. If the change has no observable spec impact,
   leave the `specs/` directory empty rather than inventing a prose-only file.

9b. **Generate strict YAML delta tech only when the change alters a standard** —
    if the change must add, modify, or retire a technical standard, generate
    delta tech artifacts under `.strict-spec-driven/changes/<change-name>/tech/`
    with `generate <change-name> delta-tech --target-standard <id> ...`. Leave
    the `tech/` directory absent when the change only complies with existing
    standards.

10. **Run the proposal checkpoint over generated planning artifacts** — before
    validation, perform a semantic self-check of every generated or edited file
    under `.strict-spec-driven/changes/<change-name>/` against the recommended
    planned change, relevant main specs, technical standards, and project
    constraints. Check for decision-ready detail in scope, unchanged behavior,
    design decisions, task coverage, unresolved-question impact, delta spec
    scenarios, delta tech use when applicable, and structured mapping fields.
    The checkpoint should fix safe, in-scope documentation gaps immediately. Do
    not expand scope or answer unresolved human questions; record ambiguity in
    `questions.yaml`.

11. **Validate proposal readiness and artifact structure** — run:
   ```bash
   strict-spec-cli ready <change-name>
   ```
   Use this as the deterministic proposal-handoff check. Then run:
   ```bash
   strict-spec-cli verify <change-name>
   ```
   Pending-task diagnostics are expected at proposal time. Repair schema or
   structure issues before handing the proposal off.

12. **Hand off** — summarize the selected roadmap planned change, scope, key
    decisions, proposal checkpoint refinements made, task count, unchanged
    behavior, and any open questions. Explicitly recommend `/strict-spec-auto`
    as the primary next step. If `questions.yaml` still has open entries, make
    clear that `/strict-spec-auto` or `/strict-spec-apply` must surface and
    resolve them before coding starts.

## Rules

- Do not implement anything during proposal.
- Do not pause for user confirmation or question resolution during proposal.
- Do not manually choose among planned changes; use `roadmap-recommend`.
- Keep `.strict-spec-driven/roadmap/` as the roadmap source of truth.
- Convert exactly one recommended planned change into one normal strict change
  scaffold.
- Do not auto-invoke `/strict-spec-auto` during
  strict-spec-propose-from-roadmap; hand off after proposal validation.
- Keep all change artifacts in strict YAML structures.
- Document ambiguity in `questions.yaml` instead of guessing.
- Keep spec-code mappings in structured `mapping` fields rather than burying
  them in prose.
- When the change must alter a standard, carry that change as a delta tech
  artifact under the change's `tech/` directory; never edit live standards under
  `.strict-spec-driven/tech/` directly during a change.
