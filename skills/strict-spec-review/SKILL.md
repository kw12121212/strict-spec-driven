---
name: strict-spec-review
description: Review the code quality of a completed strict YAML change. Combine the strict review command with an author-agnostic read of the changed implementation and test files.
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
modify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
review: node {{SKILL_DIR}}/scripts/strict-spec-driven.js review <change-name>
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. If it is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Steps

Before any other step, confirm `.strict-spec-driven/` exists at the project
root. If it is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

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

4. **Run the strict review command** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js review <change-name>
   ```
   Treat its findings as one input, not the whole review.

5. **Read every changed file yourself** — perform an author-agnostic review of
   readability, security, error handling, performance, best practices, and test
   quality.

6. **Check spec alignment** — confirm the implementation and tests match the
   strict YAML delta specs and do not violate `unchanged_behavior`.

7. **Confirm complete regression evidence** — inspect project workflow context,
   including `.strict-spec-driven/config.yaml` when available, for the complete
   project-level regression test method. Require evidence that the full project
   regression command has passed before recommending archive. If the command
   cannot run because dependencies, services, credentials, fixtures, or other
   test conditions are unavailable, treat archive recommendation as blocked and
   give the human actionable setup or waiting guidance instead of inferring a
   clean result.

8. **Report the result** — group findings into:
   - MUST FIX
   - SHOULD FIX
   - NITS
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
- Focus on real issues, not style churn already handled elsewhere
- Review code based on repository evidence, never on authorship
- Do not recommend archive without passing complete project-level regression
  test evidence or explicit setup guidance explaining why that evidence is
  blocked
