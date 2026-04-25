# Roadmap Guide: strict-spec-driven

This guide covers the contributor-facing roadmap workflow: milestone structure, planned change entries, roadmap skill commands, and how to add or complete a planned change.

## Roadmap Location

The strict roadmap lives under `.strict-spec-driven/roadmap/`:

```
.strict-spec-driven/roadmap/
  INDEX.yaml              # ordered milestone list
  milestones/
    01-first-milestone.yaml
    02-second-milestone.yaml
    ...
```

Both files are strict YAML artifacts validated by the `roadmap-status` and `roadmap-sync` CLI subcommands.

## Roadmap Index

`INDEX.yaml` lists milestones in canonical order. Each entry has four required fields:

```yaml
schema: strict-spec-driven/roadmap-index/v1
schema_version: 1
artifact_type: roadmap_index
schema_file: templates/strict-spec-driven/schemas/roadmap-index.yaml
milestones:
  - id: 01-first-milestone
    title: 01 First Milestone
    path: roadmap/milestones/01-first-milestone.yaml
    status: proposed   # proposed | active | blocked | complete
  - id: 02-second-milestone
    title: 02 Second Milestone
    path: roadmap/milestones/02-second-milestone.yaml
    status: planned
```

The index is regenerated automatically by `roadmap-sync`. Do not edit it directly; update the milestone files and run `roadmap-sync` to regenerate.

## Milestone Structure

Each milestone file is a strict YAML artifact. Required top-level fields:

```yaml
schema: strict-spec-driven/roadmap-milestone/v1
schema_version: 1
artifact_type: roadmap_milestone
schema_file: templates/strict-spec-driven/schemas/roadmap-milestone.yaml
milestone:
  id: 01-first-milestone
  title: 01 First Milestone
goal: >-
  One sentence describing the milestone's purpose.
scope:
  in:
    - What is in scope for this milestone.
  out:
    - What is explicitly out of scope.
done_criteria:
  - Verifiable outcome that marks this milestone complete.
planned_changes:
  - schema: strict-spec-driven/planned-change-entry/v1
    schema_version: 1
    artifact_type: planned_change_entry
    schema_file: templates/strict-spec-driven/schemas/planned-change-entry.yaml
    id: my-change-name
    status: planned    # planned | complete
    summary: >-
      One sentence describing what this change does.
    depends_on: []     # list of planned change IDs this depends on
status: proposed       # proposed | active | blocked | complete
dependencies:
  - Other milestone IDs this milestone depends on.
risks:
  - Identified risk.
notes:
  - Implementation notes or guardrails.
```

Optional sections (`dependencies`, `risks`, `notes`) may be omitted if not needed.

## Planned Change Entry Format

Each entry under `planned_changes` is a minimal strict YAML document embedded in the milestone. Required fields:

| Field | Type | Description |
|---|---|---|
| `schema` | string | Must be `strict-spec-driven/planned-change-entry/v1` |
| `schema_version` | integer | Must be `1` |
| `artifact_type` | string | Must be `planned_change_entry` |
| `schema_file` | string | Path to the planned-change-entry schema |
| `id` | string | Kebab-case change name; must be unique within the milestone |
| `status` | enum | `planned` or `complete` |
| `summary` | string | One sentence describing what the change does |
| `depends_on` | array | IDs of planned changes this entry depends on (may be empty) |

## Roadmap Skill Commands

Use these Claude Code slash commands to work with the roadmap:

### `/strict-roadmap-recommend`

Reads roadmap state and recommends the best next planned change to work on. Considers dependency order, milestone progress, and planning priority. After your confirmation, scaffolds the recommended change as a normal strict change under `.strict-spec-driven/changes/`.

Use this when starting a new work session and you want guidance on what to do next.

### `/strict-roadmap-propose`

Turns a specific planned change entry into a strict change scaffold. Use when you already know which planned change to work on and want to skip the recommendation step.

```
/strict-roadmap-propose my-change-name
```

### `/strict-roadmap-milestone`

Refines one milestone's goal, scope, done criteria, dependencies, risks, and notes. Use when a milestone's planning content needs updating without restructuring the entire roadmap.

```
/strict-roadmap-milestone 03-core-strict-workflow
```

### `/strict-roadmap-plan`

Creates or restructures the roadmap. Use when adding new milestones, reordering milestones, or doing a significant planning revision.

### `/strict-roadmap-sync`

Reconciles roadmap state against workflow state. Marks planned changes as `complete` when their corresponding strict change has been archived. Regenerates `INDEX.yaml` from the current milestone files.

Run this after archiving a change to keep the roadmap current:
```
/strict-roadmap-sync
```

You can also run it from the CLI:
```sh
node dist/strict-spec-cli.js roadmap-sync
```

## How to Add a Planned Change

1. Open the relevant milestone YAML file under `.strict-spec-driven/roadmap/milestones/`.
2. Append a new entry to the `planned_changes` sequence with all required fields.
3. Set `status: planned` and `depends_on: []` (or list any prerequisite change IDs).
4. Run `/strict-roadmap-sync` to validate and regenerate the roadmap index.

Example entry to append:
```yaml
  - schema: strict-spec-driven/planned-change-entry/v1
    schema_version: 1
    artifact_type: planned_change_entry
    schema_file: templates/strict-spec-driven/schemas/planned-change-entry.yaml
    id: my-new-change
    status: planned
    summary: >-
      Describe what this change accomplishes in one sentence.
    depends_on: []
```

## How to Complete a Planned Change Entry

Planned change status is updated automatically when you archive a strict change. The workflow is:

1. Propose and implement the change using `/strict-spec-propose`, `/strict-spec-apply`, `/strict-spec-verify`, `/strict-spec-archive` (or `/strict-spec-auto`).
2. After archiving, run `/strict-roadmap-sync` to mark the corresponding planned change entry as `complete`.
3. Run `node dist/strict-spec-cli.js roadmap-status` to confirm the milestone state is correct.

Do not manually set `status: complete` on planned change entries — let `roadmap-sync` derive it from the archive state.

## Checking Roadmap State

```sh
node dist/strict-spec-cli.js roadmap-status
```

Reports each milestone's declared and derived status, each planned change's state, and any mismatches between roadmap declarations and workflow state. Output is JSON.
