# Harness

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
strict-spec-driven harness-infer
strict-spec-driven harness-infer --write
strict-spec-driven harness-doctor
strict-spec-driven harness-plan --environment development
strict-spec-driven harness-start --environment development --component web
strict-spec-driven harness-status
strict-spec-driven harness-logs web
strict-spec-driven harness-logs web --tail 50
strict-spec-driven harness-logs web --all
strict-spec-driven harness-stop
strict-spec-driven harness-scripts generate
strict-spec-driven harness-scripts verify
strict-spec-driven harness-session create checkout-investigation
strict-spec-driven harness-session validate checkout-investigation
strict-spec-driven harness-session archive checkout-investigation
```

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
