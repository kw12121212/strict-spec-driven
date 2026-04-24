---
mapping:
  implementation:
    - install.sh
    - package.json
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: strict-skill-installation-script-contract
The system MUST provide repository install and uninstall surfaces that register
strict skill packages from the source repository for both shared/global and
project-local use without breaking packaged script and template link
assumptions.

#### Scenario: install surfaces support shared and project-local registration
- GIVEN a user wants to register strict skills from the source repository
- WHEN the repository install surface is invoked for the default or
  project-local scope
- THEN strict skill packages are registered for the selected scope
- AND the install surface uses strict workflow naming rather than legacy default
  aliases

#### Scenario: uninstall surfaces remove the selected strict registration
- GIVEN strict skills were previously registered from the source repository
- WHEN the repository uninstall surface is invoked for the same selected scope
- THEN the strict skill registration is removed for that scope
- AND unrelated legacy registrations are not silently targeted as strict aliases

## MODIFIED Requirements

### Requirement: installer-facing-strict-names
Previously: The system MUST require installer-facing package, skill, or command names for strict workflows to identify the strict workflow namespace explicitly and avoid silent legacy aliases outside migration-defined compatibility behavior.
The system MUST require installer-facing package, skill, command, and install or uninstall entrypoint names for strict workflows to identify the strict workflow namespace explicitly and avoid silent legacy aliases outside migration-defined compatibility behavior.

#### Scenario: installer names preserve the strict namespace
- GIVEN strict workflow installation metadata or install entrypoints are
  reviewed
- WHEN package, skill, command, or install and uninstall names are exposed for
  installation
- THEN the names identify the strict workflow namespace
- AND legacy `spec-driven` or `spec-driven-*` names are not treated as strict
  workflow aliases unless a migration compatibility contract defines that
  behavior
