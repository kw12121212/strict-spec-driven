# port-strict-skill-packaging-and-validation

## What

Port strict skill packaging and validation surfaces so strict skill families are
usable and enforceable without legacy naming drift.

This change will:
- add strict skill package structure for both `strict-spec-*` and
  `strict-roadmap-*` families
- update installer-facing and marketplace metadata references to strict names
- enforce `scripts -> ../../dist/scripts` and
  `templates -> ../../dist/templates` assumptions for packaged skills
- add validation coverage for required skill frontmatter metadata, command
  references, stale legacy names, bundled script assumptions, and broken
  symlink targets

## Why

Milestone 04 is currently blocked on a stable strict skill packaging baseline.
Without package-level validation and strict namespace enforcement, later skill
content updates can silently mix legacy and strict names or ship broken
packaging assumptions.

Landing packaging and validation first reduces downstream rework for:
- `update-core-spec-skills-for-yaml`
- `update-planning-and-spec-content-skills-for-yaml`
- `port-strict-roadmap-workflow`

## Scope

In scope:
- strict skill package layout and metadata updates for strict spec and roadmap
  families
- installer-facing naming updates that remove legacy install names where strict
  names are required
- validation rules for frontmatter, command references, stale naming, and
  symlink assumptions
- tests or smoke checks covering strict skill packaging validation outcomes

Out of scope:
- rewriting the content behavior of every strict skill prompt
- strict roadmap command implementation details owned by later roadmap workflow
  changes
- end-user install or uninstall command UX polish owned by milestone 06

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- core strict CLI lifecycle command semantics from milestone 03
- YAML artifact schemas and examples already defined under
  `templates/strict-spec-driven/`
- migration and self-hosting behavior planned for milestone 05
