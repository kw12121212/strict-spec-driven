---
name: strict-spec-review
description: Review the code quality of a completed strict YAML change through direct repository evidence, changed-file reading, and complete regression evidence.
metadata:
  skill_id: strict_spec_review
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are reviewing the code quality of a completed strict YAML change.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
modify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
```

## Prerequisites

Run `check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Steps

Before any other step, run `check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Select the change** — run `modify` without an argument to list active
   changes. If the change is already specified, use it.

2. **Confirm readiness** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   ```
   If verification reports blockers, stop and resolve them before review.

3. **Load review context** — read:
   - `proposal.yaml`
   - `design.yaml`
   - `questions.yaml`
   - every strict YAML delta spec in `changes/<name>/specs/`
   - the implementation and test files mapped to those specs
   - `git status --short` and the relevant diff for changed tracked files
   - any newly created untracked source, test, documentation, or strict workflow
     files that belong to the change

4. **Read every changed file yourself** — perform an author-agnostic code
   review from repository evidence. Do not call a `strict-spec-driven review`
   command and do not treat any deterministic script as a substitute for code
   review.

5. **Apply the review checklist** — evaluate findings across:
   - correctness and behavioral regressions
   - strict spec alignment and `unchanged_behavior`
   - test coverage, test independence, and test assertions
   - error handling and edge cases
   - security and unsafe input handling
   - performance or scalability risks
   - maintainability, readability, and unnecessary abstraction
   - user-visible CLI or documentation behavior
   - generated artifacts, build output, and packaging impact

6. **Check spec alignment** — confirm the implementation and tests match the
   strict YAML delta specs and do not violate `unchanged_behavior`.

7. **Fix safe in-scope findings** — if review finds MUST FIX issues that are
   safe to repair within the current strict change scope, make those fixes
   automatically before reporting the review as complete. If any review-time
   code or workflow artifact changes are made, rerun strict verification and
   the configured complete project regression command before recommending
   archive. Unsafe, ambiguous, blocked, or out-of-scope fixes must remain
   reported as blockers instead of being inferred or silently expanded.

8. **Confirm complete regression evidence** — inspect project workflow context,
   including `.strict-spec-driven/config.yaml` when available, for the complete
   project-level regression test method. Require evidence that the full project
   regression command has passed before recommending archive. If the command
   cannot run because dependencies, services, credentials, fixtures, or other
   test conditions are unavailable, treat archive recommendation as blocked and
   give the human actionable setup or waiting guidance instead of inferring a
   clean result.

9. **Report the result** — include review evidence before findings:
   - changed implementation and test files read
   - strict artifacts and delta specs read
   - verification and regression commands executed, including post-fix reruns
     when review-time changes were made, with pass/fail status
   Then group findings into:
   - MUST FIX
   - SHOULD FIX
   - NITS
   Findings should include file and line references when available.
   Recommend `strict-spec-archive` only when review is clean enough to archive
   and complete project-level regression test evidence has passed.

## Dev Session Guidance

When `.strict-spec-driven/dev-session.yaml` exists in the project and browser
trial evidence was gathered during implementation:

1. Run `dev-session-trial` to derive the expected browser trial guidance and
   compare it against the evidence that was reported.
2. Check that declared services were stopped after evidence collection.
3. Note any discrepancy between the declared smoke paths and the evidence
   actually captured.
4. Browser trial evidence supplements but does not replace the required project
   regression command.

## Rules

- Read every changed file before commenting on it
- Do not call or rely on a `strict-spec-driven review` command
- Do not recommend archive without explicit direct code review evidence
- Automatically fix safe in-scope review findings before archive
  recommendation, and rerun strict verification plus the configured complete
  regression command after review-time changes
- Focus on real issues, not style churn already handled elsewhere
- Review code based on repository evidence, never on authorship
- Do not recommend archive without passing complete project-level regression
  test evidence or explicit setup guidance explaining why that evidence is
  blocked
