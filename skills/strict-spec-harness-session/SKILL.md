---
name: strict-spec-harness-session
description: Guide harness investigation sessions with lifecycle evidence, human checkpoints, replay commands, and validation/archive steps.
metadata:
  skill_id: strict_spec_harness_session
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are running a harness investigation session.

## This Skill's Commands

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
harness-plan: strict-spec-cli harness-plan
harness-start: strict-spec-cli harness-start
harness-status: strict-spec-cli harness-status
harness-logs: strict-spec-cli harness-logs
harness-stop: strict-spec-cli harness-stop
harness-session: strict-spec-cli harness-session
```

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `harness-state`. Before the first mutation run
`strict-spec-cli yaml-authoring-protocol harness-state`: that command reports
the ordered authoring steps, the owning command for each operation, and the
bundled schema and example keys with their cache-resolved paths, bound to the
artifact kind and current where a copy would go stale. Validate the result with
`strict-spec-cli harness-doctor`.

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

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.

1. **Create or select a session** — use `harness-session create <session-id>` for a new investigation, or validate an existing active session with `harness-session validate <session-id>`.
2. **Record selected scope** — use `harness-session edit <session-id> --environment ... --selected-component ...` to keep the session tied to a harness environment and selected components.
3. **Capture lifecycle evidence** — run harness plan, start, status, logs, and stop commands through the project-local `scripts/harness-*` namespace when present.
4. **Handle human checkpoints** — record `human_checkpoints` and `manual_actions` through named `harness-session edit` checkpoint and manual-action flags; the CLI fixes `secrets_recorded: false`. Never store secret values or credential material.
5. **Record replay and verification** — use `harness-session edit` replay-command, verification-step, verification-status, and evidence flags so every update is schema-validated and non-destructive.
6. **Record the lesson before closeout (required)** — an investigation that reached a root cause is almost entirely reusable experience, and archiving the session buries it. Before archiving, state explicitly either that a lesson was recorded or that none applies, with the reason. A `resolved` session normally yields one: the reusable part is how the symptom mapped to the cause, not the fix itself. A `blocked` session can yield one too — what was ruled out, and the evidence that ruled it out. First check `strict-spec-cli lesson-status --category <category>` in the prospective lesson's category for an existing lesson with the same `applies_when` condition and append the recurrence with `lesson-edit <lesson-id> --origin <session-id> --evidence "..."` rather than creating a near-duplicate; otherwise record a new one with `lesson-create`. Spend the effort on `--applies-when`, which is the condition that decides whether anyone finds the lesson again — for an investigation, that is usually the *symptom*, not the cause.
7. **Validate and archive** — run `harness-session validate <session-id>` before closeout, then archive only sessions whose `harness_session.status` is `resolved` or `blocked`.

## Rules

- Use harness sessions as the replacement for debug-session records.
- Do not create, validate, or archive `debug-session` artifacts from this skill.
- Do not use `dev-session-*` lifecycle commands; use `harness-*` commands and generated `scripts/harness-*` wrappers.
- Do not delete, rewrite, or move evidence manually; use harness session archive behavior for closeout.
- Never edit `session.yaml` directly; create, update, remove named entries, delete an empty-evidence session, validate, and archive only through `harness-session` actions.
- Do not archive a session before the lesson outcome has been explicitly declared, and do not manufacture a lesson to satisfy the declaration.
