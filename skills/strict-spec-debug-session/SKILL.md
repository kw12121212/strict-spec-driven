---
name: strict-spec-debug-session
description: Create and guide strict debug-session investigations for Web API, frontend, Electron desktop, and CDP access issues with structured evidence and human checkpoints.
metadata:
  skill_id: strict_spec_debug_session
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are running a strict debug-session investigation for a single issue.

## This Skill's Commands

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
debug-session-create: node {{SKILL_DIR}}/scripts/strict-spec-driven.js debug-session-create <session-id>
debug-session-validate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js debug-session-validate <session-id|session.yaml>
dev-session-plan: node {{SKILL_DIR}}/scripts/strict-spec-driven.js dev-session-plan
dev-session-start: node {{SKILL_DIR}}/scripts/strict-spec-driven.js dev-session-start
dev-session-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js dev-session-status
dev-session-logs: node {{SKILL_DIR}}/scripts/strict-spec-driven.js dev-session-logs [service-id]
dev-session-stop: node {{SKILL_DIR}}/scripts/strict-spec-driven.js dev-session-stop
schema-show: node {{SKILL_DIR}}/scripts/strict-spec-driven.js schema-show debug-session
template-show: node {{SKILL_DIR}}/scripts/strict-spec-driven.js template-show scaffold/debug-sessions/session.yaml
```

## Prerequisites

Run `check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

Work in the intended repository root before creating or updating files under
`.strict-spec-driven/debug-sessions/`.

## Steps

Before any other step, run `check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Create or resume the session** — if no debug-session artifact exists, run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js debug-session-create <session-id>
   ```
   Reuse an existing `.strict-spec-driven/debug-sessions/<session-id>/session.yaml`
   when the user is resuming an investigation.

2. **Classify the target layer** — record every relevant target as Web API,
   frontend, Electron, or CDP access:
   - Web API: request method, URL, payload shape, response status, and response body evidence
   - frontend: route, DOM state, console output, network requests, screenshots, and user-visible state
   - Electron: selected window or webview, shell-only behavior, preload/runtime context, and screenshot evidence
   - CDP access: endpoint, target list, selected target type, selected URL, and target-switching evidence

3. **Use dev-session for local services** — when the investigation needs local
   services, do not invent startup or cleanup commands inside the debug workflow.
   Run `dev-session-plan` first, then use `dev-session-start`,
   `dev-session-status`, `dev-session-logs`, and `dev-session-stop` as needed.
   Record the declaration path, selected services, lifecycle command statuses,
   log/status evidence IDs, unavailable conditions, and cleanup status under
   `dev_session` in `session.yaml`.

4. **Reproduce before localizing** — write deterministic preconditions and
   reproduction steps before changing code. Capture at least one evidence item
   that proves the failure or shows why reproduction is blocked.

5. **Prepare evidence capture before human checkpoints** — when credentials,
   2FA, OAuth consent, payment confirmation, native dialogs, fragile gestures,
   or subjective visual judgment require human action:
   - create a `human_checkpoints` entry with the reason, requested action,
     sensitivity flag, resume condition, and pre-action evidence
   - ask the human for only the specific action needed
   - never ask the human to reveal passwords, one-time codes, private keys,
     payment secrets, production credentials, or credential values in chat
   - after the human resumes, record a `manual_actions` entry with
     `secrets_recorded: false` and capture post-action evidence

6. **Localize with hypotheses and findings** — keep hypotheses separate from
   confirmed findings. A finding must include a layer, target when available,
   status, summary, and supporting evidence IDs.

7. **Handle Electron and CDP carefully** — for Electron debugging, record CDP
   health before trusting browser evidence. Confirm the selected target type
   and URL match the intended window or webview. If CDP cannot attach or the
   selected target is ambiguous, classify that as `cdp_access` instead of
   inferring a frontend or Electron defect.

8. **Replay and verify** — record replay commands that another operator can run
   from a clean state. Verification must capture evidence after the fix or
   record why verification is blocked.

9. **Validate the artifact** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js debug-session-validate <session-id>
   ```
   Fix safe local YAML or schema issues and rerun validation before handoff.

## Rules

- Keep each investigation under `.strict-spec-driven/debug-sessions/<session-id>/`.
- Store evidence under the session's `evidence/` directory and reference files from `session.yaml`.
- Keep evidence references redacted when they may contain sensitive URLs, tokens, request bodies, screenshots, or user data.
- Keep service lifecycle ownership in dev-session; debug-session records lifecycle evidence and must not duplicate service configuration or secret values.
- Do not store secret values in `session.yaml`, evidence filenames, logs, or chat.
- Do not classify an issue as fixed without verification evidence or an explicit blocked verification result.
