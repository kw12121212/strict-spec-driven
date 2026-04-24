# Design: ship-strict-installation-and-packaging

## Approach

Implement the change in three passes:

1. Expose strict installer entrypoints
- add explicit package scripts around `install.sh` for install, uninstall, and
  project-local variants
- keep installer-facing entrypoints aligned with the strict namespace instead of
  inheriting generic or legacy-facing names

2. Harden the repository installer
- keep default and `--project` target selection deterministic
- preserve in-place registration from the source repository so packaged skills
  continue using their relative `scripts` and `templates` symlinks
- reject or surface legacy-name assumptions clearly instead of silently treating
  them as strict aliases

3. Add install and packaging smoke coverage
- extend automated checks to exercise install and uninstall flows in addition to
  existing packaging validation
- verify bundled script and template links continue to resolve through the
  source-repo packaging layout
- cover deterministic failure diagnostics for broken symlinks or stale legacy
  install assumptions

## Key Decisions

- Build on the existing `install.sh` surface instead of replacing it with a new
  installer entrypoint, because the repository already has the right baseline
  shape for install and uninstall flow control.
- Keep package-script entrypoints strict-namespaced so installer-facing names
  remain distinguishable from legacy workflow names.
- Treat install and uninstall smoke checks as repository tests rather than
  documentation-only manual steps, because later docs should describe already
  verified behavior.

## Alternatives Considered

- Document the existing `install.sh` flow without adding package-script wiring.
  Rejected because the milestone explicitly calls for install and uninstall
  scripts and smoke-tested packaging behavior.
- Delay installer work until public docs are written. Rejected because docs
  would then freeze unverified setup behavior.
- Copy skill files during installation instead of registering the source
  repository in place. Rejected because the milestone notes require relative
  symlink expectations that stay valid without copying or dereferencing bundled
  assets.
