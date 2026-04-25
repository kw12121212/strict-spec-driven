# Design: write-strict-user-documentation

## Approach

Write three Markdown documentation files at the repository root. All three use
strict command names and `.strict-spec-driven/` artifact paths as the default;
`.spec-driven/` and legacy names appear only in migration or bootstrap context.

**README.md** replaces the Chinese bootstrap README. Sections: project overview
and goal, relationship to auto-spec-driven, directory structure
(`.strict-spec-driven/` vs `.spec-driven/`), strict command surface (CLI
entrypoint + subcommands, skill families), schema and example asset locations
under `templates/strict-spec-driven/`, migration boundaries, self-hosting
status, and development conventions.

**QUICKSTART.md** targets new users. Sections: prerequisites (Bun, Node.js),
installation via `install.sh` (global and project-local), verifying the install,
`strict-spec-driven init` to scaffold a project, and a first change lifecycle
walkthrough (`strict-spec-propose` → edit artifacts → `strict-spec-apply` →
`strict-spec-verify` → `strict-spec-archive`).

**ROADMAP_GUIDE.md** targets contributors. Sections: milestone structure in
`.strict-spec-driven/roadmap/`, planned change entry format, `strict-roadmap-*`
skill commands (`strict-roadmap-recommend`, `strict-roadmap-propose`,
`strict-roadmap-milestone`, `strict-roadmap-plan`, `strict-roadmap-sync`),
and how to add or complete a planned change entry.

## Key Decisions

- **English only.** Chinese equivalents were considered and explicitly declined.
- **Docs live at repo root.** No `docs/` subdirectory — keeps docs discoverable
  without additional navigation.
- **ROADMAP_GUIDE is contributor-facing.** It covers how to work with the
  roadmap, not how to use strict workflow commands day-to-day (that is
  QUICKSTART's job).
- **No new spec requirements.** The `self-hosted-repository-guidance-prefers-strict-surfaces`
  requirement in `contracts/yaml-artifacts.md` already captures the observable
  behavior these docs must satisfy.

## Alternatives Considered

- **Chinese + English equivalents.** Would keep both audiences covered but was
  explicitly declined by the project owner.
- **Single combined doc.** A long single file would be harder to link to
  specific audiences; three targeted files are preferred.
- **docs/ subdirectory.** Adds navigation overhead for a three-file set; root
  placement is simpler and consistent with README.md convention.
