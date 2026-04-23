# create-strict-template-assets

## What

- Add bundled strict scaffold template assets under `templates/strict-spec-driven/` for:
- strict workflow config
- specs index
- roadmap index
- empty changes state
- seed README guidance for generated strict workflow state
- Define the expected template-asset behavior in a delta spec for CLI foundation.

## Why

Milestone 02 still needs template assets before `implement-strict-init` can generate
`.strict-spec-driven/` deterministically. Creating these assets first reduces risk,
keeps `init` focused on filesystem behavior, and gives fixture-driven tests stable
inputs.

## Scope

- In scope:
- add strict template assets for the scaffold inputs listed above
- keep template assets separated from schema/example assets
- document observable template-asset availability in delta specs
- Out of scope:
- implementing the `init` command behavior
- adding new lifecycle commands beyond asset creation
- completing full fixture and negative validation test coverage from later planned changes

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- Existing CLI command routing and validation behavior stay unchanged.
- Existing schema/example files remain source-of-truth for contract samples, not generated state.
