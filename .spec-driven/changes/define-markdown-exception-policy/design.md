# Design: define-markdown-exception-policy

## Approach

Add contract-focused requirements under `specs/contracts/` that define the
observable Markdown boundary for strict YAML workflow artifacts.

The proposal will stay at the artifact-contract level. It will identify which
Markdown files remain valid because they are packaging or repository
documentation, and it will require generated or consumed strict workflow state
to use YAML artifacts. It will not introduce validator code, parser behavior, or
migration logic.

## Key Decisions

- Treat `SKILL.md` as a packaging exception rather than as workflow state,
  because the Agent Skills format owns that Markdown container.
- Treat `README.md`, `AGENTS.md`, `RTK.md`, and similar repository
  documentation as non-workflow documentation unless a later schema explicitly
  classifies a file as workflow state.
- Require strict workflow artifacts under `.strict-spec-driven/` to use YAML
  names such as `proposal.yaml`, `design.yaml`, `tasks.yaml`, `questions.yaml`,
  specs, deltas, indexes, roadmap indexes, and roadmap milestones.
- Treat `.spec-driven/` Markdown artifacts as bootstrap or legacy source
  artifacts for migration, not as acceptable target artifacts for strict
  workflows.
- Require future validation and migration behavior to make the workflow artifact
  versus Markdown exception decision by artifact role, not by a broad file
  extension rule.

## Alternatives Considered

- Ban all Markdown in strict projects: rejected because `SKILL.md` is a required
  Agent Skills packaging file and repository docs are not workflow state.
- Allow Markdown anywhere outside specs: rejected because strict workflow
  artifacts also include proposals, designs, tasks, questions, indexes, and
  roadmap files.
- Define detailed migration mappings now: rejected because this change only
  closes the Markdown boundary; migration compatibility has a dedicated planned
  roadmap item.
- Leave the policy implicit in README prose: rejected because later validators
  and skills need observable requirements in the spec contract.
