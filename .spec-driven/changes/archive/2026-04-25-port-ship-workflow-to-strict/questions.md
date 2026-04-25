# Questions: port-ship-workflow-to-strict

## Open

<!-- No open questions -->

## Resolved

- [x] Q: Should `port-ship-workflow-to-strict` implement a `ship` CLI subcommand that automates the focused git commit, or should the skill prompt guide the operator through manual git steps with CLI-driven verification only?
  Context: Determines whether a new CLI subcommand needs implementation and tests, or whether the main deliverable is SKILL.md content using existing commands.
  A: Add a minimal `ship` CLI subcommand that validates the archived change and emits structured JSON (change name, archive path, proposal summary, roadmap snapshot). The skill prompt handles `git add`, `git commit`, and documents `git push` for operator review. CLI stays deterministic and testable; git steps stay in the skill layer where they can be reviewed before execution.
