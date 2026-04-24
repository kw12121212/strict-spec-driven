# Design: convert-roadmap-and-project-state-to-yaml

## Approach

Introduce `src/converters/roadmap.ts` as a pure converter module — no file I/O, only parsing and transformation logic — so it can be tested in isolation. The module exports:

- `convertRoadmapIndex(markdown: string): ConversionResult<StrictRoadmapIndex>` — parses the `## Milestones` list from `INDEX.md` into a strict ordered index
- `convertRoadmapMilestone(markdown: string, filename: string): ConversionResult<StrictRoadmapMilestone>` — parses the full milestone Markdown structure (goal, scope, done criteria, dependencies, risks, notes, status, planned change entries) into the strict milestone YAML shape
- `convertSpecsIndex(markdown: string): ConversionResult<StrictSpecsIndex>` — parses bullet-list entries in `specs/INDEX.md` into strict index entries

`migrate.ts` replaces the `describeDeferredLegacyArtifact` branches for roadmap and specs-index paths with calls to these functions, writing successes as converted entries and mapping conversion failures to `manualFollowUp` items consistent with the existing deferral model.

Unsupported Markdown shapes (unexpected section structure, missing required fields, ambiguous status text) produce `ManualFollowUpItem` entries rather than silent drops or guessed values.

## Key Decisions

**Separate module over inline expansion** — `migrate.ts` is already 56 KB. Keeping converter logic in a dedicated module makes it testable in isolation without importing the full migration orchestration.

**Pure functions, no I/O** — Converters receive Markdown strings and return structured results. File discovery, reading, and writing stay in `migrate.ts` where they already live for every other converter.

**Deferred-to-manual-follow-up parity** — When a roadmap artifact cannot be converted deterministically, it becomes a `manualFollowUp` entry, consistent with how all other unsupported shapes are handled in the existing migration report model.

**Status mapping from Markdown text** — Milestone `## Status` sections contain `Declared: <value>` lines. The converter maps those to strict enum values (`proposed`, `active`, `blocked`, `complete`) and treats unrecognized values as conversion warnings rather than hard failures, since the roadmap status enum is narrow.

## Alternatives Considered

**Inline converters in migrate.ts** — Keeps the file count low but pushes an already-large file past a reasonable size, and makes isolated unit testing awkward. Rejected.

**Parsing roadmap Markdown with a full Markdown AST library** — More robust than line-by-line scanning but introduces a new runtime dependency. The existing converters in `migrate.ts` use line-by-line parsing with explicit structure detection; staying consistent avoids dependency churn and keeps parse behavior auditable.
