# Debug & Dev Session Quickstart

English | [中文](DEBUG_QUICKSTART.zh-CN.md)

A condensed getting-started guide for setting up local services and running
structured debug investigations in a strict-spec-cli project. Dev sessions and
debug sessions are unified under the harness workflow: one declaration for
environments and components, one session artifact per investigation.

Session and declaration YAML is CLI-owned: AI workflows author every field
through `harness-edit` and `harness-session` named arguments, never by writing
YAML text. The YAML snippets below show what the CLI produces, as read-only
reference. Run `strict-spec-cli yaml-authoring-protocol` for the general
authoring protocol, read `<command> --help --json` for each owning command's
argument contract, and `schema-show harness` / `schema-show harness-session`
plus the matching `sample-show` keys for each artifact's contract. Declared
`schema_file` paths resolve beneath the shared schema cache root
`~/.strict-spec-schemas/` (or `STRICT_SPEC_SCHEMA_CACHE_DIR`).

---

## 1. Initialize the Project

```sh
strict-spec-cli init
```

This creates `.strict-spec-driven/`. Re-running is safe — it does not
overwrite existing declarations.

---

## 2. Declare Your Harness

Let the skill prepare the declaration from repository context:

```
/strict-spec-harness-init
```

Or draft and refine it directly through the CLI:

```sh
strict-spec-cli harness-infer --write
strict-spec-cli harness-edit --component-environment development --component web \
  --component-type frontend --working-directory . --port 3000
```

A human may still maintain `.strict-spec-driven/harness.yaml` by hand outside
the AI workflow. <!-- human-manual-edit -->

You need at least one component with a start operation and a readiness check.
The declaration the CLI produces looks like:

```yaml
components:
  web:
    type: frontend
    working_directory: "."
    readiness:
      type: http
      url: "http://127.0.0.1:3000/health"
      timeout_seconds: 60
      interval_seconds: 2
```

Validate the declaration before proceeding:

```sh
strict-spec-cli harness-doctor
strict-spec-cli harness-plan --environment development
```

---

## 3. Start Components

```sh
strict-spec-cli harness-start --environment development
```

This starts declared components in dependency order, waits for readiness, and
records runtime state. Check status and logs at any time:

```sh
strict-spec-cli harness-status
strict-spec-cli harness-logs web
```

Stop when done:

```sh
strict-spec-cli harness-stop
```

---

## 4. Create a Harness Session

When something breaks, start a structured investigation:

```sh
strict-spec-cli harness-session create my-bug
```

This creates `.strict-spec-driven/harness-sessions/my-bug/` with the session
artifact and an evidence directory. Or use the guided skill, which walks
through the full investigation lifecycle:

```
/strict-spec-harness-session
```

---

## 5. Record the Investigation

Every session field is written through `harness-session edit` named arguments.

### Describe the issue

```sh
strict-spec-cli harness-session edit my-bug \
  --issue-summary "Button click does nothing on checkout page." \
  --observed-behavior "No network request is sent." \
  --expected-behavior "A POST /checkout request is sent."
```

### Record reproduction steps

```sh
strict-spec-cli harness-session edit my-bug \
  --precondition "App is running and user is signed in." \
  --step click-button --step-target web \
  --step-action "Click the checkout button." \
  --step-expected "Network request or validation error appears."
```

### Capture evidence

Save files under the session's evidence directory, then register them:

```sh
strict-spec-cli harness-session edit my-bug \
  --evidence before-click --evidence-kind screenshot \
  --evidence-path evidence/before-click.png \
  --evidence-description "Page state before clicking checkout."
```

### Record hypotheses and findings

```sh
strict-spec-cli harness-session edit my-bug \
  --hypothesis handler-missing \
  --hypothesis-statement "The click handler is not attached." \
  --hypothesis-status open --hypothesis-evidence before-click

strict-spec-cli harness-session edit my-bug \
  --finding handler-detached \
  --finding-summary "React re-render removed the event listener." \
  --finding-target web --finding-status confirmed \
  --finding-evidence before-click
```

Sessions record lifecycle evidence from the `scripts/harness-*` wrappers —
they do not duplicate service configuration or secret values.

---

## 6. Human Checkpoints

When credentials, 2FA, OAuth consent, or payment confirmation are required:

```sh
strict-spec-cli harness-session edit my-bug \
  --checkpoint sign-in \
  --checkpoint-reason "Checkout requires authentication." \
  --checkpoint-action "Sign in directly in the prepared browser window." \
  --checkpoint-sensitive true --checkpoint-status pending \
  --checkpoint-resume "Checkout form is visible after sign-in."

strict-spec-cli harness-session edit my-bug \
  --manual-action human-login --manual-actor human \
  --manual-summary "Human enters credentials directly; values are not recorded." \
  --manual-status completed
```

**Never** ask the human to reveal passwords, tokens, or secrets in chat.
Record only the semantic action and observable state after completion.
Evidence entries and manual actions keep `contains_secrets: false` and
`secrets_recorded: false`.

---

## 7. Verify and Close

Record replay commands so another operator can reproduce from scratch, then
set the verification state:

```sh
strict-spec-cli harness-session edit my-bug \
  --replay-command "npm test -- checkout" \
  --verification-step repeat-click \
  --step-action "Click the checkout button again after the fix." \
  --step-expected "Network request or validation error appears." \
  --verification-status passed --verification-evidence after-fix-screenshot
```

Validate the completed artifact, then archive a `resolved` or `blocked`
session:

```sh
strict-spec-cli harness-session validate my-bug
strict-spec-cli harness-session archive my-bug
```

---

## 8. Typical Workflow Summary

```
init ──► harness-plan ──► harness-start
                               │
                     harness-session create
                               │
                    reproduce / capture evidence
                               │
                     hypotheses and findings
                               │
                    human checkpoint (if needed)
                               │
              harness-session validate / archive
                               │
                         harness-stop
```

---

## Command Reference

| Command | Purpose |
|---|---|
| `strict-spec-cli init` | Create `.strict-spec-driven/` scaffold |
| `harness-infer [--write]` | Draft the declaration from repository metadata |
| `harness-edit` | Update the declaration through named arguments |
| `harness-doctor` | Diagnose declaration, wrapper, environment, and safety issues |
| `harness-plan` | Validate declaration, dry-run plan |
| `harness-start` | Start declared components with readiness checks |
| `harness-status` | Report managed component lifecycle state |
| `harness-logs <id>` | Print captured component log output |
| `harness-stop` | Stop managed components, clean up runtime state |
| `harness-session create <id>` | Create session artifact and evidence dir |
| `harness-session edit <id>` | Record session fields through named arguments |
| `harness-session validate <id>` | Validate session YAML against schema |
| `harness-session archive <id>` | Archive a resolved or blocked session |

See [HARNESS.md](HARNESS.md) for the full reference.
