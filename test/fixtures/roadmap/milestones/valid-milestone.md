# 01 First Milestone

## Goal
Establish the foundation for all subsequent milestones by defining core contracts.

## In Scope
- Define schema contracts for all artifact families.
- Create concrete schema files under `templates/`.

## Out of Scope
- Implementing the full CLI.
- Converting existing projects.

## Done Criteria
- Schema contracts are documented with required fields and enum values.
- Concrete schema files exist for every required artifact family.

## Planned Changes
- `define-schemas` - Declared: complete - define YAML schemas for all supported artifact types.
- `implement-cli` - Declared: planned - implement the CLI entrypoint and subcommand routing.

## Dependencies
- Reference project must remain available for comparison.

## Risks
- Overly flexible schemas could recreate Markdown-era ambiguity.

## Status
- Declared: complete

## Notes
- This milestone must finish before large implementation work begins.
- Schema changes require backward compatibility review.
