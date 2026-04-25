# Questions: port-maintenance-workflow-to-yaml

## Open

<!-- No open questions -->

## Resolved

- [x] Q: What CLI subcommand name should the maintenance command use?
  Context: Existing strict subcommands use verb or verb-object naming; the milestone notes referenced `run-maintenance` but the pattern `maintenance` is more consistent with `ship`, `archive`.
  A: `maintenance` (confirmed by user)

- [x] Q: Which configured check type should the first version include?
  Context: Determines the maintenance config schema, the default template content, and what tests must cover.
  A: `roadmap-sync-check` only (confirmed by user)
