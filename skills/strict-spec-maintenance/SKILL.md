---
name: strict-spec-maintenance
description: Run configured maintenance checks against the strict workflow repository state, seed a maintenance change from findings, and guide through task completion and archive.
metadata:
  skill_id: strict_spec_maintenance
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-spec-maintenance

## This Skill's Commands

```yaml
check-workflow-state: strict-spec-driven check-workflow-state
run-maintenance: strict-spec-driven maintenance
list-changes: strict-spec-driven list
verify-change: strict-spec-driven verify <change-name>
archive-change: strict-spec-driven archive <change-name>
```

## Prerequisites

Run `strict-spec-driven check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

Before running maintenance:

1. Verify `.strict-spec-driven/` exists.
2. Verify `.strict-spec-driven/config.yaml` contains a `maintenance` section with at least one configured check.

If no `maintenance` section exists, the command exits with zero findings. Add a check entry to enable maintenance behavior:

```yaml
maintenance:
  checks:
    - type: roadmap-sync-check
```

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

Before any other step, run `strict-spec-driven check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Run maintenance checks** — execute:
    ```
    strict-spec-driven maintenance
   ```
   Parse the JSON output. Fields: `valid`, `checksRun`, `findingsCount`, `generatedChange`.

2. **If `generatedChange` is null** — no findings. No change was created. Report the clean state and stop.

3. **If `generatedChange` is set** — a maintenance change was created under `.strict-spec-driven/changes/<generatedChange>/`. The change contains:
   - `proposal.yaml`: scope listing each finding
   - `tasks.yaml`: one implementation task per finding, plus standard testing and verification tasks
   - `design.yaml`, `questions.yaml`: scaffolded templates for operator review

4. **Work through tasks** — use the standard `/strict-spec-apply <generatedChange>` workflow to complete all pending tasks. For `roadmap-sync-check` findings, the roadmap sync was already applied; implementation tasks are to review and confirm the changes were correct.

5. **Verify and archive** — once all tasks are complete:
   ```
   strict-spec-driven verify <generatedChange>
   strict-spec-driven archive <generatedChange>
   ```

## Notes

- The `maintenance` command runs configured checks and applies automated corrections as a side effect (for example, updating roadmap sync state). The generated change is an auditable record of what was done.
- Only the `roadmap-sync-check` type is supported in this version. It applies roadmap sync state reconciliation and records each updated file as a finding.
- The maintenance change name uses the format `maintenance-YYYY-MM-DD` (with a numeric suffix if a collision exists).
