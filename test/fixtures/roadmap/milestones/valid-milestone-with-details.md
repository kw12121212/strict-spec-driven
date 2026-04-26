# 02 Milestone With Details

## Goal
Extend the roadmap milestone format with long-form planning guidance.

## In Scope
- Add a dedicated details field to the milestone schema.

## Out of Scope
- Structured sub-fields within details.

## Done Criteria
- Details field is preserved through conversion.

## Planned Changes
- `add-details-field` - Declared: complete - add the details field to milestone schema.

## Dependencies
- None.

## Risks
- Freeform details could blur planning boundaries.

## Status
- Declared: proposed

## Notes
- This is a test milestone for details preservation.

## Details
This is long-form planning guidance that provides technical context for milestone implementation. It should be preserved as a freeform string field during conversion from legacy Markdown to strict YAML. The details field is optional and distinct from short notes and concrete planned changes.
