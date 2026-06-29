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
check-workflow-state: strict-spec-driven check-workflow-state
harness-plan: strict-spec-driven harness-plan
harness-start: strict-spec-driven harness-start
harness-status: strict-spec-driven harness-status
harness-logs: strict-spec-driven harness-logs
harness-stop: strict-spec-driven harness-stop
harness-session: strict-spec-driven harness-session
```

## Prerequisites

Run `strict-spec-driven check-workflow-state` before any workflow work. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

Before any other step, run `strict-spec-driven check-workflow-state`. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.

1. **Create or select a session** — use `harness-session create <session-id>` for a new investigation, or validate an existing active session with `harness-session validate <session-id>`.
2. **Record selected scope** — keep the session tied to a harness environment and selected components.
3. **Capture lifecycle evidence** — run harness plan, start, status, logs, and stop commands through the project-local `scripts/harness-*` namespace when present.
4. **Handle human checkpoints** — record sensitive or manual actions through `human_checkpoints` and `manual_actions` with `secrets_recorded: false`; never store secret values or credential material.
5. **Record replay and verification** — preserve commands needed to replay the investigation and update verification status with evidence identifiers.
6. **Validate and archive** — run `harness-session validate <session-id>` before closeout, then archive only sessions whose `harness_session.status` is `resolved` or `blocked`.

## Rules

- Use harness sessions as the replacement for debug-session records.
- Do not create, validate, or archive `debug-session` artifacts from this skill.
- Do not use `dev-session-*` lifecycle commands; use `harness-*` commands and generated `scripts/harness-*` wrappers.
- Do not delete, rewrite, or move evidence manually; use harness session archive behavior for closeout.
