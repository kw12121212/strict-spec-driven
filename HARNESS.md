# Harness

English | [中文](HARNESS.zh.md)

`harness.yaml` is the unified environment, component, lifecycle, and investigation model for strict projects.
It replaces separate development-session and debug-session workflows with one script-managed surface.

## Declaration

The declaration lives at `.strict-spec-driven/harness.yaml`.

It describes development and production environments, typed components, dependency order, readiness checks, secret-safe environment variable names, explicit operation modes, generated scripts, evidence labels, replay commands, and unavailable conditions.

Do not store secret values, credentials, tokens, connection strings, or production credential material in harness YAML, generated scripts, evidence filenames, logs, or chat.

Only `operations.start` and `operations.stop` are executable lifecycle hooks. `operations.status` and
`operations.logs` are optional descriptive metadata: when present, `readonly` means the declaration is
documenting availability, not supplying a command the CLI will run. `harness-status` always reports
runtime state, `harness-logs` always reads the captured runtime log file, and `harness-plan` plus
`harness-doctor` do not require status/logs commands.

## Commands

```bash
strict-spec-cli harness-infer
strict-spec-cli harness-infer --write
strict-spec-cli harness-edit --component-environment development --component web --component-type frontend --port 3000
strict-spec-cli harness-doctor
strict-spec-cli harness-plan --environment development
strict-spec-cli harness-start --environment development --component web
strict-spec-cli harness-status
strict-spec-cli harness-logs web
strict-spec-cli harness-logs web --tail 50
strict-spec-cli harness-logs web --all
strict-spec-cli harness-stop
strict-spec-cli harness-scripts generate
strict-spec-cli harness-scripts verify
strict-spec-cli harness-session create checkout-investigation
strict-spec-cli harness-session validate checkout-investigation
strict-spec-cli harness-session archive checkout-investigation
```

The declaration and session artifacts are CLI-owned YAML: AI workflows create and change them through `harness-infer --write`, `harness-edit`, and `harness-session` named arguments rather than by writing YAML text, while a human may still maintain the declaration by hand. <!-- human-manual-edit --> Consult `strict-spec-cli harness-edit --help --json` and `strict-spec-cli harness-session --help --json` for the exact argument contracts, and inspect the artifact shapes with `schema-show harness`, `schema-show harness-session`, and the matching `sample-show` keys. `harness-infer` (without `--write`), `harness-plan`, `harness-doctor`, `harness-status`, and `harness-logs` are read-only inspection. The `schema_file` each artifact declares resolves beneath the shared schema cache root `~/.strict-spec-schemas/` (or `STRICT_SPEC_SCHEMA_CACHE_DIR`), and schema `example_ref` paths resolve beneath the cached examples tree.

`harness-scripts generate` writes project-local wrappers:

- `scripts/harness-infer`
- `scripts/harness-doctor`
- `scripts/harness-plan`
- `scripts/harness-start`
- `scripts/harness-stop`
- `scripts/harness-status`
- `scripts/harness-logs`
- `scripts/harness-session`

`harness-infer` reads safe repository metadata such as package scripts, compose services, Procfile processes, Makefile run/start/dev targets, and sample environment variable files, then emits a schema-valid draft. Package scripts still win when multiple signal types coexist; otherwise the first app-like candidate in file order is selected for compose and Procfile sources. Inferred lifecycle commands stay manual, production lifecycle operations stay disabled, inferred status/logs metadata stays descriptive with `readonly`, and when no supported lifecycle signal is found the draft stays manual with an explicit no-detection explanation.

`harness-doctor` reports deterministic diagnostics for schema or planning failures, missing generated wrappers, missing working directories, missing package scripts, required environment names that are absent from sample env files, duplicated ports, and safety policy issues. It does not start or stop services. Sample env files such as `.env.example` only document required variable names: `harness-start` still reads the current process environment, does not load `.env` files for you, and requires you to export or source required values before starting components.

`harness-logs` reads the captured runtime log for the selected managed component. By default it returns only the most recent 200 lines; use `--tail <n>` to request a different line count or `--all` to print the full captured log.

## Safety

Production mutating operations default to disabled. A production `start`, `stop`, or cleanup-like operation must be explicitly declared, set `requires_confirmation: true`, and be invoked with confirmation.

Stateful components such as databases, caches, queues, object storage, and managed external resources require `allow_stateful_lifecycle: true` before scripts may start or stop them.

## Sessions

Harness sessions live under `.strict-spec-driven/harness-sessions/<session-id>/`.
Each session records selected environment/components, lifecycle evidence, reproduction steps, evidence entries, hypotheses, findings, human checkpoints, manual actions, replay commands, and verification status.

Evidence entries and manual actions must keep `contains_secrets: false` and `secrets_recorded: false`.

## Skills

Two skills drive the harness workflow:

### `/strict-spec-harness-init`

Creates or refines a project harness declaration. Steps:

1. Runs `harness-infer` to draft `harness.yaml` from repository metadata (package scripts, compose services, Procfile processes, Makefile targets, sample env files).
2. Inspects the project for frontend, backend, database, cache, worker, queue, object storage, external resource, browser, Electron, and CDP components.
3. Asks targeted questions when commands, production safety, stateful lifecycle permission, readiness checks, or secret-safe env var names cannot be discovered.
4. Writes `.strict-spec-driven/harness.yaml` storing only environment variable names — never secret values.
5. Runs `harness-doctor` to resolve missing directories, missing scripts, wrapper drift, env sample gaps, duplicated ports, and safety issues.
6. Validates via `harness-plan` for each declared environment.
7. Generates and verifies project-local scripts under `scripts/`.

Inferred production commands and stateful lifecycle operations stay disabled until the human confirms them explicitly.

### `/strict-spec-harness-session`

Guides harness investigation sessions with lifecycle evidence, human checkpoints, replay commands, and validation. Steps:

1. Creates a new session with `harness-session create <session-id>` or validates an existing one.
2. Records the selected harness environment and components.
3. Captures lifecycle evidence through `scripts/harness-*` wrappers (plan, start, status, logs, stop).
4. Records sensitive or manual actions via `human_checkpoints` and `manual_actions` with `secrets_recorded: false`.
5. Preserves replay commands and updates verification status with evidence identifiers.
6. Validates with `harness-session validate <session-id>`, then archives sessions whose status is `resolved` or `blocked`.

This skill replaces the older debug-session workflow. Do not create or manage `debug-session` artifacts from it.
