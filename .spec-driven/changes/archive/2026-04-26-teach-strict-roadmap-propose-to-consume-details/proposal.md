# teach-strict-roadmap-propose-to-consume-details

## What

Update the `strict-roadmap-propose` and `strict-roadmap-recommend` skill prompts so that when a strict roadmap proposal is scaffolded, the agent reads the owning milestone's `details` field and uses it as targeted planning guidance when populating the change artifacts.

## Why

The previous two changes in this milestone added the `details` field to the strict roadmap milestone schema, model type, and sync pipeline. The field is fully loaded, validated, and preserved through roadmap CLI operations. However, neither the proposal skill nor the recommend skill currently reads or consumes `details`. The data exists in the milestone artifact but has no effect on the proposal workflow that is supposed to benefit from it.

Without this change, `details` content sits unused in milestone YAML files while agents scaffolding proposals have no instruction to consider it as input.

## Scope

- Update `skills/strict-roadmap-propose/SKILL.md` to add a step that reads the owning milestone's `details` field after scaffolding and uses it as context when filling change artifacts
- Update `skills/strict-roadmap-recommend/SKILL.md` to read milestone `details` as part of the recommendation and proposal context
- Update the spec requirement `strict-roadmap-proposal-handoff-contract` to describe how `details` informs the proposal workflow
- Add unit tests proving that a milestone with `details` produces different proposal guidance than one without

## Unchanged Behavior

- The CLI scaffold command (`strict-spec-driven propose`) remains generic and does not read milestone data
- Milestones without `details` continue to produce valid proposals — the field is optional
- The roadmap remains the canonical home of milestone-level planning metadata
- Change artifacts describe scope for exactly one planned change, not the full milestone plan
- `roadmap-status` output does not carry `details` (it tracks derived state, not artifact content)
