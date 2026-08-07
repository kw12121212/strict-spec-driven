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
check-workflow-state: strict-spec-cli check-workflow-state
run-maintenance: strict-spec-cli maintenance
list-changes: strict-spec-cli list
verify-change: strict-spec-cli verify <change-name>
archive-change: strict-spec-cli archive <change-name>
retire-lesson: strict-spec-cli lesson-obsolete <lesson-id> --reason <text>
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
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
    - type: generated-doc-check
    - type: lesson-staleness-check
```

Supported check types:

| Type | What it reports | Corrections applied |
|---|---|---|
| `roadmap-sync-check` | Each roadmap file whose state was reconciled | Yes — sync is applied, the finding records it |
| `specs-directory-structure-check` | A workflow state directory misplaced under `.strict-spec-driven/specs/` | No — the finding names the directory to remove |
| `generated-doc-check` | A rendered `ARCHITECTURE.md` or `DESIGN.md` that no longer matches its strict YAML sources | No — the finding names the stale sources and the re-render command |
| `lesson-staleness-check` | An active lesson whose `applies_when` names a repository path that no longer exists, or whose every occurrence comes from archived work with the newest older than 180 days | No — the finding names why the lesson is a candidate and the `lesson-obsolete` command that retires it |

`lesson-staleness-check` only nominates candidates and never changes a lesson.
Deciding that experience has expired is a judgment call, and a lesson retired
wrongly takes with it the motivating context that its promoted technical-standard
rule deliberately omits. Review each finding and either retire the lesson with
`strict-spec-cli lesson-obsolete <lesson-id> --reason "<why>"` or update its
`applies_when` condition — a lesson that is simply rarely triggered is not stale.

`generated-doc-check` is read-only for the documents it inspects: it renders in
memory, compares, and never writes. It reports only a document that is already on
disk, because both generated documents are opt-in — a project that never rendered
one has declined it rather than let it go stale. A project with no design-system
artifact therefore gets no `DESIGN.md` finding.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `change-planning-state`, `change-delta-state`, `lessons-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli maintenance --help --json`, `strict-spec-cli archive --help --json`, `strict-spec-cli lesson-obsolete --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show change-proposal`, `strict-spec-cli schema-show change-design`, `strict-spec-cli schema-show task-list`, `strict-spec-cli schema-show question-list`, `strict-spec-cli schema-show delta-spec`, `strict-spec-cli schema-show delta-tech`, `strict-spec-cli schema-show lessons-index`, `strict-spec-cli schema-show lesson`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show change-proposal`, `strict-spec-cli sample-show change-design`, `strict-spec-cli sample-show task-list`, `strict-spec-cli sample-show question-list`, `strict-spec-cli sample-show delta-spec`, `strict-spec-cli sample-show delta-tech`, `strict-spec-cli sample-show lessons-index`, `strict-spec-cli sample-show lesson`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli maintenance`, `strict-spec-cli archive`, `strict-spec-cli lesson-obsolete`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
6. **Inspect the structured result and changed paths** — read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.
7. **Run the artifact's validation command** — `strict-spec-cli verify <change-name>`, `strict-spec-cli lesson-status`

**Stop rather than edit YAML directly.**

When a required command, argument, or artifact kind is unavailable, stop and
report the missing capability. Editing the YAML directly, writing a raw
payload, or scripting around the CLI is never an available fallback, and an
unavailable command is a reason to stop rather than a reason to improvise.

When you stop, report:

- the operation that could not be completed
- the artifact kind and target artifact it would have written
- the command or argument that is missing
- the discovery commands already consulted

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

1. **Run maintenance checks** — execute:
    ```
    strict-spec-cli maintenance
   ```
   Parse the JSON output. Fields: `valid`, `checksRun`, `findingsCount`, `generatedChange`.

2. **If `generatedChange` is null** — no findings. No change was created. Report the clean state and stop.

3. **If `generatedChange` is set** — a maintenance change was created under `.strict-spec-driven/changes/<generatedChange>/`. The change contains:
   - `proposal.yaml`: scope listing each finding
   - `tasks.yaml`: one implementation task per finding, plus standard testing and verification tasks
   - `questions.yaml`: the requirement-interrogation set, seeded open for operator answers
   - `design.yaml`: not written; author it with `generate <change-name> design` before verify

4. **Work through tasks** — use the standard `/strict-spec-apply <generatedChange>` workflow to complete all pending tasks. For `roadmap-sync-check` findings, the roadmap sync was already applied; implementation tasks are to review and confirm the changes were correct. For `generated-doc-check` findings, nothing was applied: run the re-render command named in the finding, and if the stale sources reveal that the source artifact itself is wrong, fix the artifact through its own skill before re-rendering.

5. **Verify and archive** — once all tasks are complete:
   ```
   strict-spec-cli verify <generatedChange>
   strict-spec-cli archive <generatedChange>
   ```

## Notes

- The `maintenance` command runs configured checks and applies automated corrections as a side effect (for example, updating roadmap sync state). The generated change is an auditable record of what was done. Not every check applies a correction; see the table above for which do.
- The maintenance change name uses the format `maintenance-YYYY-MM-DD` (with a numeric suffix if a collision exists).
