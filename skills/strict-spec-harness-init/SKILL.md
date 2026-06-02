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
2. **Present the draft for human review** — display the full inferred harness declaration draft to the user in a readable format. Do not proceed past this step without user engagement.
3. **Ask mandatory confirmation questions** — ask the user to confirm or correct at least the following:
   - **Development environment**: Are the detected component types, start/stop commands, ports, URLs, and environment variable names correct?
   - **Production environment**: Should a production environment be declared? If so, are its component configurations and operation modes correct? Note that production start, stop, and cleanup default to disabled unless explicitly confirmed here.
4. **Ask project-specific confirmation questions** — based on the inferred draft and repository context, ask additional targeted questions when the agent cannot confidently determine:
   - Stateful component lifecycle permissions (database, cache, queue, etc.)
   - Readiness probe settings (type, URL/port, timeouts)
   - Component dependency ordering
   - Any other detail the inference left uncertain
   Skip questions for items the agent can confidently resolve from the draft evidence.
5. **Require explicit approval before writing** — present the final `harness.yaml` content that will be written and require the user to confirm before proceeding. If the user requests changes, incorporate them and re-present for approval. Do not write files or run downstream commands until the user explicitly approves.
6. **Draft or update harness.yaml** — write `.strict-spec-driven/harness.yaml` from the approved draft and only store environment variable names, never secret values, credentials, tokens, or connection strings.
7. **Run deterministic repair checks** — run `harness-doctor`, then resolve missing working directories, missing package scripts, generated wrapper drift, env sample gaps, duplicated ports, and safety diagnostics.
8. **Validate the plan** — run `harness-plan` for each declared environment and resolve deterministic diagnostics.
9. **Generate scripts** — run `harness-scripts generate`, then run `harness-scripts verify`.

## Rules

- Use one project-local script namespace only: `scripts/harness-infer`, `scripts/harness-doctor`, `scripts/harness-plan`, `scripts/harness-start`, `scripts/harness-stop`, `scripts/harness-status`, `scripts/harness-logs`, and `scripts/harness-session`.
- Treat `harness-infer` output as a draft. Do not enable inferred production commands or stateful lifecycle operations without explicit human confirmation.
- Production start, stop, cleanup, and destructive operations default to disabled unless the harness declaration explicitly permits them and requires confirmation for each invocation.
- Stateful components require explicit lifecycle permission before scripts may start, stop, or clean them up.
- Do not preserve `dev-session-*` or `debug-session-*` commands as aliases.
