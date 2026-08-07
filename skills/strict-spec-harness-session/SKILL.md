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

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `harness-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli harness-session --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show harness`, `strict-spec-cli schema-show harness-session`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show harness`, `strict-spec-cli sample-show harness-session`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli harness-session`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
6. **Inspect the structured result and changed paths** — read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.
7. **Run the artifact's validation command** — `strict-spec-cli harness-doctor`

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
