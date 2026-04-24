# Tasks: port-strict-roadmap-workflow

## Implementation

- [x] Add strict roadmap loading, validation, status derivation, and `roadmap-status` command routing for `.strict-spec-driven/roadmap/`
- [x] Implement strict roadmap sync, index regeneration, and archive reconciliation so milestone and planned change state stays aligned with active and archived strict changes
- [x] Replace placeholder `strict-roadmap-*` skill prompts with YAML-aware roadmap guidance and add regression coverage for roadmap skill content and proposal handoff

## Testing

- [x] Run `bun run validate-skills` — validation task for strict roadmap skill command references and content coverage
- [x] Run `bun test/run.ts` — unit tests covering roadmap status, sync/reconciliation, and roadmap proposal handoff behavior

## Verification

- [x] Verify implementation matches the milestone-04 roadmap workflow scope without absorbing planning-skill, migration, or operations work
