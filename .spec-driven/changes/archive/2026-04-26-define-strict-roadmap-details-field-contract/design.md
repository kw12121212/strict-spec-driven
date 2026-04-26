# Design: define-strict-roadmap-details-field-contract

## Approach

Add `details` as an optional string field to the roadmap milestone schema alongside the existing `notes` field. The field accepts freeform long-form text, typically written as a YAML block scalar. This follows the existing pattern for optional fields in the schema dialect.

### Files to modify

1. `templates/strict-spec-driven/schemas/roadmap-milestone.yaml` — add `details` as an optional string field after `notes`
2. `src/roadmap/model.ts` — add `details?: string` to `RoadmapMilestoneArtifact`
3. `src/roadmap/validate.ts` — add optional string validation for `details`
4. `templates/strict-spec-driven/examples/roadmap-milestone.yaml` — add a `details` block demonstrating usage
5. `templates/strict-spec-driven/examples/roadmap-milestone.planning.yaml` — add `details` to the planning coverage example

## Key Decisions

- **Optional field, not required**: Existing milestones without `details` must remain valid. This avoids a schema version bump and backward-compatibility noise.
- **String, not string array**: Unlike `notes` which is a list of short remarks, `details` is a single block of prose. A YAML block scalar (`details: |`) is the natural representation.
- **Milestone-level only**: `details` belongs on the milestone, not on individual planned change entries. The planned change summary and the normal change proposal workflow handle per-change context.
- **Schema version stays v1**: Adding an optional field is a compatible clarification under the existing versioning rules.

## Alternatives Considered

- **Structured `details` with subfields** — ruled out because the milestone explicitly says "Turning details into a structured schema with fixed subfields" is out of scope. Freeform text is sufficient.
- **String array like `notes`** — ruled out because long-form guidance is typically one coherent block, not a list of fragments. A single string with YAML block scalar syntax is cleaner.
- **Adding `details` to planned change entries** — ruled out because the milestone scope says `details` is for milestone-level guidance, and per-change detail belongs in the change proposal itself.
