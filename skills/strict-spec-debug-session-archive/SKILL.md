---
name: strict-spec-debug-session-archive
description: Archive a completed strict debug-session investigation after validation, preserving its session.yaml and evidence directory under debug-sessions/archive.
metadata:
  skill_id: strict_spec_debug_session_archive
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user archive a completed strict debug-session investigation.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
debug-session-validate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js debug-session-validate <session-id|session.yaml>
debug-session-archive: node {{SKILL_DIR}}/scripts/strict-spec-driven.js debug-session-archive <session-id|session.yaml>
```

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

The debug-session investigation must already exist under
`.strict-spec-driven/debug-sessions/<session-id>/` with its evidence files
stored under that session directory.

## Steps

Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Select the session** — use the session ID or explicit
   `.strict-spec-driven/debug-sessions/<session-id>/session.yaml` path supplied
   by the user. If neither is supplied, inspect
   `.strict-spec-driven/debug-sessions/` and choose only when exactly one active
   session is the clear target.

2. **Validate the artifact** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js debug-session-validate <session-id|session.yaml>
   ```
   Stop if validation reports schema, YAML, or filesystem diagnostics.

3. **Confirm closeout state** — read the current `session.yaml` and confirm
   `debug_session.status` is `resolved` or `blocked`. Confirm that findings,
   replay commands, verification evidence, blocked verification notes, or
   unavailable conditions explain why the investigation can leave active state.

4. **Archive the session** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js debug-session-archive <session-id|session.yaml>
   ```

5. **Confirm the result** — summarize the returned `archiveDir`, `archivePath`,
   and any diagnostics. The archived path is the handoff location for future
   review.

## Rules

- Do not archive a debug-session whose artifact fails validation.
- Do not archive a debug-session still in `proposed`, `reproducing`,
  `capturing`, `localizing`, `waiting_for_human`, or `verifying` status.
- Do not delete, rewrite, or move evidence manually; use the archive command to
  move the full session directory.
- Do not store or request secret values while preparing archive handoff.
