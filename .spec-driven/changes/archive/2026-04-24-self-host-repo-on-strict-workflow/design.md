# Design: self-host-repo-on-strict-workflow

## Approach

Implement the self-hosting cutover in four passes:

1. Cut over the repository using real bootstrap input
- run migration against the repository's actual `.spec-driven/` state instead of
  reduced fixtures
- treat the generated `.strict-spec-driven/` tree as the candidate new source of
  truth for strict workflow state
- compare migrated specs, roadmap, and archived changes against the bootstrap
  state so identity and ordering survive the cutover

2. Repair only self-host blockers
- fix migration, validation, or strict-command behavior only where the
  repository's real state exposes gaps
- keep fixes scoped to self-host readiness rather than reopening already
  finished migration milestones
- add focused regression coverage for each blocker so the cutover stays
  repeatable

3. Update guidance and bootstrap policy together
- switch repository guidance to prefer strict names, directories, and artifact
  locations after the strict state exists
- keep `.spec-driven/` in place as legacy migration input until a later change
  explicitly retires it
- make the preservation decision visible so operators do not treat both
  directories as equivalent active targets

4. Leave downstream operations work for milestone 06
- stop at validated self-host readiness, repository strict state, and guidance
  updates
- do not absorb installation polish, ship automation, maintenance automation, or
  public documentation bundles

## Key Decisions

- Preserve `.spec-driven/` for now. The accepted recommendation was to keep the
  bootstrap directory as legacy migration input while making
  `.strict-spec-driven/` the preferred active workflow state.
- Treat self-hosting as proof work, not a fresh migration feature initiative.
  This change should only widen CLI or migration behavior when the repository's
  real cutover exposes a concrete blocker.
- Update repository guidance in the same change as migrated strict state. The
  directory policy and preferred command surfaces should become visible exactly
  when the repository can actually use them.
- Keep milestone boundaries explicit. Maintenance, ship, install, uninstall, and
  public documentation polish remain in milestone 06.

## Alternatives Considered

- Start with `add-strict-spec-migrate-skill`.
  Rejected because it improves migration guidance but does not establish the
  self-hosted repository state that later roadmap work depends on.
- Start milestone-06 operations or documentation work first.
  Rejected because those surfaces need a stable self-hosted strict baseline
  before they can be finalized.
- Delete `.spec-driven/` during the cutover.
  Rejected because the repository still benefits from preserved legacy migration
  input, and the accepted policy was to keep bootstrap artifacts in place for
  now.
