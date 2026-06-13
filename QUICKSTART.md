# Quick Start: strict-spec-driven

English | [中文](QUICKSTART.zh.md)

This guide walks you through installing the strict workflow skills and running your first change lifecycle from scratch.

## Prerequisites

- [Bun](https://bun.sh) — runtime, package manager, and test runner
- Node.js with `npx` — required by the Agent Skills installer

Verify both are available:

```sh
bun --version
node --version
```

## Install the Strict Skills

Clone this repository, then register the strict skill packages so Claude Code can invoke them:

**Global install** (available in all projects):
```sh
bash install.sh
```

The command uses `npx skills add <repo-dir>` to register the skill packages in place. The source repository must remain at the registered path — the install does not copy files.

**Uninstall:**
```sh
bash install.sh --uninstall
```

### Verify the Install

After installing, the strict skills should be available in Claude Code. You can also verify skill packaging directly:

```sh
bun run build
bun run validate-skills
```

`validate-skills` reports any packaging issues (missing metadata, stale command references, broken symlinks).

## Configure the MCP Server

After building this repository, MCP-compatible clients can use the local stdio server. Configure the client with an explicit project root:

```json
{
  "mcpServers": {
    "strict-spec-driven": {
      "command": "node",
      "args": [
        "/path/to/strict-spec-driven/dist/scripts/strict-spec-driven-mcp.js",
        "--project",
        "/path/to/your/project"
      ]
    }
  }
}
```

Build output must exist before launching the server:

```sh
bun run build
```

Example user requests for an MCP client:
- "Check whether this project has strict workflow state." Expected tool: `check_workflow_state`.
- "Read the proposal for change `my-change`." Expected resource: `strict://changes/my-change/proposal`.
- "Guide me through reviewing `my-change`." Expected prompt: `strict_review_change` with `{ "change": "my-change" }`.
- "Archive `my-change`." Expected tool: `archive_change` with `{ "change": "my-change", "confirm": true }`; it is release-class and mutates workflow state.
- "Cancel `my-change`." Expected tool: `cancel_change` with `{ "change": "my-change", "confirm": true }`; it is destructive and permanently deletes the active change.

The MCP server does not replace the CLI or skills. Read-only tools report diagnostics without changing files. Mutating tools such as `propose_change`, `mark_next_task_complete`, `roadmap_sync`, `harness_start`, `archive_change`, and `cancel_change` require an explicit `confirm: true`; without it the server refuses the call and does not run the underlying strict command. Hosts should surface these as write, lifecycle, release, or destructive actions before execution.

## Set Up a New Project

Navigate to the project directory where you want to use the strict workflow, then initialize the `.strict-spec-driven/` scaffold:

**Via Claude Code slash command:**
```
/strict-spec-init
```

**Or via CLI directly:**
```sh
node /path/to/strict-spec-driven/dist/strict-spec-cli.js init
```

This creates:
- `.strict-spec-driven/config.yaml` — project context and rules
- `.strict-spec-driven/specs/INDEX.yaml` — spec index
- `.strict-spec-driven/roadmap/INDEX.yaml` — roadmap index
- `.strict-spec-driven/changes/` — active and archived changes directory

If a `.spec-driven/` bootstrap directory already exists, `init` emits a warning and continues. Use `/strict-spec-migrate` to convert bootstrap artifacts to strict YAML.

## Your First Change Lifecycle

### 1. Propose a change

Choose a kebab-case name for the change, then scaffold its planning artifacts:

**Via Claude Code:**
```
/strict-spec-propose my-first-change
```

**Via CLI:**
```sh
node dist/strict-spec-cli.js propose my-first-change
```

This creates `.strict-spec-driven/changes/my-first-change/` with:
- `proposal.yaml` — what and why
- `design.yaml` — approach and key decisions
- `tasks.yaml` — implementation and testing tasks
- `questions.yaml` — open questions to be surfaced and resolved by
  `/strict-spec-auto` or `/strict-spec-apply` before implementation
- `specs/` — delta spec files for observable behavior changes

Edit these files to describe the change before moving to the apply step.

### 2. Implement the tasks

Work through each pending task in `tasks.yaml`. `/strict-spec-auto` is the
default next step for running the full lifecycle, and `/strict-spec-apply`
guides you through tasks one at a time when you want manual control:

```
/strict-spec-auto
```

Or:

```
/strict-spec-apply my-first-change
```

Each task invocation reads the next pending task, implements it, marks it complete, and verifies unchanged behaviors are intact.

You can also check task status from the CLI:
```sh
node dist/strict-spec-cli.js apply my-first-change
```

### 3. Verify the change

Once all tasks are complete, run verification:

```
/strict-spec-verify my-first-change
```

Verification checks:
- All tasks have `status: complete`
- No open questions remain in `questions.yaml`
- All planning artifacts pass strict YAML schema validation
- Delta specs in `specs/` pass delta-spec schema validation
- No two active changes target the same requirement ID with conflicting modifications

### 4. Archive the change

After verification passes, archive the change to merge its delta specs into the main strict specs:

```
/strict-spec-archive my-first-change
```

Archiving:
- Merges delta specs into `.strict-spec-driven/specs/` main spec files
- Moves the change directory to `.strict-spec-driven/changes/archive/YYYY-MM-DD-my-first-change/`
- Regenerates the strict spec index

### 5. Ship the change (optional)

To create a focused git commit for the archived change:

```
/strict-spec-ship my-first-change
```

The ship skill reads the archived change summary, constructs a commit message, and hands off `git push` to you for explicit confirmation.

## Automated End-to-End Lifecycle

For changes where the scope is already clear, `/strict-spec-auto` runs the full lifecycle — propose, apply, verify, review, archive — automatically:

```
/strict-spec-auto
```

The skill pauses only when open questions require user input or when an unrecoverable error is encountered.

## Ticket Intake (Optional)

When you have a raw requirement but are not yet sure it should become work, file a **ticket** first — a pure-requirement capture (problem, desired outcome, intent) with no solution:

```
/strict-ticket
```

Then triage it to decide whether it is already built:

```
/strict-ticket-dispatch
```

Triage judges implemented-vs-not from existing specs, code, and docs, then drives `ticket-resolve` to **close** an already-implemented ticket with evidence, **promote** a genuinely new requirement into a roadmap milestone skeleton (handing off to `/strict-roadmap-milestone` for scope), or **reject/defer** an unwanted one. The judgment lives in the skill; the CLI only performs the deterministic transition and records it on the ticket. This is the front of the pipeline:

```text
ticket -> triage -> roadmap milestone -> planned change -> strict change -> spec / tech / code
```

For the full ticket lifecycle — artifact structure, state machine, promotion mechanics, and copy-paste CLI examples — see the [Ticket Guide](TICKET_GUIDE.md).

## Harness (Optional)

If your project has local services, production observability, or structured investigations, declare them in one harness:

1. Run `/strict-spec-harness-init` to scaffold or refine `.strict-spec-driven/harness.yaml` from project context, or edit the file manually.
2. Run the dry plan and generate scripts:
   ```sh
   node dist/strict-spec-cli.js harness-plan --environment development
   node dist/strict-spec-cli.js harness-scripts generate
   ```
3. Use `scripts/harness-start`, `scripts/harness-status`, `scripts/harness-logs`, and `scripts/harness-stop` to operate declared components.

When a bug needs structured evidence, create a harness session:

```sh
node dist/strict-spec-cli.js harness-session create checkout-investigation
```

Use `/strict-spec-harness-session` to guide the investigation. The workflow records selected environment/components, lifecycle evidence, reproduction steps, evidence files, hypotheses, findings, human checkpoints, manual actions, replay commands, and verification state without storing secret values.

See [HARNESS.md](HARNESS.md) for the full reference.

## Migrating from Bootstrap State

If your project uses the legacy `.spec-driven/` Markdown workflow, migrate it to strict YAML:

```
/strict-spec-migrate
```

The migration converts supported legacy specs, changes, and roadmap artifacts to `.strict-spec-driven/` YAML format. Unsupported or ambiguous shapes are reported as manual follow-up items. The source `.spec-driven/` directory is not modified.
