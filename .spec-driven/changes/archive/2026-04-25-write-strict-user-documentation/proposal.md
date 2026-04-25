# write-strict-user-documentation

## What

Replace the Chinese-only `README.md` with an English README that accurately
describes the strict workflow. Add `QUICKSTART.md` as an end-user install and
first-run guide. Add `ROADMAP_GUIDE.md` as a contributor-facing milestone and
roadmap workflow guide. All three documents use strict command names
(`strict-spec-*`, `strict-roadmap-*`, `strict-spec-driven` CLI) and YAML
artifact paths (`.strict-spec-driven/`) throughout.

## Why

The current `README.md` is written in Chinese and reflects early bootstrap
intent rather than the validated self-hosted strict workflow. Milestone 06 done
criteria require public documentation that accurately describes strict commands,
`.strict-spec-driven/` artifact locations, schema and example assets, migration
boundaries, and self-hosting status. All preceding milestones are complete;
this is the final remaining planned change.

## Scope

In scope:
- Replace `README.md` with English content covering project overview, directory
  structure (`.strict-spec-driven/` vs `.spec-driven/`), strict command surface
  (`strict-spec-driven` CLI subcommands, `strict-spec-*` and `strict-roadmap-*`
  skills), schema and example asset locations, migration boundaries, and
  self-hosting status.
- Add `QUICKSTART.md` covering prerequisites, `install.sh` usage, strict init
  (`strict-spec-driven init`), and the first propose-apply-archive change cycle.
- Add `ROADMAP_GUIDE.md` covering milestone structure, planned change entries,
  `strict-roadmap-*` skill commands, and the contributor roadmap workflow.

Out of scope:
- Chinese equivalents (English only, per user decision).
- Any changes to strict workflow code, skills, schemas, or tests.
- Publishing or release automation beyond local repo documentation.

## Unchanged Behavior

- All strict CLI commands (`strict-spec-driven init`, `propose`, `apply`,
  `verify`, `review`, `archive`, `ship`, `migrate`, `roadmap-status`,
  `roadmap-sync`, `list`, `modify`, `cancel`, `validate-skills`,
  `verify-spec-mappings`) remain unchanged.
- Skill packaging, validation, installation, and uninstallation behavior remain
  unchanged.
- `.strict-spec-driven/` workflow state structure remains unchanged.
