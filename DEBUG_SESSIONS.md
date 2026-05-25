# Debug Sessions

English

Debug sessions are strict YAML investigation records for local Web API,
frontend, Electron desktop, and CDP-access debugging. They preserve
reproduction steps, evidence, hypotheses, findings, human checkpoints, manual
actions, replay commands, and verification state.

Each session lives under:

```text
.strict-spec-driven/debug-sessions/<session-id>/
  session.yaml
  evidence/
```

Create a starter artifact:

```sh
strict-spec-driven debug-session-create checkout-cdp-target
```

Validate an artifact by ID or path:

```sh
strict-spec-driven debug-session-validate checkout-cdp-target
strict-spec-driven debug-session-validate .strict-spec-driven/debug-sessions/checkout-cdp-target/session.yaml
```

Use `/strict-spec-debug-session` when an agent should run the investigation.
The skill keeps human participation structured: humans enter credentials,
one-time codes, OAuth consent, payment confirmation, and other sensitive values
directly in the prepared browser or Electron session. The artifact records only
the semantic action, redacted evidence references, and the observable state
after the action; secret values are not stored in YAML, evidence filenames,
logs, or chat.

The `scope.layers` and per-target `layer` fields localize findings to one of:

| Layer | Use For |
|---|---|
| `web_api` | Requests, payloads, responses, status codes, API-side errors |
| `frontend` | Browser routes, DOM state, console output, rendering, client state |
| `electron` | Electron windows, webviews, shell-only behavior, preload/runtime context |
| `cdp_access` | CDP endpoint health, target discovery, target selection, attach failures |

For Electron debugging, record `cdp_health` before trusting captured browser
evidence. If the selected target is not clearly the intended window or webview,
classify the problem as `cdp_access` until target selection is resolved.

## Development Session Lifecycle

When a debug session needs local services, use the existing development-session
lifecycle commands instead of inventing startup or cleanup steps inside the
debug workflow:

```sh
strict-spec-driven dev-session-plan
strict-spec-driven dev-session-start
strict-spec-driven dev-session-status
strict-spec-driven dev-session-logs web
strict-spec-driven dev-session-stop
```

Record the relationship in `session.yaml`:

```yaml
dev_session:
  declaration: .strict-spec-driven/dev-session.yaml
  session_id: local-web-app
  services:
    - web
  lifecycle:
    plan:
      command: strict-spec-driven dev-session-plan
      status: passed
      evidence:
        - dev-session-plan
    start:
      command: strict-spec-driven dev-session-start
      status: passed
      evidence:
        - dev-session-start
    status:
      command: strict-spec-driven dev-session-status
      status: passed
      evidence:
        - dev-session-status
    logs:
      - service: web
        command: strict-spec-driven dev-session-logs web
        evidence:
          - web-log
    stop:
      command: strict-spec-driven dev-session-stop
      status: not_run
      evidence: []
    cleanup_status: pending
  unavailable_conditions: []
```

`dev-session` owns process startup, readiness, status, logs, and cleanup.
`debug-session` records which lifecycle commands were used and which evidence
proves the environment state. If services cannot start, classify the session as
blocked by environment setup until lifecycle diagnostics prove otherwise.
