# Tasks: port-ship-workflow-to-strict

## Implementation

- [x] Add `ship` subcommand to `src/strict-spec-cli.ts`: resolve the named archived change directory under `.strict-spec-driven/changes/archive/` (with date-prefix expansion), read `proposal.yaml` for the summary, snapshot roadmap state, and emit structured JSON with `changeName`, `archivePath`, `proposalSummary`, and `roadmapSnapshot`
- [x] Add automated skill content check for `strict-spec-ship` in `src/skills.ts` following the existing skill validation pattern — verify the command block references `strict-spec-driven.js ship` and the body includes `.strict-spec-driven/` workflow guidance
- [x] Write `skills/strict-spec-ship/SKILL.md` with full workflow instructions: run `ship <name>` to obtain verification JSON, construct focused commit message from `changeName` and `proposalSummary`, run `git add` for change implementation files, run `git commit`, display `git push` for operator review

## Testing

- [x] Run `bun run build` — build and typecheck
- [x] Run `bun test/run.ts` — unit tests

## Verification

- [x] Verify implementation matches proposal scope
