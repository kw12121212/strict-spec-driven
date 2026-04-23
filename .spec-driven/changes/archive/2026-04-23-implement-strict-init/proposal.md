# implement-strict-init

## What

- Implement the `strict-spec-driven init` subcommand so it creates
  `.strict-spec-driven/` from bundled scaffold template assets.
- Generate the initial strict workflow scaffold files and directories for config,
  specs index, roadmap index, changes state, and seed README guidance.
- Add idempotent and non-clobber behavior so rerunning `init` does not overwrite
  existing strict workflow artifacts.
- Add coexistence handling when a legacy `.spec-driven/` directory is present:
  emit a warning and continue strict scaffold creation.

## Why

Milestone 02 has two remaining planned changes. `implement-strict-init` is the
blocking foundation capability needed before fixture and validation tests can
exercise real strict scaffold behavior. Completing this now reduces dependency
risk for milestone 03 command ports that assume strict state bootstrapping
already works.

## Scope

In scope:
- wire `init` into the strict CLI command surface
- copy/create strict scaffold artifacts under `.strict-spec-driven/` from bundled
  templates
- preserve existing user-authored strict files by skipping overwrite
- emit deterministic warning output for `.spec-driven/` coexistence
- define observable `init` behavior in delta specs for `cli/foundation`

Out of scope:
- adding fixture matrix and validation regression coverage for all M01 scenarios
  (covered by `add-yaml-fixtures-and-tests`)
- porting propose/apply/verify/archive/list/modify/cancel lifecycle commands
  (milestone 03)
- roadmap workflow or skill renaming work (milestones 04+)

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- Existing YAML parsing/validation helper APIs and schema assets remain unchanged.
- Existing CLI behavior for unknown subcommands and no-arg invocation remains
  unchanged.
- Existing scaffold template asset contents remain source inputs, not generated
  runtime state.
