# define-markdown-exception-policy

## What

Define the Markdown exception policy for the strict YAML workflow contract.

This change will document that:

- Generated or consumed strict workflow artifacts must be YAML under the
  `.strict-spec-driven/` target workflow state.
- `SKILL.md` remains Markdown because Agent Skills packaging requires that
  filename and format.
- Repository documentation such as `README.md`, `AGENTS.md`, and `RTK.md`
  remains allowed Markdown because it is not workflow state.
- Bootstrap `.spec-driven/` Markdown artifacts remain legacy input for future
  migration work, not target strict workflow artifacts.
- Validation and migration behavior must distinguish workflow artifacts from
  packaging and repository-documentation exceptions.

## Why

The strict YAML contract already defines the target directory, command naming
model, and structured spec/delta model. It still needs a clear boundary for the
Markdown files that remain legitimate in a YAML-first repository.

Without that boundary, future validators, skill updates, and migration tooling
could either reject required packaging files like `SKILL.md` or accidentally
allow workflow state to stay Markdown. A small contract change now gives later
implementation work a deterministic policy to enforce.

## Scope

In scope:

- Define allowed Markdown exception categories for Agent Skills packaging and
  repository documentation.
- Require strict workflow artifacts generated or consumed by strict commands and
  skills to use YAML formats.
- Keep bootstrap `.spec-driven/` Markdown artifacts separate from the target
  `.strict-spec-driven/` YAML workflow state.
- Add delta spec requirements to the existing YAML artifact contract.

Out of scope:

- Implementing validators, migration commands, or skill rewrites.
- Converting existing files to YAML.
- Defining full legacy Markdown migration mappings.
- Changing the Agent Skills packaging format.
- Removing the bootstrap `.spec-driven/` planning state.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):

- `.strict-spec-driven/` remains the target strict workflow state directory.
- `.spec-driven/` remains bootstrap or legacy workflow state until migration
  tooling exists.
- The strict command naming model remains unchanged.
- The repository may keep normal documentation in Markdown.
