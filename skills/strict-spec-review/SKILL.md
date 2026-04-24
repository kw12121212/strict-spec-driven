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

The `.strict-spec-driven/` directory must exist at the project root. Before
proceeding, verify that strict workflow state already exists.

## Steps

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

7. **Report the result** — group findings into:
   - MUST FIX
   - SHOULD FIX
   - NITS
   Recommend `strict-spec-archive` only when review is clean enough to archive.

## Rules

- Read every changed file before commenting on it
- Focus on real issues, not style churn already handled elsewhere
- Review code based on repository evidence, never on authorship
