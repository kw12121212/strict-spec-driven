# Design: wire-strict-roadmap-details-through-roadmap-cli

## Approach

The core fix is a one-line addition in `sync.ts` to propagate the optional `details` field through the canonical artifact builder. The converter type gets a matching optional field for future-proofing. Unit tests confirm the field survives sync when present and does not appear when absent.

### Files to modify

1. `src/roadmap/sync.ts` — add `details` propagation in `buildCanonicalMilestoneArtifact()`
2. `src/converters/roadmap.ts` — add `details?: string` to `StrictRoadmapMilestoneArtifact`
3. Test file — add sync round-trip tests for `details` presence and absence

## Key Decisions

- **Copy, don't transform**: `details` passes through as-is. The sync layer is a canonicalization step, not a content transformation step.
- **Omit when undefined**: When the source milestone has no `details`, the canonical output also omits it (no empty string fallback). This keeps the artifact minimal.
- **Converter type alignment only**: The converter's `StrictRoadmapMilestoneArtifact` gets the field so its type stays aligned with the canonical model, but `convertRoadmapMilestone()` does not attempt to parse a `## Details` section from legacy Markdown. That work is scoped to the later `preserve-strict-roadmap-details-during-conversion` change.

## Alternatives Considered

- **Always include `details` key with empty string** — ruled out because the schema defines `details` as optional; emitting an empty string would be noisy and semantically different from absent.
- **Parse legacy `## Details` from Markdown now** — ruled out because the milestone plan assigns that to `preserve-strict-roadmap-details-during-conversion`. This change focuses strictly on the pipeline wiring.
