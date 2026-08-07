# Roadmap Quick Start

English | [中文](ROADMAP_QUICKSTART.zh.md)

A hands-on guide to go from zero to a working roadmap using the split-file, conflict-resistant team workflow.

## What the Roadmap Gives You

The strict roadmap lets you plan work as milestones plus planned changes, then hand each planned change off into the normal strict change lifecycle. The recommended collaboration model keeps milestone files stable and puts everyday work items in standalone planned-change files.

## Step 1: Initialize

If you have not already initialized strict workflow state in the project:

```text
/strict-spec-init
```

This creates `.strict-spec-driven/roadmap/` with an empty `INDEX.yaml`.

## Step 2: Plan the Milestone

Create or refine your milestone metadata:

```text
/strict-roadmap-plan
```

Each milestone file lives under `.strict-spec-driven/roadmap/milestones/` and looks like this:

```yaml
schema: strict-spec-driven/roadmap-milestone/v2
schema_version: 2
artifact_type: roadmap_milestone
schema_file: ../../templates/strict-spec-driven/schemas/roadmap-milestone.yaml
milestone:
  0001-user-auth:
    title: User Authentication
goal: Add authentication so users can log in securely.
scope:
  in:
    - Login and logout flows.
    - Session management.
  out:
    - OAuth provider integration.
done_criteria:
  - Users can log in and log out.
  - Sessions expire after 24 hours.
planned_changes: {}
dependencies: []
risks: []
status: proposed
notes: []
```

Use the milestone file for durable roadmap context. Do not use it as the default place for every contributor to append new work items.

## Step 3: Add a Planned Change File

Create a standalone planned-change artifact through the CLI — it owns the file's YAML shape and canonical filename under `.strict-spec-driven/roadmap/planned-changes/`. Read `strict-spec-cli roadmap-generate --help --json` for the full argument contract, and `strict-spec-cli yaml-authoring-protocol` for the general authoring protocol:

```sh
strict-spec-cli roadmap-generate planned-change --milestone 0001-user-auth --id add-session-model \
  --summary "Add session data model and storage." --details "..."
```

The resulting file looks like this:

```yaml
schema: strict-spec-driven/planned-change/v1
schema_version: 1
artifact_type: planned_change
schema_file: ../../templates/strict-spec-driven/schemas/planned-change.yaml
planned_change:
  id: add-session-model
  milestone: 0001-user-auth
status: planned
summary: Add session data model and storage.
details: >-
  Keep this work item in its own file so one contributor can update it without
  rewriting the milestone file.
depends_on: []
team:
  owner: alice
  reviewers:
    - bob
  blocked:
    status: false
```

Key points:

- milestone IDs use a 4-digit numeric prefix
- planned-change IDs use kebab-case
- each planned change should map to roughly one strict change
- `team` metadata is optional and advisory only

Keep milestone `planned_changes` empty in normal roadmap work. Non-empty inline entries are treated as legacy data that must be materialized before `roadmap-status` and ordinary `roadmap-sync` will succeed.

## Step 4: Check and Sync Roadmap State

Inspect the roadmap at any time:

```sh
strict-spec-cli roadmap-overview
```

Use `roadmap-overview` for a human-readable milestone table with grouped planned-change detail, or `roadmap-status` for the JSON validation payload:

```sh
strict-spec-cli roadmap-status
```

After changing milestone or planned-change artifacts through `roadmap-generate`, sync the roadmap:

```text
/strict-roadmap-sync
```

If you merge branches or archive roadmap-backed work, run `roadmap-sync` again so derived status is reconciled from workflow state.

## Step 5: Pick the Next Planned Change

Let the workflow recommend the best next change based on dependencies and current roadmap state:

```text
/strict-roadmap-recommend
```

The command scaffolds a normal strict change under `.strict-spec-driven/changes/`.

## Step 6: Implement as a Normal Strict Change

Once scaffolded, the planned change becomes a regular strict change:

```text
/strict-spec-auto
```

Or use the manual flow:

```text
/strict-spec-apply add-session-model
/strict-spec-verify add-session-model
/strict-spec-archive add-session-model
```

## Step 7: Sync the Roadmap Again

After archive, refresh the roadmap:

```text
/strict-roadmap-sync
```

This updates derived planned-change and milestone state. Do not hand-edit roadmap completion status after implementation.

## Typical Workflow Loop

```text
/strict-roadmap-recommend          ← what should I do next?
  ↓
/strict-spec-auto                  ← implement end to end
  ↓
/strict-roadmap-sync               ← reconcile roadmap after archive or merge
  ↓
repeat until the milestone is complete
```

## Legacy Inline Note

If you still have inline milestone `planned_changes`, ordinary `roadmap-status` and `roadmap-sync` will stop with an error and tell you to materialize them. Convert them with:

```sh
strict-spec-cli roadmap-sync --materialize-planned-changes
```

## Commands Reference

| Command | Purpose |
|---|---|
| `/strict-roadmap-plan` | Create or restructure the roadmap |
| `/strict-roadmap-review` | Review one incomplete milestone and apply fixes |
| `/strict-spec-propose-from-roadmap` | Propose the next roadmap-recommended change without implementing |
| `/strict-roadmap-recommend` | Get a recommendation for the next change |
| `/strict-roadmap-sync` | Reconcile roadmap state with workflow |

For the full reference, including field definitions and legacy materialization guidance, see [ROADMAP_GUIDE.md](ROADMAP_GUIDE.md).
