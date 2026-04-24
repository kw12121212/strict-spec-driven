# Tasks: define-yaml-roadmap-schema

## Implementation

- [x] Add delta spec requirements for roadmap index ordering, milestone planning fields, and planned change dependency fields
- [x] Align roadmap schema, example, registry, and scaffold assets under `templates/strict-spec-driven/` with the finalized roadmap contract
- [x] Extend repository validation coverage so roadmap schema and example assets are checked from both source templates and bundled `dist/` output

## Testing

- [x] Run `bun run build` — build validation task for bundled roadmap schema and scaffold assets
- [x] Run `bun test/run.ts` — unit tests covering roadmap schema, example, registry, and scaffold behavior

## Verification

- [x] Verify implementation matches the roadmap-schema proposal scope and does not expand into roadmap command or migration behavior
