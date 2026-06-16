---
name: strict-spec-verify
description: Verify a strict YAML change before archive. Checks strict artifact structure, task completion, open questions, and main-spec mapping validity.
metadata:
  skill_id: strict_spec_verify
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user verify a strict YAML change before archive.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
modify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
```

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
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

Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Select the change** — run `modify` without an argument to list active
   changes. If the change is already specified, use it.

2. **Run strict verification first** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   ```
   Treat the returned diagnostics as lifecycle blockers until resolved.

3. **Check main-spec mappings** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
   ```
   Treat invalid or missing main-spec mappings as blockers for affected specs.

4. **Read the current change artifacts** — inspect:
   - `proposal.yaml`
   - `design.yaml`
   - `tasks.yaml`
   - `questions.yaml`
   - strict YAML delta specs under `changes/<name>/specs/`
   - relevant strict YAML main specs and mapped implementation and test files

5. **Check completion evidence** — confirm the repository state matches every
   completed task.
   - unfinished work in `tasks.yaml` is a blocker
   - non-empty `questions.yaml.open` is a blocker
   - delta specs must match what was implemented
   - when the workflow config declares a coverage contract under
     `review_evidence.project_regression.coverage`, the configured regression
     command enforces it through its exit code: a coverage failure is a blocker
     exactly like failing tests, never advisory output, and verification never
     measures coverage itself or second-guesses the declared threshold

6. **Check unchanged behavior** — compare the implementation against
   `proposal.yaml.unchanged_behavior` and treat regressions as blockers.

7. **Fix safe blockers automatically** — if a verification issue is clearly
   fixable, fix it and rerun both `verify` and `verify-spec-mappings`.

8. **Report the result** — provide a tiered summary of blockers, warnings, and
   optional suggestions, then recommend `strict-spec-review` when the change is
   clean.

## Harness Guidance

When `.strict-spec-driven/harness.yaml` exists in the project and harness
evidence is expected as part of verification:

1. Run `harness-plan` to derive deterministic harness guidance from the declared
   environment and components.
2. Report the declared target URLs, component ids, and evidence labels in the
   verification summary.
3. If required prerequisites are unavailable (missing declaration, missing env
   values, or no managed harness state), report the blocking condition and
   do not attempt to guess undeclared setup.
4. Harness evidence supplements but does not replace the required project
   regression command.

## Rules

- Be honest; do not treat checked tasks as proof by themselves
- Use the current YAML artifacts and repository state as the source of truth
- Keep implementation and test mappings in structured YAML fields
