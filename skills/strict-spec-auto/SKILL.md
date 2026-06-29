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
propose: strict-spec-cli propose <change-name>
generate: strict-spec-cli generate <change-name> <proposal|design|questions|delta-spec|delta-tech> --<named-args>
apply: strict-spec-cli apply <change-name>
verify: strict-spec-cli verify <change-name>
ready: strict-spec-cli ready <change-name>
next: strict-spec-cli next <change-name>
verify-spec-mappings: strict-spec-cli verify-spec-mappings
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

1. **Reset context from targeted files** — treat prior chat context as stale
   unless it has been revalidated from the current change artifacts, relevant
   main specs, the applicable technical standards (run
   `strict-spec-cli tech-status` and read the
   relevant files under `.strict-spec-driven/tech/`), mapped implementation and
   test files, repository status, and regression configuration when needed. Do
   not reread unrelated roadmap, archive, or spec files just because they exist.

2. **Assess complexity** — proceed automatically only when the change is clearly
   scoped inside this repository with a concrete definition of done. If the
   request is open-ended or cross-repository, stop and suggest
   `strict-spec-brainstorm`.

3. **Propose or resume the change** — if the strict change does not exist yet,
   scaffold with `propose`. If a prior workflow step such as
   `/strict-roadmap-recommend` already created a
   populated change directory containing proposal, design, tasks, questions,
   and delta spec artifacts, resume the existing populated strict change
   scaffold without regenerating planning artifacts or running `propose` again.
   Run `ready <change-name>` or `next <change-name>` to surface deterministic
   blockers before implementation. If the target change directory already
   exists but only contains empty subdirectories, `propose` may safely reuse it.
   For new or empty scaffolds, populate artifacts in this exact order. Generate
   supported artifacts with direct CLI invocations, edit scaffolded
   `tasks.yaml` directly, and do not create JSON payload files.
    - `strict-spec-cli generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..."`
    - `strict-spec-cli generate <change-name> design --reset --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."`
    - edit `.strict-spec-driven/changes/<change-name>/tasks.yaml` directly according to the task-list schema
    - `strict-spec-cli generate <change-name> questions --reset --open <question-id> --question "..." --context "..."`
    - `strict-spec-cli generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."`
    - when this change must alter a technical standard (add, modify, or retire a
      rule, or introduce a new standard), generate strict YAML delta tech
      artifacts under `.strict-spec-driven/changes/<change-name>/tech/`:
      `strict-spec-cli generate <change-name> delta-tech --target-standard <standard-id> [--title "..." --category <category>] [--implementation "src/file.ts"] [--enforcement "config"] --operation ADDED --rule <rule-id> --strength MUST --statement "..." --rationale "..." --method review`
      (use `--title`/`--category` to create a new standard; `REMOVED` rules take
      only `--reason`). Leave `tech/` absent when the change only complies with
      existing standards.
    - for user interface work, split it: capture user-observable UI behavior as
      delta-spec requirements, capture UI engineering and design rules as a
      `ui`-category technical standard (delta-tech), and govern visual fidelity
      with visual-regression snapshots referenced from mappings, not inlined.
    Prefer one invocation per supported generated artifact (or per target spec
    for delta specs). Keep `tasks.yaml` structured with Implementation,
    Testing, and Verification sections plus valid testing gates. Keep or add a
    dedicated lint Testing task before full unit or regression test tasks when
    the project has a runnable lint command.
   For newly created or newly populated scaffolds, **run the proposal checkpoint
   over generated planning artifacts** before running handoff validation. Perform a
   semantic self-check of every generated or edited file under
   `.strict-spec-driven/changes/<change-name>/` against the user request, the
   relevant main specs, technical standards, and the existing project
   constraints. Check for decision-ready detail in scope, unchanged behavior,
   design decisions, task coverage, unresolved-question impact, delta spec
   scenarios, delta tech use when applicable, and structured mapping fields.
   The checkpoint should fix safe, in-scope documentation gaps immediately by
   rerunning the supported `generate` commands for script-owned artifacts and by
   directly editing `tasks.yaml` for task-list structure. Do not expand scope or
   answer unresolved human questions during this checkpoint; record ambiguity in
   `questions.yaml`.
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
   strict-spec-cli verify-spec-mappings
   ```
   Fix safe blockers automatically, then rerun verification.

9. **Review code quality** — read every changed implementation and test file
   yourself, including mapped files from delta specs, `git status --short`, the
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
   its operations and mapping are correct; treat an unjustified or malformed
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
   archive merges it into the standards, or record a follow-up to run
   `/strict-tech-sync` later. This reflection MUST NOT block strict verification
   or archive: when no such convention exists or the operator declines to
   capture it, the workflow proceeds unchanged.

10. **Re-check complete regression evidence** — inspect project workflow
   context, including `.strict-spec-driven/config.yaml` when available, for the
   complete project-level regression test method. Require evidence that the full
   project regression command has passed during review before archive execution,
   even when all Testing tasks are complete. A previously passed Testing task
   command may satisfy the archive gate only when it exactly matches the
   configured complete project regression command and no implementation, test,
   strict artifact, or configuration files relevant to the change have changed
   since that command passed. When the config declares a coverage contract
   under `review_evidence.project_regression.coverage`, the regression command
   is the coverage gate: a non-zero exit because measured coverage fell below
   the declared threshold blocks archive exactly like failing tests and is
   never advisory output; you never measure coverage yourself or second-guess
   the declared threshold. If the regression command cannot run because
   dependencies, services, credentials, fixtures, or other test conditions are
   unavailable, stop before archive and give the human actionable setup or
   waiting guidance.

11. **Archive cleanly** — if the change verifies, reviews cleanly, and has
   passing complete project-level regression test evidence, run:
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
  and explicit human answer before continuing
- Honor applicable technical standards under `.strict-spec-driven/tech/` across
  proposal, implementation, and review: never break a MUST rule, follow SHOULD
  rules by default, and treat unjustified violations as review findings that
  block archive
- When a change must alter a standard, carry it as a delta tech artifact under
  the change's `tech/` directory so it merges on archive; never edit live
  standards directly during a change
- Keep mappings in structured YAML fields
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
- Do not commit or push automatically
