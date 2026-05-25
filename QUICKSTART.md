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

## Declaring a Development Session (Optional)

If your project has a local dev server, you can declare it so agents know how to start it, wait for readiness, and open browser smoke targets:

1. Run `/strict-spec-dev-session-init` to scaffold or refine `.strict-spec-driven/dev-session.yaml` from project context, or edit the file manually if you prefer.
2. Run the dry plan to confirm the declaration:
   ```sh
   node dist/strict-spec-cli.js dev-session-plan
   ```
   The command validates the file and prints the resolved session plan without starting any processes.
3. Use `dev-session-start` / `dev-session-stop` to manage services directly from the CLI.

Lifecycle skills (`/strict-spec-apply`, `/strict-spec-auto`) automatically check `dev-session.yaml` when it exists. See [DEV_SESSIONS.md](DEV_SESSIONS.md) for the full reference.

## Running a Debug Session (Optional)

When a bug needs structured evidence, create a strict debug-session artifact:

```sh
node dist/strict-spec-cli.js debug-session-create checkout-cdp-target
```

Use `/strict-spec-debug-session` to guide Web API, frontend, Electron, or CDP-access debugging. The workflow records reproduction steps, evidence files, hypotheses, findings, human checkpoints, manual actions, dev-session lifecycle evidence, replay commands, and verification state without storing secret values.

Validate the artifact before handoff:

```sh
node dist/strict-spec-cli.js debug-session-validate checkout-cdp-target
```

See [DEBUG_SESSIONS.md](DEBUG_SESSIONS.md) for the full reference.

## Migrating from Bootstrap State

If your project uses the legacy `.spec-driven/` Markdown workflow, migrate it to strict YAML:

```
/strict-spec-migrate
```

The migration converts supported legacy specs, changes, and roadmap artifacts to `.strict-spec-driven/` YAML format. Unsupported or ambiguous shapes are reported as manual follow-up items. The source `.spec-driven/` directory is not modified.
