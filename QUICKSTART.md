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

If a `.spec-driven/` bootstrap directory already exists, `init` emits a warning and continues. Run `strict-spec-cli migrate` to convert bootstrap artifacts to strict YAML.

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

This creates the change container `.strict-spec-driven/changes/my-first-change/` without writing any planning artifact. Artifact creation is lazy: each planning file is written by the first `generate` call that authors it, from named semantic arguments — no placeholder file is ever created, and a rejected first write leaves nothing behind. Author each artifact through the CLI:

```sh
node dist/strict-spec-cli.js generate my-first-change proposal --what "..." --why "..."
node dist/strict-spec-cli.js generate my-first-change design --approach "..."
node dist/strict-spec-cli.js generate my-first-change tasks --section Implementation --task first-task --text "..."
node dist/strict-spec-cli.js generate my-first-change questions --resolve requirement-problem --answer "..." --answered-by human
```

The artifacts this authors:
- `proposal.yaml` — what and why
- `design.yaml` — approach and key decisions
- `tasks.yaml` — implementation and testing tasks
- `questions.yaml` — seeded requirement questions plus open questions, surfaced and resolved by `/strict-spec-auto` or `/strict-spec-apply` before implementation
- `specs/` — delta spec files, only when the change has observable spec impact

CLI code owns YAML shape and filesystem mutation for these artifacts: AI workflows describe every change through `generate`'s named arguments and never write the YAML text themselves. Before authoring an unfamiliar artifact, run `strict-spec-cli yaml-authoring-protocol` for the full CLI-only authoring protocol, `<command> --help --json` for the owning command's contract, and `schema-show` / `sample-show` for the artifact's schema and a minimal valid example. An artifact's declared `schema_file` resolves beneath the shared schema cache root `~/.strict-spec-schemas/` (or `STRICT_SPEC_SCHEMA_CACHE_DIR`), and schema `example_ref` paths resolve beneath the cached examples tree — installed skills never assume a source-repository `templates` directory.

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

## Harness (Optional)

If your project has local services, production observability, or structured investigations, declare them in one harness:

1. Run `strict-spec-cli harness-infer --write` to draft `.strict-spec-driven/harness.yaml` from project context, then `strict-spec-cli harness-doctor` to resolve what it could not infer. The declaration is authored through `harness-infer` and `harness-edit` named arguments; a human may still maintain the file by hand outside the AI workflow. <!-- human-manual-edit -->
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

Record the investigation through `strict-spec-cli harness-session edit` named arguments. A session records selected environment/components, lifecycle evidence, reproduction steps, evidence files, hypotheses, findings, human checkpoints, manual actions, replay commands, and verification state without storing secret values.

See [HARNESS.md](HARNESS.md) for the full reference.

## Migrating from Bootstrap State

If your project uses the legacy `.spec-driven/` Markdown workflow, migrate it to strict YAML:

```sh
strict-spec-cli migrate
```

The migration converts supported legacy specs, changes, and roadmap artifacts to `.strict-spec-driven/` YAML format. Unsupported or ambiguous shapes are reported as manual follow-up items. The source `.spec-driven/` directory is not modified.

Every artifact the migration produces is CLI-owned from that point on: later creations, updates, named-entry removals, and deletions go through each artifact's owning strict CLI command, exactly as for a freshly initialized project. Legacy scaffolds that once shipped placeholder planning files are replaced by lazy authoring — a migrated or new change gains each planning artifact only when a `generate` call first writes it.
