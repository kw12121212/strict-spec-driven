# 10 Strict Roadmap Details Guidance

## Goal
Extend the future `.strict-spec-driven` roadmap milestone format with a dedicated `details` field for long-form technical and design guidance so roadmap-backed proposal work can consume milestone-local planning context without overloading `notes` or `planned_changes`.

## In Scope
- Add a dedicated `details` field to the strict roadmap milestone schema, templates, examples, and schema registry entries.
- Define and document the distinction between `details`, `notes`, and `planned_changes` so only concrete approved work stays in the planned change list.
- Update strict roadmap loading, validation, status derivation, sync rewriting, and artifact emission so `details` is preserved as canonical roadmap state.
- Update strict roadmap proposal guidance so `strict-roadmap-propose` reads milestone `details` as targeted context when scaffolding a strict change.
- Add or update conversion, fixture, and regression coverage needed to prove `details` survives strict roadmap workflows and remains optional or explicitly initialized for pre-existing milestone artifacts.

## Out of Scope
- Changing the current bootstrap `.spec-driven/roadmap/` Markdown milestone format beyond using this milestone to plan the strict-side work.
- Turning `details` into a structured schema with fixed subfields, required headings, or executable checklist semantics.
- Allowing multiline implementation plans to live under `planned_changes` instead of keeping those entries short and canonical.
- Auto-accepting roadmap `details` as final proposal content without normal user confirmation and proposal review.

## Done Criteria
- The strict roadmap milestone contract defines `details` as a dedicated long-form field that is clearly distinct from short `notes` and from concrete `planned_changes`.
- Strict roadmap templates, examples, and schema or registry assets expose `details` in the canonical milestone shape.
- Strict roadmap commands and helpers load, validate, preserve, and rewrite `details` without breaking status derivation or existing roadmap behavior.
- The strict roadmap proposal workflow reads milestone `details` as proposal guidance while keeping the planned change ID and normal strict change artifacts as the source of executable work.
- Automated coverage proves strict roadmap fixtures, sync behavior, proposal handoff, and any needed conversion paths preserve `details` predictably.

## Planned Changes
- `define-strict-roadmap-details-field-contract` - Declared: complete - add the strict roadmap milestone schema, example, template, and registry definitions for a dedicated freeform `details` field intended for long-form planning guidance.
- `wire-strict-roadmap-details-through-roadmap-cli` - Declared: planned - update strict roadmap parsing, validation, status, and sync behavior so milestone `details` is preserved as canonical roadmap state.
- `teach-strict-roadmap-propose-to-consume-details` - Declared: planned - update strict roadmap proposal handoff so milestone `details` informs proposal scaffolding without duplicating whole milestone plans into strict change artifacts.
- `preserve-strict-roadmap-details-during-conversion` - Declared: planned - define how converters or migration helpers initialize or preserve `details` when older strict or imported roadmap artifacts do not already carry the field.
- `cover-strict-roadmap-details-with-regression` - Declared: planned - add fixture and end-to-end regression coverage proving `details` survives strict roadmap validation, sync, proposal handoff, and related workflows.

## Dependencies
- The strict roadmap behavior delivered in milestones `04-strict-workflow-skills-and-roadmap` and `05-migration-and-self-hosting` remains the baseline this feature must extend rather than replace.
- The shared copied-project regression harness from milestone `09-repeatable-real-project-regression-tests` should be available before this milestone is declared complete so `details` support is proven in repeatable end-to-end flows.
- Existing roadmap proposal identity rules must remain unchanged: planned change IDs stay the change names even when milestone `details` provides additional context.

## Risks
- Freeform `details` content could blur the boundary between roadmap context and executable work if the workflow does not keep `planned_changes` as the only milestone work list.
- Backward compatibility can become noisy if existing strict roadmap artifacts without `details` are not handled consistently during rollout.
- Proposal scaffolding could accidentally copy too much milestone prose into strict change artifacts instead of extracting only the guidance relevant to the selected planned change.

## Status
- Declared: proposed

## Notes
- Current strict roadmap evidence: the schema, examples, templates, `src/roadmap.ts`, and `src/converters/roadmap.ts` model milestone context with `notes` but do not expose a separate long-form `details` field.
- Current skill evidence: `skills/strict-roadmap-plan/SKILL.md` and `skills/strict-roadmap-propose/SKILL.md` describe roadmap planning and proposal handoff without a dedicated place for long technical or design guidance.
- The intended strict representation is a freeform long-text field suitable for YAML block-scalar content so milestone authors can capture targeted design notes without inventing a rigid internal schema.

