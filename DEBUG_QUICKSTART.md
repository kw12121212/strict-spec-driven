# Debug & Dev Session Quickstart

English | [中文](DEBUG_QUICKSTART.zh-CN.md)

A condensed getting-started guide for setting up local services and running
structured debug investigations in a strict-spec-cli project.

---

## 1. Initialize the Project

```sh
strict-spec-cli init
```

This creates `.strict-spec-driven/` with the dev-session scaffold. If the
directory already exists, re-running is safe — it does not overwrite existing
declarations.

---

## 2. Declare Your Dev Session

Edit `.strict-spec-driven/dev-session.yaml` or let the skill prepare it:

```
/strict-spec-dev-session-init
```

The skill reads your repo context and fills in commands, ports, readiness
checks, and browser targets automatically.

You need at least one service with a start command and a readiness probe:

```yaml
session:
  services:
    web:
      command: npm run dev
      working_directory: "."
      readiness:
        type: http
        url: "http://127.0.0.1:3000/health"
        timeout_seconds: 60
        interval_seconds: 2
```

Validate the declaration before proceeding:

```sh
strict-spec-cli dev-session-plan
```

---

## 3. Start Services

```sh
strict-spec-cli dev-session-start
```

This starts declared services in order, waits for readiness, and records PIDs
under `.strict-spec-driven/.runtime/dev-session/`.

Check status at any time:

```sh
strict-spec-cli dev-session-status
strict-spec-cli dev-session-logs web
```

Stop when done:

```sh
strict-spec-cli dev-session-stop
```

For convenience, use the lifecycle CLI commands directly:
```
node dist/strict-spec-cli.js dev-session-start
node dist/strict-spec-cli.js dev-session-stop
```

---

## 4. Create a Debug Session

When something breaks, start a structured investigation:

```sh
strict-spec-cli debug-session-create my-bug
```

This creates `.strict-spec-driven/debug-sessions/my-bug/session.yaml` and an
`evidence/` directory.

Or use the guided skill:

```
/strict-spec-debug-session
```

The skill walks you through the full investigation lifecycle.

---

## 5. Fill In the Investigation

Open the generated `session.yaml` and complete these sections:

### Describe the issue

```yaml
issue:
  summary: Button click does nothing on checkout page.
  observed_behavior: No network request is sent.
  expected_behavior: A POST /checkout request is sent.
```

### Classify the target layer

| Layer | When to use |
|---|---|
| `web_api` | API requests, responses, status codes |
| `frontend` | DOM state, console output, rendering |
| `electron` | Electron windows, webviews, shell behavior |
| `cdp_access` | CDP endpoint, target discovery, attach failures |

### Write reproduction steps

```yaml
reproduction:
  preconditions:
    - App is running and user is signed in.
  steps:
    - id: click-button
      target: checkout-page
      action: Click the checkout button.
      expected: Network request or validation error appears.
  expected_failure: No network request, no visible error.
```

### Capture evidence

Save files under `evidence/` and reference them:

```yaml
evidence:
  entries:
    - id: before-click
      type: screenshot
      path: evidence/before-click.png
      layer: frontend
      target: checkout-page
      description: Page state before clicking checkout.
      redacted: true
```

### Record hypotheses and findings

```yaml
hypotheses:
  - id: handler-missing
    statement: The click handler is not attached.
    layer: frontend
    status: open
    evidence:
      - before-click

findings:
  - id: handler-detached
    summary: React re-render removed the event listener.
    layer: frontend
    target: checkout-page
    status: confirmed
    evidence:
      - before-click
```

### Link to dev session lifecycle

If the debug session needs local services:

```yaml
dev_session:
  declaration: .strict-spec-driven/dev-session.yaml
  session_id: local-web-app
  services:
    - web
  lifecycle:
    plan:
      command: strict-spec-cli dev-session-plan
      status: passed
      evidence: [dev-session-plan]
    start:
      command: strict-spec-cli dev-session-start
      status: passed
      evidence: [dev-session-start]
    stop:
      command: strict-spec-cli dev-session-stop
      status: not_run
      evidence: []
    cleanup_status: pending
  unavailable_conditions: []
```

Debug-session records lifecycle evidence — it does not duplicate service
configuration or secret values.

---

## 6. Human Checkpoints

When credentials, 2FA, OAuth consent, or payment confirmation are required:

```yaml
human_checkpoints:
  - id: sign-in
    reason: Checkout requires authentication.
    requested_action: Sign in directly in the prepared browser window.
    sensitive: true
    status: pending
    resume_condition: Checkout form is visible after sign-in.
    evidence_before: [before-click]

manual_actions:
  - id: human-login
    checkpoint: sign-in
    actor: human
    summary: Human enters credentials directly; values are not recorded.
    secrets_recorded: false
    status: completed
```

**Never** ask the human to reveal passwords, tokens, or secrets in chat.
Record only the semantic action and observable state after completion.

---

## 7. Verify and Close

Record replay commands so another operator can reproduce from scratch:

```yaml
replay:
  commands:
    - id: test-checkout
      command: "npm test -- checkout"
      working_directory: "."
      layer: frontend
      expected_result: Reproduces or verifies the checkout behavior.

verification:
  status: passed
  steps:
    - id: repeat-click
      action: Click the checkout button again after the fix.
      expected: Network request or validation error appears.
      status: passed
  evidence: [after-fix-screenshot]
```

Validate the completed artifact:

```sh
strict-spec-cli debug-session-validate my-bug
```

---

## 8. Typical Workflow Summary

```
init ──► dev-session-plan ──► dev-session-start
                                    │
                              debug-session-create
                                    │
                         classify layer / reproduce
                                    │
                          capture evidence / hypotheses
                                    │
                          human checkpoint (if needed)
                                    │
                            verify / validate
                                    │
                              dev-session-stop
```

---

## Command Reference

| Command | Purpose |
|---|---|
| `strict-spec-cli init` | Create `.strict-spec-driven/` scaffold |
| `dev-session-plan` | Validate declaration, dry-run plan |
| `dev-session-start` | Start declared services with readiness checks |
| `dev-session-status` | Report managed service lifecycle state |
| `dev-session-logs <id>` | Print service log output |
| `dev-session-stop` | Stop managed services, clean up runtime state |
| `debug-session-create <id>` | Create debug session artifact and evidence dir |
| `debug-session-validate <id>` | Validate debug session YAML against schema |
