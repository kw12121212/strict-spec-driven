---
name: strict-spec-harness-init
description: Analyze a repository, draft .strict-spec-driven/harness.yaml, confirm open details with the human, and generate project-local harness scripts.
metadata:
  skill_id: strict_spec_harness_init
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are creating or refining a project harness declaration.

## This Skill's Commands

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
template-show-harness: node {{SKILL_DIR}}/scripts/strict-spec-driven.js template-show scaffold/harness.yaml
harness-infer: node {{SKILL_DIR}}/scripts/strict-spec-driven.js harness-infer
harness-doctor: node {{SKILL_DIR}}/scripts/strict-spec-driven.js harness-doctor
harness-plan: node {{SKILL_DIR}}/scripts/strict-spec-driven.js harness-plan
harness-scripts-generate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js harness-scripts generate
harness-scripts-verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js harness-scripts verify
```

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.

## Steps

Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.

1. **Infer a safe draft first** — run `harness-infer` to inspect repository metadata and review the generated draft before hand-editing `.strict-spec-driven/harness.yaml`.
2. **Inspect project operation context** — identify frontend, backend, database, cache, worker, queue, object storage, external resources, browser, Electron, and CDP components from repository files, existing scripts, and the inference evidence.
3. **Ask targeted questions** — stop for human answers when commands, production safety, stateful lifecycle permission, readiness checks, or secret-safe environment variable names cannot be discovered.
4. **Draft or update harness.yaml** — write `.strict-spec-driven/harness.yaml` from the inferred draft or harness template and only store environment variable names, never secret values, credentials, tokens, or connection strings.
5. **Run deterministic repair checks** — run `harness-doctor`, then resolve missing working directories, missing package scripts, generated wrapper drift, env sample gaps, duplicated ports, and safety diagnostics.
6. **Validate the plan** — run `harness-plan` for each declared environment and resolve deterministic diagnostics.
7. **Generate scripts** — run `harness-scripts generate`, then run `harness-scripts verify`.

## Rules

- Use one project-local script namespace only: `scripts/harness-infer`, `scripts/harness-doctor`, `scripts/harness-plan`, `scripts/harness-start`, `scripts/harness-stop`, `scripts/harness-status`, `scripts/harness-logs`, and `scripts/harness-session`.
- Treat `harness-infer` output as a draft. Do not enable inferred production commands or stateful lifecycle operations without explicit human confirmation.
- Production start, stop, cleanup, and destructive operations default to disabled unless the harness declaration explicitly permits them and requires confirmation for each invocation.
- Stateful components require explicit lifecycle permission before scripts may start, stop, or clean them up.
- Do not preserve `dev-session-*` or `debug-session-*` commands as aliases.
