# Development Sessions

English | [中文](DEV_SESSIONS.zh.md)

This guide explains how to declare a local development session in a strict project, run the CLI inspection and lifecycle commands, generate helper scripts, and capture browser trial evidence — all from a single structured YAML file.

## What Is a Development Session?

A development session declaration tells agents and tools what local services the project needs, how to detect when they are ready, which browser targets to open for smoke testing, how to stop the services cleanly, and which environment variables are required — without storing any secret values.

The declaration lives at:

```
.strict-spec-driven/dev-session.yaml
```

When this file exists, the strict lifecycle skills (`strict-spec-apply`, `strict-spec-auto`, `strict-spec-verify`, `strict-spec-review`) automatically check it before starting services or running browser trials.

---

## Declaring a Session

Run `strict-spec-driven init` in a project to scaffold a starter declaration, or create the file manually. The declaration must conform to the `strict-spec-driven/dev-session/v1` schema.

### Minimal Frontend App Example

```yaml
schema: strict-spec-driven/dev-session/v1
schema_version: 1
artifact_type: dev_session
schema_file: ../../templates/strict-spec-driven/schemas/dev-session.yaml
session:
  id: local-web-app
  description: Frontend development session with one browser smoke target.
  services:
    web:
      description: Local frontend dev server.
      command: bun run dev
      working_directory: "."
      environment:
        required:
          - PORT
        optional:
          - API_BASE_URL
      urls:
        - "http://127.0.0.1:3000"
      ports:
        - 3000
      readiness:
        type: http
        url: "http://127.0.0.1:3000/health"
        timeout_seconds: 60
        interval_seconds: 2
        notes:
          - Update the health URL to match the project.
      browser_targets:
        - home
      cleanup:
        mode: signal
        signal: SIGTERM
        grace_period_seconds: 10
      unavailable_conditions:
        - Install project dependencies before starting the dev server.
  browser_targets:
    home:
      url: "http://127.0.0.1:3000"
      smoke_paths:
        - /
      evidence_labels:
        - homepage-loaded
      local_only: true
      service: web
      notes:
        - Confirm the page renders without console or network errors.
```

### Schema Field Reference

**Top-level `session` fields:**

| Field | Required | Description |
|---|---|---|
| `id` | yes | Kebab-case identifier for the session (e.g. `local-web-app`) |
| `description` | no | Human-readable description of the session |
| `services` | yes | Keyed map of declared local services (at least one) |
| `browser_targets` | yes | Keyed map of browser smoke targets (may be empty `{}`) |

**Per-service fields (under `session.services.<id>`):**

| Field | Required | Description |
|---|---|---|
| `description` | no | Human-readable description of the service |
| `command` | yes | Shell command to start the service |
| `working_directory` | yes | Working directory for the command (repo-relative or absolute) |
| `environment.required` | yes | List of environment variable names that must be set (no values) |
| `environment.optional` | yes | List of optional environment variable names (no values) |
| `urls` | yes | List of URLs the service exposes (may be empty) |
| `ports` | yes | List of ports the service listens on (may be empty) |
| `readiness` | yes | How to detect when the service is ready — see below |
| `browser_targets` | yes | List of browser-target IDs declared by this service |
| `cleanup` | yes | How to stop the service — see below |
| `unavailable_conditions` | yes | Human-readable notes about missing prerequisites (may be empty) |

**Readiness sub-fields:**

| Field | Required | Description |
|---|---|---|
| `type` | yes | `http`, `tcp`, or `manual` |
| `url` | if `type: http` | URL to poll (must return 2xx) |
| `port` | if `type: tcp` | TCP port to probe |
| `timeout_seconds` | yes | Maximum wait time before declaring the service unavailable |
| `interval_seconds` | yes | Polling interval |
| `notes` | no | Human-readable readiness notes |

**Cleanup sub-fields:**

| Field | Required | Description |
|---|---|---|
| `mode` | yes | `signal`, `command`, or `none` |
| `signal` | if `mode: signal` | Signal name to send (e.g. `SIGTERM`) |
| `command` | if `mode: command` | Shell command to run for cleanup |
| `grace_period_seconds` | yes | Seconds to wait after signal before force-kill |

**Per-browser-target fields (under `session.browser_targets.<id>`):**

| Field | Required | Description |
|---|---|---|
| `url` | yes | Local URL to open in the browser |
| `smoke_paths` | yes | Path suffixes to visit during the smoke check (at least one) |
| `evidence_labels` | yes | Human-readable labels for evidence to capture (at least one) |
| `local_only` | yes | `true` when the target is only reachable locally |
| `service` | no | Service ID that must be running for this target |
| `notes` | no | Additional human-readable guidance for the smoke check |

---

## CLI Commands

All commands require `.strict-spec-driven/dev-session.yaml` to exist and be valid.
Run commands from the project root with:

```sh
node /path/to/strict-spec-driven/dist/strict-spec-cli.js <subcommand>
```

Or via the `{{SKILL_DIR}}/scripts/strict-spec-driven.js` path when invoked from a skill.

### `dev-session-plan`

Validates the declaration and emits a deterministic dry session plan. No processes are started, no files are written.

```sh
strict-spec-driven dev-session-plan
```

**Output (JSON, stdout):** `{ valid: true|false, artifactPath, session: { id, services: [...], browserTargets: [...] }, diagnostics: [...] }`

Exit zero when `valid: true`. Exit non-zero with diagnostics when the declaration is missing or invalid.

**Use this first** — agents should run `dev-session-plan` before starting any services to confirm the declared commands and browser targets are what the project expects.

### `dev-session-start`

Loads the declaration, starts each declared service in declaration order, waits for readiness, and records managed runtime state under `.strict-spec-driven/.runtime/dev-session/`.

```sh
strict-spec-driven dev-session-start
```

**Output (JSON, stdout):** `{ ok: true|false, artifactPath, runtimeStatePath, sessionId, services: [{ id, status, pid, logPath, urls, ports }], diagnostics: [...] }`

Only starts services declared in the file. Does not guess undeclared commands or ports. If a required environment variable is unset, the command reports the missing variable in diagnostics without starting any service.

### `dev-session-status`

Reports the lifecycle state of services previously started by `dev-session-start`. Distinguishes `running`, `failed`, `stopped`, and `stale` records.

```sh
strict-spec-driven dev-session-status
```

**Output (JSON, stdout):** Same shape as `dev-session-start` output. `ok: false` when no managed runtime state is found.

A `stale` status means the runtime record exists but the recorded process is no longer alive (for example, after a system restart or crash). See [Stale Runtime Cleanup](#stale-runtime-cleanup) below.

### `dev-session-logs`

Prints the log file content for a declared service. Optionally accepts a service ID when multiple services are declared.

```sh
strict-spec-driven dev-session-logs           # prints logs for first service
strict-spec-driven dev-session-logs web       # prints logs for service id "web"
```

**Output:** Plain text to stdout on success. JSON diagnostics to stdout on error (exit non-zero).

### `dev-session-stop`

Stops only the processes recorded by the most recent `dev-session-start`. Tolerates stale records and makes cleanup idempotent — running `dev-session-stop` twice is safe.

```sh
strict-spec-driven dev-session-stop
```

**Output (JSON, stdout):** `{ ok: true|false, artifactPath, runtimeStatePath, sessionId, services: [{ id, status, ... }], diagnostics: [...] }`

Only touches processes this tool started. Unrelated processes are never stopped.

### `dev-session-trial`

Derives browser trial guidance from the declared browser targets and the current managed runtime state. Does not start services or open a browser — it reports what to open and what evidence to capture.

```sh
strict-spec-driven dev-session-trial
```

**Output (JSON, stdout):** `{ ok: true|false, artifactPath, runtimeStatePath, sessionId, browserTargets: [{ id, url, smokePaths, evidenceLabels, localOnly, service, notes, provenance, trialReady, managedServiceStatus? }], diagnostics: [...] }`

Each browser target includes a `provenance` field:

| Provenance | Meaning |
|---|---|
| `started_by_strict` | The backing service was started by `dev-session-start` |
| `already_available` | The backing service is not managed but the URL appears reachable |
| `unavailable` | The backing service is not running and was not started by this tool |

`trialReady: true` when the target appears ready for a browser smoke check.

---

## Browser Trial Evidence

Browser trial evidence supplements your regular testing — it does **not** replace the required project regression command.

After `dev-session-trial` reports ready targets, an agent:
1. Opens the declared URL in a browser.
2. Navigates to each `smoke_paths` entry.
3. Captures the observations named in `evidence_labels` (screenshots, console logs, HTTP status codes, etc.).
4. Reports the captured evidence alongside any `notes` from the browser target.
5. Stops created services with `dev-session-stop` when done.

The captured evidence is supplemental context. The required project-level regression command (configured in `.strict-spec-driven/config.yaml` under `review_evidence.project_regression`) must still pass before a strict change can be archived.

---

## Secret Handling

The declaration stores **environment variable names only** — never values.

```yaml
# Correct: list variable names
environment:
  required:
    - DATABASE_URL
    - API_SECRET_KEY
  optional:
    - LOG_LEVEL
```

```yaml
# WRONG: do not embed values
environment:
  values:            # not a valid field — schema rejects this
    DATABASE_URL: postgres://...
```

If a service cannot run without a particular setup step, document it in `unavailable_conditions`:

```yaml
unavailable_conditions:
  - Run `bun install` before starting the dev server.
  - Ensure DATABASE_URL is set in your local environment.
```

Agents and generated helper scripts reference only the variable names and emit pre-flight checks that fail early when required variables are unset, rather than attempting to start the service and failing mid-way.

---

## Stale Runtime Cleanup

Runtime state lives in `.strict-spec-driven/.runtime/dev-session/` (gitignored). This directory is written only by `dev-session-start` and cleaned up by `dev-session-stop`.

After a system restart or process crash, the state file may contain records whose PIDs are no longer alive. `dev-session-status` reports these as `stale`. `dev-session-stop` skips stale records safely and removes them from the state file so subsequent `dev-session-status` calls no longer show them.

You can also remove stale state manually:

```sh
rm -rf .strict-spec-driven/.runtime/dev-session
```

This is safe — the next `dev-session-start` will recreate the directory and write fresh state.

---

## Generated Helper Scripts

The `/strict-spec-dev-session-scripts` skill generates project-local shell scripts from the declaration so users do not need to remember strict CLI subcommands.

**Invoke it from Claude Code:**

```
/strict-spec-dev-session-scripts
```

The skill runs `dev-session-plan` to validate the declaration, then writes (by default) four scripts under `scripts/`:

| Script | Wraps |
|---|---|
| `scripts/dev-start` | `dev-session-start` (with required-variable pre-flight) |
| `scripts/dev-stop` | `dev-session-stop` |
| `scripts/dev-status` | `dev-session-status` |
| `scripts/dev-logs` | `dev-session-logs` (passes arguments through) |

### Managed Sections

Each generated script contains a `BEGIN STRICT-MANAGED SECTION` / `END STRICT-MANAGED SECTION` comment block. The skill only replaces the content between those markers on regeneration. Any content you add above or below the markers is preserved.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Regenerate with: /strict-spec-dev-session-scripts

# ============================================================
# BEGIN STRICT-MANAGED SECTION
# DO NOT EDIT BETWEEN THE MANAGED-SECTION MARKERS
# ============================================================

node "$(dirname "$0")/../dist/scripts/strict-spec-driven.js" dev-session-stop

# ============================================================
# END STRICT-MANAGED SECTION
# ============================================================

# You can add custom post-stop logic here safely.
```

### Non-Clobbering Rules

- If the script does not exist: it is created fresh.
- If the script exists with a managed section: only the managed block is updated.
- If the script exists without a managed section: the skill stops and asks for confirmation before overwriting.

### Secret Safety

Generated scripts never embed environment variable values. The `dev-start` script emits a pre-flight loop that checks each `environment.required` variable and exits with a human-readable error if any is unset.

---

## Using Dev Sessions in Strict Changes

When `.strict-spec-driven/dev-session.yaml` exists:

1. **Before starting services**: run `dev-session-plan` to confirm the declared commands and browser targets.
2. **Starting services**: run `dev-session-start` rather than guessing or running commands directly.
3. **Checking readiness**: inspect `dev-session-status` output instead of polling manually.
4. **Browser trials**: run `dev-session-trial` to get the declared URLs and evidence labels; open the URLs, walk the smoke paths, and capture the named evidence.
5. **Stopping services**: always run `dev-session-stop` before finishing a task that started services — even if a later step also stops them.
6. **Unavailable prerequisites**: if `dev-session-plan` reports diagnostics or a required environment variable is unset, stop and provide the human with actionable setup guidance rather than attempting to work around the missing prerequisite.

The required project regression command (`bun run build && bun test/run.ts` in this repository, or the command in your project's `.strict-spec-driven/config.yaml`) remains the authoritative evidence gate for strict change archive. Browser trial evidence is supplemental and does not replace it.
