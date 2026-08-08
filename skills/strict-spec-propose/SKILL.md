---
name: strict-spec-propose
description: Propose a new standalone strict change from a user request. Use when Codex should scaffold proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and optional delta artifacts under .strict-spec-driven/changes/<name>/ without sourcing work from the roadmap.
metadata:
  skill_id: strict_spec_propose
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user create a strict YAML change proposal.

Do not ask follow-up questions or require confirmation during the proposal
stage. Derive the strongest proposal you can from the user request, project
context, and existing strict specs. Record remaining ambiguity in
`questions.yaml` for `strict-spec-auto` or `strict-spec-apply` to surface
before implementation.

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

## YAML Writing Rules

- Keep artifacts in valid strict YAML structures. Do not switch to Markdown
  prose or freeform notes inside YAML files.
- If artifact fields are unclear, use `strict-spec-cli schema-show <schema-name>`;
  installed skills do not carry a `templates` directory.
- Shared schema cache root: `~/.strict-spec-schemas/`. When a YAML artifact already declares `schema_file`, resolve that relative path under the shared cache root to inspect the concrete schema file without relying on a local templates directory.
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

Before implementation handoff or proposal validation, perform the required
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
  repository maintenance, architecture constraints, scripts, validation flows,
  archive behavior, or skill guidance, leave `specs/` empty when no main spec
  requirement changes.
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

1. **Determine the change name** — use the user-provided kebab-case name when it
   already exists. Otherwise derive one from the request and scope. If the user
   asks to source a change from the roadmap, stop and tell them to use
   `/strict-spec-propose-from-roadmap` so standalone proposals and roadmap-backed
   proposals stay separate.

2. **Read project context, existing strict specs, and technical standards** — read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every strict YAML main spec the change is likely to touch, if any; for a
     purely technical change, confirm from the spec index that no main spec
     requirement is implicated instead of forcing one
   - the technical standards that govern the code this change will touch by
     running `strict-spec-cli tech-status` and
     reading the relevant files under `.strict-spec-driven/tech/`. Treat every
     applicable MUST rule as a binding design constraint and every SHOULD rule
     as the default the proposal follows unless it records an explicit
     justification. If no standards apply, note that and continue.
   - select the lesson category that matches the affected spec or technical area, run
     `strict-spec-cli lesson-status --category <category>`, and read the lessons it ranks first.
     Repeat for another category when the proposal genuinely spans more than one; use the
     unfiltered command only when repository evidence cannot identify a relevant category.
     Lessons are recorded experience, not binding rules: they carry no MUST or
     SHOULD strength, so treat each one as a warning worth checking against this
     change rather than a constraint to satisfy. Match on `applies_when` — that
     field states the condition under which the lesson is worth recalling. A
     lesson with several occurrences has bitten this project repeatedly and
     deserves weight even though nothing enforces it.
   - Decide the relationship to each standard: most changes only *comply* with
     existing standards. If this change's intent is to *alter* a standard (add,
     modify, or retire a rule, or introduce a whole new standard), plan a delta
     tech artifact for it in step 8b instead of editing the live standard.
   - For user interface work, split it the same way: capture user-observable UI
     behavior as delta-spec requirements, capture UI engineering and design rules
     (design-system usage, styling, accessibility, i18n) as a `ui`-category
     technical standard, and govern pixel-level visual fidelity with
     visual-regression snapshots referenced from mappings rather than inlined.
   - Run the change-intake question gate from project evidence before generating
     proposal artifacts. If any required answer is still missing, carry it as an
     open question rather than guessing.

3. **Scaffold the change** — run:
   ```bash
   strict-spec-cli propose <change-name>
   ```
   After scaffolding, generate every supported artifact, including `tasks.yaml`,
   through direct CLI invocations in the exact ordered steps below. Do not create
   JSON payload files.

4. **Generate `proposal.yaml`** — run a direct CLI invocation with named
   arguments:
   ```bash
   strict-spec-cli generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..."
   ```
   Populate:
   - `summary.what`
   - `summary.why`
   - `scope.in`
   - `scope.out`
   - `unchanged_behavior`
   Keep the content observable and concrete.

5. **Generate `design.yaml`** — run one direct CLI invocation with named
   arguments:
   ```bash
   strict-spec-cli generate <change-name> design --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."
   ```
   Populate:
   - `approach`
   - `decisions`
   - `alternatives`
   - `risks`
   Make the design conform to the applicable technical standards from step 2.
   When a standard meaningfully shapes the approach, record it as a `decision`
   with a `rationale` that cites the standard. If the design must deviate from a
   SHOULD rule, record the deviation and its justification as a decision; if it
   would violate a MUST rule, record an open question in `questions.yaml`
   instead of silently breaking the standard.

6. **Generate `tasks.yaml` with one CLI invocation per task** — run
   `strict-spec-cli generate <change-name> tasks` once for each task so no task
   list is hand-written. Keep concrete task sections for `Implementation`,
   `Testing`, and `Verification`.
   - first task is one invocation; the task list starts absent and is created by this call:
     ```bash
     strict-spec-cli generate <change-name> tasks --section Implementation --task <task-id> --text "..."
     ```
     No flag rebuilds the list, so a recorded completion can only be dropped by naming it with
     `--force`, and always requires at least one task group so the list is
     never rebuilt empty
   - each later task is one more invocation:
     ```bash
     strict-spec-cli generate <change-name> tasks --section Testing --task <task-id> --text "..." --command "..."
     ```
   - `--status` defaults to `pending`; testing tasks should pass a runnable
     `--command`
   - restating an existing `(section, task-id)` is a field-level merge — it
     overwrites only the fields you pass, so a task's `status: complete` and
     `command` survive a text-only edit; a brand-new task still needs `--text`
   - delete a task with `--remove <task-id>`; to move a task between sections,
     `--remove` it and restate it under the new section in the same call
   - values may begin with a dash via `--text=...` or `--command=...`
   - set the gates with `--validation-task <task-id>` and
     `--unit-test-task <task-id>`; both must reference `Testing` task ids
   - the command upserts by `(section, task-id)` and is idempotent; each call
     returns `{valid, ready, diagnostics}` — `valid` reports write success and
     `ready` reports completeness, so a `ready: false` result naming empty
     sections or unset gates is not a failed write; keep adding tasks and
     confirm with `verify` before handoff
   - for technical-only changes, include the concrete scripts, tooling,
     generated assets, documentation, or skill-prompt edits in scope; include
     validation, strict `ready`/`verify`, and archive-readiness or archive-merge
     checks when relevant

7. **Generate `questions.yaml`** — run one direct CLI invocation for the full
   artifact. Restating an id overwrites just that entry:
    ```bash
    strict-spec-cli generate <change-name> questions --open <question-id> --question "..." --context "..." --resolved <question-id> --question "..." --context "..." --answer "..."
    ```
   Record open questions as structured entries under `open` using fields such
   as `id`, `question`, and `context`; the script writes the status. Include
   impact analysis and recommendation/options in `--context`, not as separate
   CLI flags. If everything is clear, leave `open: []`.

8. **Generate strict YAML delta specs only when specs change** — run this step
   only when the change has observable spec impact. Use one direct CLI
   invocation per target spec and include all mapping paths and requirement
   operations needed for that target in the same command:
    ```bash
    strict-spec-cli generate <change-name> delta-spec --target-spec <spec-id> --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..." --operation MODIFIED --requirement <requirement-id> --strength MUST --statement "..."
    ```
   One requirement can include multiple scenario groups by repeating
   `--scenario`. A later compatible call for the same operation, requirement id,
   strength, and statement appends new scenario ids and remains idempotent for
   equivalent scenarios. Scenarios append on their own, so nothing needs rebuilding or hand-editing to add one. Drop a single scenario with `--remove-scenario <requirement-id>:<scenario-id>` and a whole requirement with `--remove-requirement <id>`.
   The generated files under `.strict-spec-driven/changes/<name>/specs/` should
   mirror the target main spec paths.
   - use strict YAML delta artifacts with `target_spec`, `mapping`, and
     `operations`
   - populate `operations.ADDED`, `operations.MODIFIED`, and `operations.REMOVED`
     only as needed
   - added and replacement requirements use structured fields such as `id`,
     `strength`, `statement`, `scenarios`, and ordered `steps`
   - if the change has no observable spec impact, leave the `specs/` directory
     empty rather than inventing a prose-only file

8b. **Generate strict YAML delta tech (only when the change alters a standard)** —
    if step 2 identified that this change must add, modify, or retire a technical
    standard, generate delta tech artifacts under
    `.strict-spec-driven/changes/<change-name>/tech/` with one direct CLI
    invocation per target standard:
    ```bash
    strict-spec-cli generate <change-name> delta-tech --target-standard <standard-id> --operation ADDED --rule <rule-id> --strength MUST --statement "..." --rationale "..." --method review --operation REMOVED --rule <rule-id> --reason "..."
    ```
    `ADDED`/`MODIFIED` rules require `--strength`, `--statement`, `--rationale`,
    and `--method` (one of lint, ci, test, review, manual), with optional
    `--detail`, `--example-good`, `--example-bad`, and `--exception`; `REMOVED`
    rules take only `--reason`. To introduce a brand new standard, pass
    `--target-standard <new-id> --title "..." --category <category>`; archive
    creates the standard file and merges the rules. Run
    `strict-spec-cli schema-show delta-tech` if
    you need the full contract. Leave the `tech/` directory absent when the
    change only complies with existing standards and changes none of them.

9. **Run the proposal checkpoint over generated planning artifacts** — before
   validation, perform a semantic self-check of every generated or edited file under
   `.strict-spec-driven/changes/<change-name>/` against the user request, the
   relevant main specs, technical standards, and the existing project constraints.
   Check for decision-ready detail in scope, unchanged behavior, design
   decisions, task coverage, unresolved-question impact, delta spec scenarios,
   delta tech use when applicable, and structured mapping fields. When no delta
   specs are appropriate, replace delta spec scenario review with a justified
   absence check for the technical-only change. For technical-only changes,
   verify that tasks cover scripts or tooling, validation commands,
   `ready`/`verify`, and archive or archive-merge checks when archive behavior
   is affected. The checkpoint
   should fix safe, in-scope documentation gaps immediately by rerunning the
   supported `generate` commands for script-owned artifacts, including
   `generate <change-name> tasks` for task-list structure. Do not expand scope
   or answer unresolved human questions during this checkpoint; record ambiguity in
   `questions.yaml`.

10. **Validate proposal readiness and artifact structure** — run:
   ```bash
   strict-spec-cli ready <change-name>
   ```
   Use this as the deterministic proposal-handoff check. It reports missing
   planning artifacts, open questions, delta-spec gaps, and schema issues
   without deciding product scope. Then run:
   ```bash
   strict-spec-cli verify <change-name>
   ```
   Use the command as a strict YAML schema and artifact-shape sanity check. At
   proposal time, pending-task diagnostics are expected because implementation
   has not started yet. Repair schema or structure issues before handing the
   proposal off. Do not stop for human question resolution during
   `strict-spec-propose`; leave open questions in `questions.yaml`.

11. **Hand off** — summarize the scope, key decisions, proposal checkpoint
    refinements made, task count, unchanged behavior, and any open questions. Explicitly
    recommend `/strict-spec-auto` as the primary next step. If `questions.yaml`
    still has open entries, make clear that `/strict-spec-auto` or
    `/strict-spec-apply` must surface and resolve them before coding starts.

## Rules

- Do not implement anything during proposal
- Do not pause for user confirmation or question resolution during proposal
- Keep all change artifacts in strict YAML structures
- Document ambiguity in `questions.yaml` instead of guessing
- Do not auto-invoke `/strict-spec-auto` during strict-spec-propose; hand off
  after proposal validation instead
- Keep spec-code mappings in structured `mapping` fields rather than burying
  them in prose
- Treat applicable technical standards under `.strict-spec-driven/tech/` as
  binding: design within MUST rules, follow SHOULD rules by default, and record
  any deviation or conflict as a decision or open question
- When the change must alter a standard, carry that change as a delta tech
  artifact under the change's `tech/` directory so it merges through archive;
  never edit live standards under `.strict-spec-driven/tech/` directly during a
  change
