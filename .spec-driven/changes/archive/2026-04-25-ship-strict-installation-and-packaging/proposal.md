# ship-strict-installation-and-packaging

## What

Ship the strict workflow's end-user installation and packaging surfaces so this
repository can install and uninstall its skill packages cleanly from the source
repo in both shared/global and project-local modes.

This change will:
- add explicit strict install and uninstall entrypoints on top of the existing
  repository installer
- harden installer-facing naming so strict install surfaces do not silently fall
  back to legacy aliases
- verify that packaged strict skills keep working `scripts` and `templates`
  symlink assumptions when installed in place from the source repository
- add smoke coverage for install, uninstall, packaged skill layout, and failure
  diagnostics

## Why

Milestone 06 needs the strict workflow to be installable before public
documentation and ship guidance can be treated as stable. The repository already
has strict skill directories, marketplace metadata, `validate-skills`, and a
basic `install.sh`, but it does not yet prove the user-facing install and
uninstall path or a strict package-script surface.

Landing this change first gives later documentation a validated setup story and
reduces the risk of documenting packaging behavior that is only partially
working.

## Scope

In scope:
- repository install and uninstall entrypoints for shared/global and
  project-local strict skill registration
- strict installer-facing naming and legacy-name safeguards for those
  entrypoints
- smoke tests covering install, uninstall, packaged skill symlink resolution,
  bundled script and template expectations, and failure diagnostics
- supporting package-script wiring needed to expose install, uninstall, and
  validation flows cleanly

Out of scope:
- maintenance change generation behavior
- ship-time verify, commit, and push handoff behavior
- broad public documentation rewrites beyond minimal command references needed
  to support installation surfaces
- changing strict skill prompt behavior outside packaging or install needs

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- existing strict CLI lifecycle behavior outside install and packaging surfaces
- existing strict skill metadata and package layout rules except where extended
  to support install or uninstall coverage
- roadmap recommendation, proposal, and sync behavior owned by earlier roadmap
  milestones
