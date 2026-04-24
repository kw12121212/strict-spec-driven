---
mapping:
  implementation:
    - install.sh
    - package.json
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-installation-and-packaging-smoke-coverage
The system MUST include automated checks that exercise strict skill
installation and uninstallation surfaces together with packaged skill layout
expectations.

#### Scenario: install smoke checks confirm packaged strict skills remain usable
- GIVEN strict skill packages expose the expected bundled `scripts` and
  `templates` symlinks
- WHEN repository automated install smoke checks are executed
- THEN install registration succeeds for the selected scope
- AND the packaged strict skills keep resolving bundled scripts and templates
  through the registered source-repository layout

#### Scenario: uninstall smoke checks remove strict registration cleanly
- GIVEN strict skills were registered through the repository install surface
- WHEN repository automated uninstall smoke checks are executed
- THEN the registered strict skills are removed for the selected scope
- AND the smoke checks do not require manual cleanup of copied package files

#### Scenario: install smoke checks report deterministic diagnostics for invalid package state
- GIVEN a strict skill package has broken bundled symlinks or stale legacy
  install naming assumptions
- WHEN repository automated install or packaging smoke checks are executed
- THEN the checks fail
- AND diagnostics remain machine-readable and path-specific
