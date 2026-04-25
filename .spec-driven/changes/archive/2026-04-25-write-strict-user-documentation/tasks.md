# Tasks: write-strict-user-documentation

## Implementation

- [x] Replace `README.md` with English content covering project overview, relationship to auto-spec-driven, directory structure (`.strict-spec-driven/` as active state, `.spec-driven/` as bootstrap/legacy), strict command surface (`strict-spec-driven` CLI subcommands, `strict-spec-*` and `strict-roadmap-*` skill families), schema and example asset locations under `templates/strict-spec-driven/`, migration boundaries, self-hosting status, and development conventions
- [x] Add `QUICKSTART.md` covering prerequisites (Bun, Node.js), installation via `install.sh` (global and project-local options), verifying the install, `strict-spec-driven init` to scaffold a new project, and a first change lifecycle walkthrough (propose → apply → verify → archive)
- [x] Add `ROADMAP_GUIDE.md` covering milestone YAML structure under `.strict-spec-driven/roadmap/`, planned change entry format, `strict-roadmap-*` skill commands and their purposes, and how to add or complete a planned change entry as a contributor

## Testing

- [x] Run `bun run build` — validate TypeScript compiles without errors after documentation changes
- [x] Run `bun test/run.ts` — run unit tests to confirm no regressions

## Verification

- [x] Verify implementation matches proposal scope
