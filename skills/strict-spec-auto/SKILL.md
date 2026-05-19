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
propose: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
generate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> <proposal|design|questions|delta-spec> --<named-args>
apply: node {{SKILL_DIR}}/scripts/strict-spec-driven.js apply <change-name>
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
ready: node {{SKILL_DIR}}/scripts/strict-spec-driven.js ready <change-name>
next: node {{SKILL_DIR}}/scripts/strict-spec-driven.js next <change-name>
verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
archive: node {{SKILL_DIR}}/scripts/strict-spec-driven.js archive <change-name>
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. If it is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## YAML Writing Rules

- Keep strict artifacts in valid YAML structures at every stage. Do not replace
  structured fields with Markdown prose.
- If artifact fields are unclear, use `node {{SKILL_DIR}}/scripts/strict-spec-driven.js schema-show <schema-name>`;
  installed skills do not carry a `templates` directory.
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

## Steps

Before any other step, confirm `.strict-spec-driven/` exists at the project
root. If it is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

1. **Reset context from files** — treat prior chat context as stale unless it has
   been revalidated from the current change artifacts, strict main specs, and
   repository state.

2. **Assess complexity** — proceed automatically only when the change is clearly
   scoped inside this repository with a concrete definition of done. If the
   request is open-ended or cross-repository, stop and suggest
   `strict-spec-brainstorm`.

3. **Propose or resume the change** — if the strict change does not exist yet,
   scaffold with `propose`. If a prior workflow step such as
   `/strict-roadmap-recommend` or `/strict-roadmap-propose` already created the
   change directory, reuse the existing scaffold instead of running `propose`
   again. If the target change directory already exists but only contains empty
   subdirectories, `propose` may safely reuse it. Then populate artifacts in
   this exact order. Generate supported artifacts with direct CLI invocations,
   edit scaffolded `tasks.yaml` directly, and do not create JSON payload files.
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..."`
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> design --reset --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."`
    - edit `.strict-spec-driven/changes/<change-name>/tasks.yaml` directly according to the task-list schema
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> questions --reset --open <question-id> --question "..." --context "..."`
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."`
    Prefer one invocation per supported generated artifact (or per target spec
    for delta specs). Keep `tasks.yaml` structured with Implementation,
    Testing, and Verification sections plus valid testing gates.
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
   preserve every `unchanged_behavior` item from `proposal.yaml`.
   Use `next <change-name>` when you need deterministic state, blockers, or
   script-owned next-step command suggestions; do not use it as a replacement
   for user answers or implementation judgment.

5. **Use strict apply only after completing a task** — after each completed task,
   run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js apply <change-name>
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
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
   ```
   Fix safe blockers automatically, then rerun verification.

9. **Review code quality** — read every changed implementation and test file
   yourself, including mapped files from delta specs, `git status --short`, the
   relevant tracked diff, and any untracked source, test, documentation, or
   strict workflow files that belong to the change. Do not call a
   `strict-spec-driven review` command and do not treat deterministic validation
   as code review evidence. Evaluate correctness, spec alignment,
   `unchanged_behavior`, test coverage and assertions, error handling, edge
   cases, security, performance, maintainability, user-visible behavior,
   documentation impact, generated artifacts, and packaging impact. Fix MUST
   FIX issues automatically when safe and in scope. If review-time code or
   workflow artifact changes are made, rerun strict verification and the
   configured complete project regression command before continuing. Unsafe,
   ambiguous, blocked, or out-of-scope fixes must stop archive rather than being
   inferred or silently expanded.

10. **Re-check complete regression evidence** — inspect project workflow
   context, including `.strict-spec-driven/config.yaml` when available, for the
   complete project-level regression test method. Require evidence that the full
   project regression command has passed during review before archive execution,
   even when all Testing tasks are complete. If the regression command cannot
   run because dependencies, services, credentials, fixtures, or other test
   conditions are unavailable, stop before archive and give the human actionable
   setup or waiting guidance.

11. **Archive cleanly** — if the change verifies, reviews cleanly, and has
   passing complete project-level regression test evidence, run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js archive <change-name>
   ```
   Then summarize the result, including any roadmap files or milestone statuses
   the archive step reconciled, and recommend `/strict-spec-ship <change-name>`
   as an optional next step for creating a focused git commit. An empty `specs/`
   directory is allowed and should not block archive.

## Dev Session Guidance

When `.strict-spec-driven/dev-session.yaml` exists in the project and
implementation or review requires starting local development services:

1. Run `dev-session-plan` first and explain the declared long-running commands
   before starting them.
2. Use `dev-session-start` to start declared services rather than guessing
   undeclared startup steps.
3. Use the declared browser targets from the plan when exercising the running
   application.
4. Capture evidence consistently using the declared smoke paths and evidence
   labels.
5. Run `dev-session-stop` to stop all services you started before finishing.

**When NOT to use lifecycle commands:**
- No `.strict-spec-driven/dev-session.yaml` declaration exists.
- Required environment variable values are missing.
- The user has already provided a running service URL outside the strict
  declaration.

## Rules

- The context reset is mandatory
- The complexity check is mandatory
- The workflow is automatic except when open questions block progress
- Open questions require a problem explanation, impact analysis, recommendation,
  and explicit human answer before continuing
- Keep mappings in structured YAML fields
- The final `/strict-spec-ship <change-name>` recommendation is advisory and
  must not be treated as required to complete `strict-spec-auto`
- Do not call or rely on a `strict-spec-driven review` command
- Do not run archive without direct code review evidence from changed
  implementation and test files
- Automatically fix safe in-scope review findings before archive, and rerun
  strict verification plus the configured complete regression command after
  review-time changes
- Do not run archive without passing complete project-level regression test
  evidence or explicit setup guidance explaining why that evidence is blocked
- Do not commit or push automatically
