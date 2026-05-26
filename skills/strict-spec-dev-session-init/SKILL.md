---
name: strict-spec-dev-session-init
description: Bootstrap or refine .strict-spec-driven/dev-session.yaml from repository context, then validate it with dev-session-plan.
metadata:
  skill_id: strict_spec_dev_session_init
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are initializing a strict development-session declaration for the current project.

## This Skill's Commands

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
template-show: node {{SKILL_DIR}}/scripts/strict-spec-driven.js template-show scaffold/dev-session.yaml
dev-session-plan: node {{SKILL_DIR}}/scripts/strict-spec-driven.js dev-session-plan
```

## When to Use

Use this skill when:
- The user wants to create, initialize, bootstrap, or repair `.strict-spec-driven/dev-session.yaml`.
- The repository already uses strict workflow state but the dev-session declaration is still a placeholder or missing.
- The user wants AI to draft a usable dev-session declaration from project files instead of filling the YAML manually.

Do NOT use when:
- The user wants to start/stop services — use the lifecycle CLI commands directly.
- The user wants to change the dev-session schema or lifecycle CLI semantics.
- The user wants to start services, run browser trials, or inspect runtime logs — use the lifecycle commands instead.

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

Work in the intended repository root before writing
`.strict-spec-driven/dev-session.yaml`.

## Steps

Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Read project context and any existing declaration** — inspect the repository
   files that best describe local development behavior, including:
   - `.strict-spec-driven/dev-session.yaml` if it already exists
   - `README.md`, `AGENTS.md`, `package.json`, and project-local docs
   - environment examples or setup files that declare variable names only
   - source or config files that clearly expose local ports, URLs, or health endpoints

2. **Load the bundled declaration shape when the file is missing** — if
   `.strict-spec-driven/dev-session.yaml` does not exist yet, run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js template-show scaffold/dev-session.yaml
   ```
   Use the bundled template output as the strict YAML shape when you need to
   create the declaration directly inside an already initialized strict
   workflow.

3. **Refine the declaration in place** — update `.strict-spec-driven/dev-session.yaml`
   so it describes the repository's actual local development session:
   - replace scaffold placeholder values with project-specific content
   - preserve existing user-authored values when they are already valid and more
     specific than repository heuristics
   - infer a sensible `session.id`, service IDs, descriptions, `working_directory`, URLs, ports, browser targets, and environment variable names from the repository context
   - prefer explicit project evidence over assumptions

4. **Stay conservative when metadata is uncertain**:
   - if a startup command is clearly documented, use it; otherwise stop and explain what is missing
   - if a readiness URL is not clearly declared but a port is known, prefer `tcp` readiness
   - if neither a reliable readiness URL nor port is clear, use `manual` readiness with explanatory notes
   - if browser smoke targets are not clearly documented, keep `browser_targets: {}` rather than inventing routes
   - record prerequisite gaps in `unavailable_conditions`
   - never write secret values; only store environment variable names

5. **Validate before handoff** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js dev-session-plan
   ```
   - If validation fails because of safe, local declaration issues, fix the YAML and rerun the command.
   - If validation still fails because the repository does not provide enough information, stop and report the blocking diagnostics together with the assumptions that need human confirmation.

6. **Hand off the result** — summarize:
   - whether the declaration was created directly or refined in place
   - the resolved session ID and declared service IDs
   - the chosen readiness strategy and any conservative fallbacks
   - any required environment variable names
   - that the declaration is ready for use with the lifecycle CLI commands

## Rules

- When `.strict-spec-driven/dev-session.yaml` is missing but `.strict-spec-driven/`
  exists, create the file directly using the bundled strict template shape.
- When `.strict-spec-driven/dev-session.yaml` already exists, update it in place instead of replacing it wholesale.
- Do not start services, open browsers, write runtime state, or generate helper scripts in this skill.
- Do not invent secret values, undeclared routes, or speculative health endpoints.
- End with `dev-session-plan` success or deterministic diagnostics.
