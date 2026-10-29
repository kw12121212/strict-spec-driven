---
name: strict-scene-edit
description: Create or modify individual strict YAML scene files through the CLI, describing who acts, what must already be true, the main flow, and the exception flows before requirements are recalled.
metadata:
  skill_id: strict_scene_edit
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user create or modify strict YAML scenes under
`.strict-spec-driven/scenes/` through the artifact-aware CLI, without going
through the strict change workflow.

A scene is one end-to-end situation a real actor goes through. It records the
actors, the preconditions, the ordered main flow, and the exception flows that
branch off it, and every flow step declares either the requirements that cover
it or an explicit reason it is waived. The scene is independent of any single
spec: one step may name covering requirements belonging to several specs.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
scene-edit: strict-spec-cli scene-edit <scene-id> [named fields and removals | --delete]
scene-status: strict-spec-cli scene-status [--area <area>] [--scene <scene-id>]
```

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `scene-state`. Before the first mutation run
`strict-spec-cli yaml-authoring-protocol scene-state`: that command reports the
ordered authoring steps, the owning command for each operation, and the bundled
schema and example keys with their cache-resolved paths, bound to the artifact
kind and current where a copy would go stale. Validate the result with
`strict-spec-cli scene-status`.

**Stop rather than edit YAML directly.** When a required command, argument, or
artifact kind is unavailable, stop and report the missing capability. Editing
the YAML directly, writing a raw payload, or scripting around the CLI is never
an available fallback, and an unavailable command is a reason to stop rather
than a reason to improvise.

## Preferred Human Language

Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` —
the user's common human language, not a programming language — for all
user-facing and generated operator-facing text, unless that file is absent or
the active user message asks otherwise.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Read strict scene context first** — before making any changes, read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/scenes/INDEX.yaml`, when the project records scenes
   - `.strict-spec-driven/specs/INDEX.yaml`, because every covering reference
     names a recorded spec id and requirement id
   - run `strict-spec-cli scene-status` to see the recorded scenes and each
     step's coverage state, narrowing with `--area` or `--scene` when the
     project records many scenes

2. **Understand the request** — identify whether the user wants to:
   - author a new scene for a situation no recorded scene describes
   - add or correct actors, preconditions, main-flow steps, or exception flows
   - record, correct, or waive the coverage of one or more steps
   - remove named entries, or retire the whole scene

3. **Interrogate the situation before writing it down** — a scene exists to stop
   an author skipping the questions a requirement set silently assumes. Ask the
   user, and do not infer the answers from the code:
   - who acts, and what each actor does in this situation
   - what must already be true before the main flow begins
   - what happens, step by ordered step, when nothing goes wrong
   - what can go wrong, what triggers each exception flow, and what happens then
   Record an answer you could not get as an open question for the user rather
   than filling the field with a plausible guess.

4. **Choose the target** — use the scene index to decide where the scene belongs:
   - if a recorded scene already describes this situation, edit that scene
   - otherwise choose the kebab-case `area` key that groups it, which is also the
     subdirectory the scene is stored in
   - reuse a recorded area unless the situation clearly belongs to a new one

5. **Resolve coverage for every step** — each step names either the requirements
   that cover it or an explicit reason it is deliberately covered by none:
   - read `.strict-spec-driven/specs/INDEX.yaml` and the spec files it names to
     find the covering spec id and requirement id
   - a step may name covering requirements in more than one spec area
   - use a no-coverage reason only when the step is deliberately uncovered, and
     say why; it is a recorded decision, not a way to silence a gap
   - a requirement that ought to exist but does not is a finding to report, not
     a reason to invent a covering reference

6. **Present and confirm** — show the user:
   - which scene will be created or changed, and under which area
   - the actors, preconditions, main-flow steps, and exception flows being set
   - the coverage or waiver recorded for each step
   - whether `.strict-spec-driven/scenes/INDEX.yaml` will gain or lose an entry

   Wait for explicit confirmation before writing anything.

7. **Apply the confirmed edits through the CLI** — after confirmation, issue one
   or more `scene-edit` invocations with named semantic arguments:
   - create a scene with `scene-edit <scene-id> --title <text> --area <area>
     --actor <name> --role <text> --precondition <text> --step <id>
     --action <text> --covered-by <spec-id>:<requirement-id>
     --exception-flow <flow-id> --trigger <text>
     --exception-step <flow-id>:<step-id> --action <text>`
   - update one entry by restating its id or name and only the fields that
     changed; unnamed content is preserved
   - declare an exception flow before adding a step to it
   - waive one step with `--no-coverage-reason <text>`, which clears its
     recorded covering references, and record coverage with `--covered-by`,
     which clears a recorded waiver
   - remove keyed content with `--remove-actor`, `--remove-precondition`,
     `--remove-exception-flow`, `--remove-step`, or `--remove-covered-by`
   - set `--status draft|active|obsolete` when the lifecycle state changes
   - use an isolated `scene-edit <scene-id> --delete` only when the confirmed
     change retires the whole scene
   Never edit the scene YAML or the scene index text. The command validates the
   complete candidate and reconciles the index in the same transaction.

8. **Validate the result** — after editing, run `strict-spec-cli scene-status`
   and confirm:
   - the command result reports both the scene artifact and the reconciled index
   - every step reports as covered or as a deliberate waiver
   - no step reports an unresolved covering reference

9. **Summarize** — tell the user which scene changed, what was added, modified,
   removed, or waived, and which steps still report a coverage gap.

## Rules

- Ask the interrogation questions before authoring; a scene filled in from the
  code reproduces the blind spot it exists to expose
- Always read the recorded scenes and the spec index before authoring through
  `scene-edit`
- Present the exact changes and wait for confirmation before writing
- Every step carries covering requirements or an explicit reason it has none
- Never invent a covering reference to silence a coverage gap; report the
  missing requirement instead
- Describe observable situations, not implementation details
- Do not implement product code
- Do not create or interact with `.strict-spec-driven/changes/`; a scene change
  that belongs to an active strict change is authored as a delta scene by the
  change workflow, not here
- Never hand-edit scene or scene-index YAML; express every mutation through
  `strict-spec-cli scene-edit` with named arguments
