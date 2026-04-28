# Roadmap Quick Start

English | [中文](ROADMAP_QUICKSTART.zh.md)

A hands-on guide to go from zero to a working roadmap in under five minutes.

## What the Roadmap Gives You

The strict roadmap lets you plan work as **milestones** containing **planned changes**, then hand off each planned change into the normal strict change lifecycle. The CLI keeps declared and derived status in sync so you always know where things stand.

## Step 1: Initialize

If you haven't already, initialize the strict workflow in your project:

```
/strict-spec-init
```

This creates `.strict-spec-driven/roadmap/` with an empty `INDEX.yaml`.

## Step 2: Plan Your Roadmap

Create the roadmap structure — milestones with goals, scope, and planned changes:

```
/strict-roadmap-plan
```

The skill will walk you through defining milestones. You can also edit the YAML files directly.

Each milestone file lives under `.strict-spec-driven/roadmap/milestones/` and looks like this:

```yaml
schema: strict-spec-driven/roadmap-milestone/v2
schema_version: 2
artifact_type: roadmap_milestone
schema_file: ../schemas/roadmap-milestone.yaml
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
planned_changes:
  add-session-model:
    status: planned
    summary: Add session data model and storage.
    depends_on: []
  add-login-endpoint:
    status: planned
    summary: Add login API endpoint.
    depends_on:
      - add-session-model
dependencies: []
risks: []
status: proposed
notes: []
```

Key points:
- Milestone IDs use a 4-digit numeric prefix (`0001-`, `0002-`, ...)
- Planned changes use kebab-case IDs and form a dependency DAG within the milestone
- Each planned change should map to roughly one strict change

## Step 3: Check Roadmap State

At any time, inspect the roadmap:

```sh
node dist/strict-spec-cli.js roadmap-status
```

Or sync the index after editing milestone files:

```
/strict-roadmap-sync
```

## Step 4: Pick What to Work On Next

Let the workflow recommend the best next planned change based on dependencies and milestone progress:

```
/strict-roadmap-recommend
```

The skill analyzes your roadmap, picks the best candidate, and after your confirmation scaffolds it as a normal strict change under `.strict-spec-driven/changes/`.

If you already know which planned change to work on:

```
/strict-roadmap-propose add-session-model
```

## Step 5: Implement as a Normal Strict Change

Once scaffolded, the planned change becomes a regular strict change. Run the standard lifecycle:

```
/strict-spec-apply add-session-model
/strict-spec-verify add-session-model
/strict-spec-archive add-session-model
```

Or use the automated flow:

```
/strict-spec-auto
```

## Step 6: Sync the Roadmap

After archiving a change, sync the roadmap to update planned change status:

```
/strict-roadmap-sync
```

This marks the corresponding planned change as `complete` and updates the milestone's derived status.

## Typical Workflow Loop

```
/strict-roadmap-recommend          ← what should I do next?
  ↓ (confirms)
/strict-spec-auto                  ← implement end to end
  ↓
/strict-roadmap-sync               ← update roadmap state
  ↓
repeat until milestone is complete
```

## Commands Reference

| Command | Purpose |
|---|---|
| `/strict-roadmap-plan` | Create or restructure the roadmap |
| `/strict-roadmap-milestone` | Refine one milestone's details |
| `/strict-roadmap-recommend` | Get a recommendation for the next change |
| `/strict-roadmap-propose` | Directly scaffold a specific planned change |
| `/strict-roadmap-sync` | Reconcile roadmap state with workflow |

For the full reference including YAML schemas and field definitions, see [ROADMAP_GUIDE.md](ROADMAP_GUIDE.md).
