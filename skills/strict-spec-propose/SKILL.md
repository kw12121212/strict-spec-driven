---
name: strict-spec-propose
description: Propose a new strict change. Scaffolds proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and an empty specs/ directory under .strict-spec-driven/changes/<name>/.
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
`questions.yaml` for `strict-spec-apply` to surface before implementation.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
propose: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. Before
proceeding, verify that strict workflow state already exists.

## Steps

1. **Determine the change name** — use the user-provided kebab-case name when it
   already exists. Otherwise derive one from the request and scope.

2. **Read project context and existing strict specs** — read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every strict YAML main spec the change is likely to touch

3. **Scaffold the change** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
   ```

4. **Fill `proposal.yaml`** — populate structured YAML fields, not Markdown
   prose:
   - `summary.what`
   - `summary.why`
   - `scope.in`
   - `scope.out`
   - `unchanged_behavior`
   Keep the content observable and concrete.

5. **Fill `design.yaml`** — populate:
   - `approach`
   - `decisions`
   - `alternatives`
   - `risks`

6. **Populate strict YAML delta specs** — create files under
   `.strict-spec-driven/changes/<name>/specs/` that mirror the target main spec
   paths.
   - use strict YAML delta artifacts with `target_spec`, `mapping`, and
     `operations`
   - populate `operations.ADDED`, `operations.MODIFIED`, and `operations.REMOVED`
     only as needed
   - added and replacement requirements use structured fields such as `id`,
     `strength`, `statement`, `scenarios`, and ordered `steps`
   - if the change has no observable spec impact, leave the `specs/` directory
     empty rather than inventing a prose-only file

7. **Fill `tasks.yaml`** — create concrete task sections for `Implementation`,
   `Testing`, and `Verification`.
   - every task needs `id`, `text`, and `status`
   - testing tasks should include runnable `command` fields
   - `testing_gates.validation_task` and `testing_gates.unit_test_task` must
     point at the corresponding Testing task IDs

8. **Fill `questions.yaml`** — record open questions as structured entries under
   `open` using fields such as `id`, `question`, `context`, and `status: open`.
   If everything is clear, leave `open: []`.

9. **Validate artifact structure** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   ```
   Use the command as a strict YAML schema and artifact-shape sanity check. At
   proposal time, pending-task diagnostics are expected because implementation
   has not started yet. Repair schema or structure issues before handing the
   proposal off.

10. **Hand off** — summarize the scope, key decisions, task count, unchanged
    behavior, and any open questions. If `questions.yaml` still has open
    entries, make clear that `strict-spec-apply` must stop for explicit user
    resolution before coding starts.

## Rules

- Do not implement anything during proposal
- Keep all change artifacts in strict YAML structures
- Document ambiguity in `questions.yaml` instead of guessing
- Keep spec-code mappings in structured `mapping` fields rather than burying
  them in prose
