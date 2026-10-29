---
name: strict-spec-verify
description: Verify a strict YAML change before archive. Checks strict artifact structure, task completion, open questions, and unchanged behavior.
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
check-workflow-state: strict-spec-cli check-workflow-state
modify: strict-spec-cli modify [change-name|archive-dir]
verify: strict-spec-cli verify <change-name>
```

## Preferred Human Language

Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` —
the user's common human language, not a programming language — for all
user-facing and generated operator-facing text, unless that file is absent or
the active user message asks otherwise.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Select the change** — run `modify` without an argument to list active
   changes. If the change is already specified, use it.

2. **Run strict verification first** — run:
   ```bash
   strict-spec-cli verify <change-name>
   ```
   Treat the returned diagnostics as lifecycle blockers until resolved.

3. **Read the current change artifacts** — inspect:
   - `proposal.yaml`
   - `design.yaml`
   - `tasks.yaml`
   - `questions.yaml`
   - strict YAML delta specs under `changes/<name>/specs/`
   - relevant strict YAML main specs and the implementation and test files the
     change touches

4. **Check completion evidence** — confirm the repository state matches every
   completed task.
   - unfinished work in `tasks.yaml` is a blocker
   - non-empty `questions.yaml.open` is a blocker
   - delta specs must match what was implemented
   - when the workflow config declares a coverage contract under
     `review_evidence.project_regression.coverage`, the configured regression
     command enforces it through its exit code: a coverage failure is a blocker
     exactly like failing tests, never advisory output, and verification never
     measures coverage itself or second-guesses the declared threshold

5. **Check unchanged behavior** — compare the implementation against
   `proposal.yaml.unchanged_behavior` and treat regressions as blockers.

6. **Fix safe blockers automatically** — if a verification issue is clearly
   fixable, fix it and rerun `verify`.

7. **Report the result** — provide a tiered summary of blockers, warnings, and
   optional suggestions, then recommend `strict-spec-review` when the change is
   clean.

## Rules

- Be honest; do not treat checked tasks as proof by themselves
- Use the current YAML artifacts and repository state as the source of truth
