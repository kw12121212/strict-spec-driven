# Tasks: port-maintenance-workflow-to-yaml

## Implementation
- [x] Extend `.strict-spec-driven/config.yaml` scaffold template with an optional `maintenance` section listing configured checks (schema: `checks` array with `type` field, first supported value `roadmap-sync-check`)
- [x] Add `src/maintenance.ts` implementing `runMaintenance`: reads config maintenance section, runs configured checks, collects findings, generates a maintenance change via propose scaffold when findings exist, emits deterministic JSON output
- [x] Implement `roadmap-sync-check` check type inside `src/maintenance.ts` by calling `syncRoadmap()` and mapping returned mismatches to maintenance task entries
- [x] Register `commands["maintenance"]` in `src/strict-spec-cli.ts` wired to `runMaintenance`
- [x] Update `skills/strict-spec-maintenance/SKILL.md` to reference `node {{SKILL_DIR}}/scripts/strict-spec-driven.js maintenance` as the primary command with a complete `## This Skill's Commands` block

## Testing

- [x] Run `bun run build` — validate TypeScript compiles without errors after adding maintenance module
- [x] Run `bun test/run.ts` — unit tests covering: config parsing with maintenance section, `roadmap-sync-check` produces findings when mismatches exist, `roadmap-sync-check` produces no findings when roadmap is aligned, maintenance change directory is created when findings exist, maintenance JSON output fields (`valid`, `checksRun`, `findingsCount`, `generatedChange`) are present and correct, missing or empty maintenance config section exits cleanly with zero findings

## Verification
- [x] Verify `strict-spec-driven maintenance` subcommand is registered and routes correctly
- [x] Verify `strict-spec-maintenance/SKILL.md` references the `maintenance` subcommand explicitly
- [x] Verify implementation matches proposal scope: no additional check types, no auto-archive, no changes to existing subcommands
