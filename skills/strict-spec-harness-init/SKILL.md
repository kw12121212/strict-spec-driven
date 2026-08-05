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
check-workflow-state: strict-spec-cli check-workflow-state
template-show-harness: strict-spec-cli template-show scaffold/harness.yaml
harness-infer: strict-spec-cli harness-infer
harness-edit: strict-spec-cli harness-edit [named semantic fields or removals]
harness-doctor: strict-spec-cli harness-doctor
harness-plan: strict-spec-cli harness-plan
harness-scripts-generate: strict-spec-cli harness-scripts generate
harness-scripts-verify: strict-spec-cli harness-scripts verify
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.

1. **Infer a safe draft first** — run `harness-infer` to inspect repository metadata and review the generated draft before authoring `.strict-spec-driven/harness.yaml` through `harness-edit`.
2. **Present the draft for human review** — display the full inferred harness declaration draft to the user in a readable format. Do not proceed past this step without user engagement.
3. **Ask mandatory confirmation questions** — ask the user to confirm or correct at least the following:
   - **Development environment**: Are the detected component types, start/stop commands, ports, URLs, and environment variable names correct?
   - **Production environment**: Should a production environment be declared? If so, are its component configurations and operation modes correct? Note that production start, stop, and cleanup default to disabled unless explicitly confirmed here.
   - **Cross-environment shared ports**: If the same port is declared in more than one environment (notably development and production), you MUST surface every shared port and require explicit human confirmation that it is intentional and free of conflict before writing `harness.yaml`. Do not silently accept a port reused across environments.
4. **Ask project-specific confirmation questions** — based on the inferred draft and repository context, ask additional targeted questions when the agent cannot confidently determine:
   - Stateful component lifecycle permissions (database, cache, queue, etc.)
   - Readiness probe settings (type, URL/port, timeouts)
   - Component dependency ordering
   - Any other detail the inference left uncertain
   Skip questions for items the agent can confidently resolve from the draft evidence.
5. **Require explicit approval before writing** — present the final `harness.yaml` content that will be written and require the user to confirm before proceeding. If the user requests changes, incorporate them and re-present for approval. Do not write files or run downstream commands until the user explicitly approves.
6. **Draft or update harness.yaml** — translate the approved draft into one or more `harness-edit` invocations with named environment, component, readiness, operation, list, or removal flags. Let the CLI preserve unnamed state and validate the complete candidate atomically. Never edit `harness.yaml` directly, and store only environment variable names, never secret values, credentials, tokens, or connection strings.
7. **Run deterministic repair checks** — run `harness-doctor`, then resolve missing working directories, missing package scripts, generated wrapper drift, env sample gaps, duplicated ports, and safety diagnostics. Treat the cross-environment shared-port safety diagnostic as confirm-required: do not silently resolve it by rewriting ports — surface it and require explicit human confirmation that the shared port is intentional.
8. **Validate the plan** — run `harness-plan` for each declared environment and resolve deterministic diagnostics.
9. **Generate scripts** — run `harness-scripts generate`, then run `harness-scripts verify`.

## Rules

- Use one project-local script namespace only: `scripts/harness-edit`, `scripts/harness-infer`, `scripts/harness-doctor`, `scripts/harness-plan`, `scripts/harness-start`, `scripts/harness-stop`, `scripts/harness-status`, `scripts/harness-logs`, and `scripts/harness-session`.
- Never write `.strict-spec-driven/harness.yaml` directly; use `harness-edit`, or `harness-infer --write` after the required approval when the inferred candidate is accepted unchanged.
- Treat `harness-infer` output as a draft. Do not enable inferred production commands or stateful lifecycle operations without explicit human confirmation.
- Production start, stop, cleanup, and destructive operations default to disabled unless the harness declaration explicitly permits them and requires confirmation for each invocation.
- Stateful components require explicit lifecycle permission before scripts may start, stop, or clean them up.
- Do not preserve `dev-session-*` or `debug-session-*` commands as aliases.
