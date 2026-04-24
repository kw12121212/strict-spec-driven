# port-spec-mapping-validation-commands

## What

Implement strict CLI support for mapping-audit workflows by adding a
`verify-spec-mappings` command that audits structured spec mapping fields,
reports mapping coverage gaps, and reports unmapped implementation or test
evidence.

## Why

Milestone 03 still has one validation gap: mapping coverage and unmapped
evidence checks are not available through a dedicated command surface. Closing
this gap improves spec-to-code traceability, reduces drift risk before roadmap
and migration milestones, and aligns the strict workflow with the planned
core lifecycle quality gates.

## Scope

In scope:
- Add `verify-spec-mappings` command routing and usage handling in the strict
  CLI.
- Implement mapping coverage audits against spec mapping frontmatter in
  `.spec-driven/specs/`.
- Implement unmapped evidence audits for relevant repository implementation and
  test files.
- Emit deterministic JSON diagnostics and exit codes for automation use.
- Add automated tests for success and failure scenarios.

Out of scope:
- Reworking `verify` change-level validation semantics.
- Replacing current spec frontmatter mapping format.
- Roadmap command or skill migration work from milestone 04.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if
nothing is at risk):
- Existing command semantics for `init`, `propose`, `apply`, `verify`,
  `archive`, `list`, `modify`, and `cancel`.
- Existing proposal, task, question, and archive artifact formats.
