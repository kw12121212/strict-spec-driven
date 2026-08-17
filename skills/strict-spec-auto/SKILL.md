---
name: strict-spec-auto
description: Run the strict workflow end to end. Propose, implement, verify, review, and archive a strict YAML change without extra confirmation unless open questions block progress.
metadata:
  skill_id: strict_spec_auto
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are running the strict workflow end to end for a single strict YAML change.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
tech-status: strict-spec-cli tech-status
lesson-status: strict-spec-cli lesson-status [--category <category>]
lesson-create: strict-spec-cli lesson-create --title <text> --category <category> --context <text> --observation <text> --takeaway <text> --applies-when <text> --origin <text> --evidence <text>
lesson-edit: strict-spec-cli lesson-edit <lesson-id> --origin <text> --evidence <text>
propose: strict-spec-cli propose <change-name>
generate: strict-spec-cli generate <change-name> <proposal|design|questions|delta-spec|delta-tech> --<named-args>
apply: strict-spec-cli apply <change-name>
verify: strict-spec-cli verify <change-name>
ready: strict-spec-cli ready <change-name>
next: strict-spec-cli next <change-name>
archive: strict-spec-cli archive <change-name>
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## YAML Writing Rules

- Keep strict artifacts in valid YAML structures at every stage. Do not replace
  structured fields with Markdown prose.
- If artifact fields are unclear, use `strict-spec-cli schema-show <schema-name>`;
  installed skills do not carry a `templates` directory.
- Shared schema cache root: `~/.strict-spec-schemas/`. When a YAML artifact already declares `schema_file`, resolve that relative path under the shared cache root to inspect the concrete schema file without relying on a local templates directory.
- If a valid artifact example would clarify the shape, use
  `strict-spec-cli sample-show <sample-name>`; installed skills do not rely on a
  local `examples` directory.
- Use block scalars only for free-text content. Prefer `>-` for wrapped prose
  such as longer `summary`, `approach`, `decision`, `rationale`, `question`,
  `context`, `answer`, and spec `statement` values. Use `|` only when literal
  line breaks must be preserved.
- Quote short strings that may contain YAML-sensitive characters or ambiguous
  scalar values, including `command` strings, URLs, paths, text containing `:`
  or `#`, leading `-`, JSON-like fragments, boolean-like words, and timestamp-
  like values.
- Keep short structural fields as plain scalars unless quoting is needed for
  correctness. Do not force IDs, enums, schema identifiers, artifact types,
  task references, or similar fields into block scalars.
- Before moving between workflow stages, self-check indentation, list nesting,
  quote closure, and colon spacing, then use the documented verification
  commands to catch remaining schema or YAML issues.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `change-planning-state`, `change-delta-state`, `spec-state`, `tech-state`, `lessons-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli propose --help --json`, `strict-spec-cli generate --help --json`, `strict-spec-cli apply --help --json`, `strict-spec-cli archive --help --json`, `strict-spec-cli lesson-create --help --json`, `strict-spec-cli lesson-edit --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show change-proposal`, `strict-spec-cli schema-show change-design`, `strict-spec-cli schema-show task-list`, `strict-spec-cli schema-show question-list`, `strict-spec-cli schema-show delta-spec`, `strict-spec-cli schema-show delta-tech`, `strict-spec-cli schema-show spec-index`, `strict-spec-cli schema-show main-spec`, `strict-spec-cli schema-show tech-index`, `strict-spec-cli schema-show main-tech`, `strict-spec-cli schema-show lessons-index`, `strict-spec-cli schema-show lesson`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show change-proposal`, `strict-spec-cli sample-show change-design`, `strict-spec-cli sample-show task-list`, `strict-spec-cli sample-show question-list`, `strict-spec-cli sample-show delta-spec`, `strict-spec-cli sample-show delta-tech`, `strict-spec-cli sample-show spec-index`, `strict-spec-cli sample-show main-spec`, `strict-spec-cli sample-show tech-index`, `strict-spec-cli sample-show main-tech`, `strict-spec-cli sample-show lessons-index`, `strict-spec-cli sample-show lesson`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli propose`, `strict-spec-cli generate`, `strict-spec-cli apply`, `strict-spec-cli archive`, `strict-spec-cli lesson-create`, `strict-spec-cli lesson-edit`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
6. **Inspect the structured result and changed paths** — read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.
7. **Run the artifact's validation command** — `strict-spec-cli verify <change-name>`, `strict-spec-cli lesson-status`

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

This is the one checkpoint where the automatic workflow stops: complete it before
proposing, then continue unattended through archive. It runs before the
change-intake checklist below. That checklist interrogates
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

Before implementation handoff or automatic implementation, perform the required
plain change-intake checklist from the strict workflow contract. First use
project evidence to answer every recoverable item: `.strict-spec-driven/config.yaml`,
relevant strict specs, technical standards, existing change artifacts, the
implementation and test files the change touches, `git status`, and focused code
search for the affected behavior.

When resuming a roadmap-backed scaffold, also read the proposal's roadmap links
and use the selected standalone planned-change `summary`, `details`,
`depends_on`, labels, and owning milestone `details` as valid intake evidence.
Carry answers already present in that roadmap evidence forward instead of
re-asking.

- Do not ask the human for information already recoverable from the request or
  repository evidence.
- Do ask when a required answer remains absent after discovery, even if you have
  a plausible guess.
- Record missing required answers in `questions.yaml.open` with stable
  language-neutral ids, `preferred_human_language` question text, concrete
  context that includes impact analysis and a recommended answer or options.
  The `questions` generator has no `--impact` or `--recommendation` flags; put
  those details in the `--context` text.
- For roadmap-backed scaffolds, make the context say whether the uncertainty
  affects proposal scope, spec delta, implementation files, tests,
  dependencies, or technical standards.
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

1. **Reset context from targeted files** — treat prior chat context as stale
   unless it has been revalidated from the current change artifacts, relevant
   main specs, the applicable technical standards (run
   `strict-spec-cli tech-status` and read the
   relevant files under `.strict-spec-driven/tech/`), the implementation and
   test files the change touches, repository status, and regression
   configuration when needed. Do not reread unrelated roadmap, archive, or spec
   files just because they exist.
   Also select the lesson category matching the affected spec or technical area, run
   `strict-spec-cli lesson-status --category <category>`, and match its `applies_when`
   conditions against the work at hand. Repeat for another category when the change genuinely
   spans more than one; use the unfiltered command only when repository evidence cannot identify a
   relevant category. Lessons carry no MUST or SHOULD
   strength, so treat them as warnings worth checking rather than constraints to
   satisfy; weight a lesson with several occurrences, because the count means
   this project has hit it repeatedly.
   Use this evidence for the change-intake question gate before asking the
   human or continuing into implementation.

2. **Assess complexity** — proceed automatically only when the change is clearly
   scoped inside this repository with a concrete definition of done. If the
   request is open-ended or cross-repository, stop and suggest
   `strict-spec-brainstorm`.

3. **Propose or resume the change** — if the strict change does not exist yet,
   scaffold with `propose`. If a prior workflow step such as
   `/strict-roadmap-recommend` already created a
   populated change directory containing proposal, design, tasks, questions,
   and any needed delta spec or delta tech artifacts, resume the existing populated strict change
   scaffold without regenerating planning artifacts or running `propose` again.
   For roadmap-backed scaffolds, preserve selected planned-change provenance as
   intake evidence and inspect `questions.yaml.open` before
   implementation.
   Run `ready <change-name>` or `next <change-name>` to surface deterministic
   blockers before implementation. If the target change directory already
   exists but only contains empty subdirectories, `propose` may safely reuse it.
   For new or empty scaffolds, populate artifacts in this exact order. Generate
   every supported artifact, including `tasks.yaml`, with direct CLI
   invocations, and do not create JSON payload files.
    - `strict-spec-cli generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..."`
    - `strict-spec-cli generate <change-name> design --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."`
    - populate `tasks.yaml` with `strict-spec-cli generate <change-name> tasks`,
      issuing **one invocation per task** so no task list is hand-written:
      - first task: `strict-spec-cli generate <change-name> tasks --section <Implementation|Testing|Verification> --task <task-id> --text "..." [--status pending|complete] [--command "..."]` — the task list starts absent and is created by this first call, so there are no placeholder tasks to remove
      - each later task: one `--section`/`--task`/`--text` group per call
      - restating an existing `(section, task-id)` is a field-level merge — it overwrites only the fields you pass, so a task's `status: complete` and `command` survive a text-only edit; a brand-new task still needs `--text`
      - delete a task with `--remove <task-id>` (a repeatable global flag); to move a task between sections, `--remove` it and restate it under the new section in the same call
      - place a task with `--before <task-id>` or `--after <task-id>` instead of
        letting it append; task order is the order `apply` walks, so a task that must
        run before existing pending work is anchored rather than appended, and naming
        an existing task id with an anchor moves it there while preserving its `status`
        and `command`
      - values may begin with a dash via `--text=...` or `--command=...` (the `--flag=value` form), needed when a task names a CLI flag
      - set the testing gates with `--validation-task <task-id>` and `--unit-test-task <task-id>`; both must reference task ids in the `Testing` section
      - the command upserts by `(section, task-id)` and is idempotent — re-running an identical call changes nothing
      - each call returns `{valid, ready, diagnostics}`: `valid` reports write success like every other artifact, and `ready` reports completeness — while the list is still incomplete `ready` is `false` and `diagnostics` names the empty sections or unset gates, so keep adding tasks and run `verify` before handoff (a `ready: false` result is not a failed write and is resolved by adding the missing tasks)
      - cover concrete Implementation tasks for script, tooling, generated asset, documentation, or skill-prompt edits in scope; Testing tasks with runnable validation and unit/regression commands; and Verification tasks for `ready`, `verify`, and archive-readiness or archive-merge checks when relevant
    - `strict-spec-cli generate <change-name> questions --open <question-id> --question "..." --context "..."`
      Include impact analysis and recommendation/options in `--context`; do
      not pass nonexistent `--impact` or `--recommendation` flags.
    - only when the change has observable spec impact, `strict-spec-cli generate <change-name> delta-spec --target-spec <spec-id> --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."`
      One requirement can include multiple scenario groups by repeating
      `--scenario`. A later compatible call for the same operation, requirement
      id, strength, and statement appends new scenario ids and remains idempotent
      for equivalent scenarios. Scenarios append on their own, so nothing needs rebuilding or hand-editing to add one. Drop a single scenario with `--remove-scenario <requirement-id>:<scenario-id>` and a whole requirement with `--remove-requirement <id>`.
    - when this change must alter a technical standard (add, modify, or retire a
      rule, or introduce a new standard), generate strict YAML delta tech
      artifacts under `.strict-spec-driven/changes/<change-name>/tech/`:
      `strict-spec-cli generate <change-name> delta-tech --target-standard <standard-id> [--title "..." --category <category>] --operation ADDED --rule <rule-id> --strength MUST --statement "..." --rationale "..." --method review`
      (use `--title`/`--category` to create a new standard; `REMOVED` rules take
      only `--reason`). Leave `tech/` absent when the change only complies with
      existing standards.
    - for user interface work, split it: capture user-observable UI behavior as
      delta-spec requirements, capture UI engineering and design rules as a
      `ui`-category technical standard (delta-tech), and govern visual fidelity
      with visual-regression snapshots referenced from mappings, not inlined.
    - if the change has no observable spec impact, leave the `specs/` directory
      empty rather than inventing a prose-only file
    Prefer one invocation per supported generated artifact (or per target spec
    for delta specs, and one per task for tasks). Keep `tasks.yaml` structured
    with Implementation, Testing, and Verification sections plus valid testing
    gates. Keep or add a dedicated lint Testing task before full unit or
    regression test tasks when the project has a runnable lint command.
   For newly created or newly populated scaffolds, **run the proposal checkpoint
   over generated planning artifacts** before running handoff validation. Perform a
   semantic self-check of every generated or edited file under
   `.strict-spec-driven/changes/<change-name>/` against the user request, the
   relevant main specs, technical standards, and the existing project
   constraints. Check for decision-ready detail in scope, unchanged behavior,
   design decisions, task coverage, unresolved-question impact, delta spec
   scenarios, and delta tech use when applicable.
   When no delta specs are appropriate, replace delta spec scenario review with
   a justified absence check for the technical-only change. For technical-only
   changes, verify that tasks cover scripts or tooling, validation commands,
   `ready`/`verify`, and archive or archive-merge checks when archive behavior
   is affected.
   The checkpoint should fix safe, in-scope documentation gaps immediately by
   rerunning the supported `generate` commands for script-owned artifacts,
   including `generate <change-name> tasks` for task-list structure. Do not
   expand scope or answer unresolved human questions during this checkpoint;
   record ambiguity in `questions.yaml`.
   Run `ready <change-name>` at proposal time when deciding whether the change
   is ready for implementation; it reports deterministic handoff blockers
   without deciding product scope or requirement content. If you use `verify`
   at proposal time, treat pending-task diagnostics as expected until
   implementation is complete. If `questions.yaml.open` is not
   empty, do not infer answers or continue automatically. For each open
   question, explain:
   - the unresolved decision or missing information
   - the impact on scope, implementation, testing, or spec behavior
   - the recommended answer or options, with the tradeoff for each
   Then stop and wait for an explicit human reply. Record the answers in
   `questions.yaml.resolved` and remove them from `open` before implementation.

4. **Implement tasks in order** — read code, implement the next pending task, and
   preserve every `unchanged_behavior` item from `proposal.yaml`. Write code that
   satisfies the applicable technical standards under `.strict-spec-driven/tech/`:
   never violate a MUST rule and follow SHOULD rules unless `design.yaml` records
   a justified deviation. If a task can only be completed by breaking a MUST
   rule, stop and surface it as an open question instead of violating the
   standard. If the standard itself must change as part of this change, carry it
   as a delta tech artifact under `changes/<change-name>/tech/` so it merges on
   archive, never by editing the live standard directly.
   Use `next <change-name>` when you need deterministic state, blockers, or
   script-owned next-step command suggestions; do not use it as a replacement
   for user answers or implementation judgment.

5. **Use strict apply only after completing a task** — after each completed task,
   run:
   ```bash
   strict-spec-cli apply <change-name>
   ```
   and confirm the returned task matches the work you just finished. Never run
   `apply` only to inspect status because it mutates `tasks.yaml`.

6. **Run testing commands from `tasks.yaml`** — complete every Testing task by
   actually running its `command` before marking it complete.

7. **Gitignore hygiene** — once all tasks (including Testing) are complete, check
   for non-source artifacts that should not be committed:
   - run `git status --short` to find newly created untracked files
   - identify non-source artifacts such as build output (`dist/`, `build/`,
     `out/`), dependency directories (`node_modules/`, `vendor/`), cache
     directories (`.cache/`, `.tmp/`), log files (`*.log`), and other
     generated files
   - add matching entries to `.gitignore` automatically
   - do not ignore source code, configuration, or files that are part of the
     deliberate project output

8. **Verify the finished change** — run:
   ```bash
   strict-spec-cli verify <change-name>
   ```
   Fix safe blockers automatically, then rerun verification.

9. **Review code quality** — read every changed implementation and test file
   yourself, including the files named by delta specs, `git status --short`, the
   relevant tracked diff, and any untracked source, test, documentation, or
   strict workflow files that belong to the change. Do not call a
   `strict-spec-cli review` command and do not treat deterministic validation
   as code review evidence. Evaluate correctness, spec alignment,
   `unchanged_behavior`, test coverage and assertions, error handling, edge
   cases, security, performance, maintainability, user-visible behavior,
   documentation impact, generated artifacts, packaging impact, and
   technical-standard compliance against `.strict-spec-driven/tech/` (a MUST
   rule violation is a MUST FIX; an unjustified SHOULD violation is a SHOULD
   FIX; a deviation is acceptable only when `design.yaml` justifies it). When the
   change carries delta tech artifacts under `changes/<change-name>/tech/`,
   confirm each standard change is justified by the proposal and design and that
   its operations are correct; treat an unjustified or malformed
   standard change as a MUST FIX. Fix MUST
   FIX issues automatically when safe and in scope. If review-time code or
   workflow artifact changes are made, rerun strict verification and the
   configured complete project regression command before continuing. Unsafe,
   ambiguous, blocked, or out-of-scope fixes must stop archive rather than being
   inferred or silently expanded.
   After the review checklist, also reflect — non-blocking — on whether this
   change established a reusable engineering convention not yet captured under
   `.strict-spec-driven/tech/` (a coding, architecture, testing, tooling,
   security, performance, or API rule). When it did, surface two options: carry
   it now as a delta tech artifact under `changes/<change-name>/tech/` so
   archive merges it into the standards, or defer the decision only to the
   mandatory final current-change tech sync before archive. This early
   reflection does not by itself block strict verification or review
   completion, but a convention confirmed as reusable may not be deferred until
   after the change is archived.

10. **Declare the lesson outcome (required)** — before archive, state
   explicitly either that a lesson was recorded or that none applies, with the
   reason. Judge it from the objective proposal-versus-implementation diff, not
   from a general sense of having learned something: a `design.yaml` decision or
   approach overturned during implementation, a question the proposal did not
   foresee, a task added because of a discovery rather than a scope change, or a
   regression failure exposing a trap this change did not introduce. When one
   applies, check `strict-spec-cli lesson-status --category <category>` for an existing lesson with the
   same `applies_when` condition and append the recurrence with
   `lesson-edit <lesson-id> --origin <change-name> --evidence "..."` rather than
   creating a near-duplicate; otherwise record a new one with `lesson-create`.
   Spend the effort on `--applies-when`: it is the retrieval key that decides
   whether the lesson is ever seen again. When none of the criteria applies, say
   "no lesson" with a one-line reason — never manufacture an entry, because a
   store padded with filler stops being read.

11. **Re-check complete regression evidence** — inspect project workflow
   context, including `.strict-spec-driven/config.yaml` when available, for the
   complete project-level regression test method. Require evidence that the full
   project regression command has passed during review before archive execution,
   even when all Testing tasks are complete. A previously passed Testing task
   command may satisfy the archive gate only when it exactly matches the
   configured complete project regression command and no implementation, test,
   strict artifact, or configuration files relevant to the change have changed
   since that command passed. One class of write is carved out of that list:
   a write the configured regression command neither compiles nor reads —
   currently a change-local delta-tech artifact or a lesson — does not
   invalidate passing complete project regression evidence, because such a file
   is not compiled, is not imported by the suite, and reaches live workflow
   state only at archive. Decide an artifact kind neither list names by that
   same criterion, and rerun when the suite does compile or read it. Every other
   strict artifact, including a delta-spec and a planning artifact, still
   invalidates the evidence. When the config declares a coverage contract
   under `review_evidence.project_regression.coverage`, the regression command
   is the coverage gate: a non-zero exit because measured coverage fell below
   the declared threshold blocks archive exactly like failing tests and is
   never advisory output; you never measure coverage yourself or second-guess
   the declared threshold. If the regression command cannot run because
   dependencies, services, credentials, fixtures, or other test conditions are
   unavailable, stop before archive and give the human actionable setup or
   waiting guidance.

12. **Run the final current-change tech sync** — before invoking archive, apply
   the active-change procedure from `strict-tech-sync` to the selected change.
   Bound the scan to its planning artifacts, delta artifacts, attributable
   tracked and untracked files, and applicable technical standards; exclude unrelated repository drift. Continue immediately when
   existing standards and current delta tech cover the change. When a possible
   reusable convention remains, pause for the operator to confirm the target
   standard, operation, stable rule id, strength, statement, rationale, and
   enforcement, or to explicitly classify the pattern as not reusable. A convention confirmed as reusable cannot be deferred until after
   archive and must be generated as current-change delta tech rather than by
   editing live standards. After any delta-tech edit, review the artifact and
   rerun strict verification; a write the configured regression command neither
   compiles nor reads — currently a change-local delta-tech artifact or a lesson
   — does not invalidate passing complete project regression evidence, so the
   configured regression command is rerun here only when this step also changed
   a file outside that carve-out.

13. **Archive cleanly** — if the final current-change tech sync is resolved, the
   change verifies, reviews cleanly, and has passing complete project-level
   regression test evidence for the final artifact state, run:
   ```bash
   strict-spec-cli archive <change-name>
   ```
   Then summarize the result, including any roadmap files or milestone statuses
   the archive step reconciled, and recommend `/strict-spec-ship <change-name>`
   as an optional next step for creating a focused git commit. An empty `specs/`
   directory is allowed and should not block archive.

## Harness Guidance

When `.strict-spec-driven/harness.yaml` exists in the project and
implementation or review requires starting declared components:

1. Run `harness-plan` first and explain the declared long-running commands
   before starting them.
2. Use `harness-start` to start declared executable components rather than
   guessing undeclared startup steps.
3. Use declared harness targets from the plan when exercising the running
   application.
4. Capture evidence consistently using declared evidence labels and harness
   session evidence identifiers.
5. Run `harness-stop` to stop all components you started before finishing.

**When NOT to use lifecycle commands:**
- No `.strict-spec-driven/harness.yaml` declaration exists.
- Required environment variable values are missing.
- The user has already provided a running service URL outside the harness
  declaration.

## Rules

- The context reset is mandatory
- The complexity check is mandatory
- The workflow is automatic except when open questions block progress
- Open questions require a problem explanation, impact analysis, recommendation,
  and explicit human answer before continuing; encode the impact and
  recommendation in `questions.yaml.open[*].context`
- Honor applicable technical standards under `.strict-spec-driven/tech/` across
  proposal, implementation, and review: never break a MUST rule, follow SHOULD
  rules by default, and treat unjustified violations as review findings that
  block archive
- When a change must alter a standard, carry it as a delta tech artifact under
  the change's `tech/` directory so it merges on archive; never edit live
  standards directly during a change
- The final `/strict-spec-ship <change-name>` recommendation is advisory and
  must not be treated as required to complete `strict-spec-auto`
- Do not call or rely on a `strict-spec-cli review` command
- Do not run archive without direct code review evidence from changed
  implementation and test files
- Automatically fix safe in-scope review findings before archive, and rerun
  strict verification plus the configured complete regression command after
  review-time changes
- Do not run archive without passing complete project-level regression test
  evidence or explicit setup guidance explaining why that evidence is blocked
- Do not run archive before the final current-change tech sync is resolved, and
  do not defer a confirmed reusable convention until after archive
- Do not commit or push automatically
