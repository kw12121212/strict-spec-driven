# Todo App Fixture

This directory is a committed baseline fixture for project-level CLI, roadmap,
and migration regression scenarios.

It is intentionally compact:
- a small TypeScript todo domain under `src/`
- a minimal test file under `test/`
- a `.spec-driven/` workspace with one main spec, one roadmap milestone, and one
  active change

Later milestone-09 work can copy this fixture into temporary workspaces and run
scenario-specific commands there without assembling repository state from
scratch.
