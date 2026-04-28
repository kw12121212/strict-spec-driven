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
apply: node {{SKILL_DIR}}/scripts/strict-spec-driven.js apply <change-name>
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
review: node {{SKILL_DIR}}/scripts/strict-spec-driven.js review <change-name>
verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
archive: node {{SKILL_DIR}}/scripts/strict-spec-driven.js archive <change-name>
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. Before
proceeding, verify that strict workflow state already exists.

## Steps

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
   again. Then fill:
   - `proposal.yaml`
   - `design.yaml`
   - `tasks.yaml`
   - `questions.yaml`
   - strict YAML delta specs under `changes/<name>/specs/`
   If you use `verify` at proposal time, treat pending-task diagnostics as
   expected until implementation is complete. If `questions.yaml.open` is not
   empty, do not infer answers or continue automatically. For each open
   question, explain:
   - the unresolved decision or missing information
   - the impact on scope, implementation, testing, or spec behavior
   - the recommended answer or options, with the tradeoff for each
   Then stop and wait for an explicit human reply. Record the answers in
   `questions.yaml.resolved` and remove them from `open` before implementation.

4. **Implement tasks in order** — read code, implement the next pending task, and
   preserve every `unchanged_behavior` item from `proposal.yaml`.

5. **Use strict apply only after completing a task** — after each completed task,
   run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js apply <change-name>
   ```
   and confirm the returned task matches the work you just finished. Never run
   `apply` only to inspect status because it mutates `tasks.yaml`.

6. **Run testing commands from `tasks.yaml`** — complete every Testing task by
   actually running its `command` before marking it complete.

7. **Verify the finished change** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
   ```
   Fix safe blockers automatically, then rerun verification.

8. **Review code quality** — run `review`, then read every changed implementation
   and test file yourself. Fix MUST FIX issues automatically when safe.

9. **Archive cleanly** — if the change verifies and reviews cleanly, run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js archive <change-name>
   ```
   Then summarize the result. An empty `specs/` directory is allowed and should
   not block archive.

## Rules

- The context reset is mandatory
- The complexity check is mandatory
- The workflow is automatic except when open questions block progress
- Open questions require a problem explanation, impact analysis, recommendation,
  and explicit human answer before continuing
- Keep mappings in structured YAML fields
- Do not commit or push automatically
