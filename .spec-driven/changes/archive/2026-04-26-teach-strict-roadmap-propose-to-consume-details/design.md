# Design: teach-strict-roadmap-propose-to-consume-details

## Approach

The change is primarily a skill-prompt update. The `details` field is already available in the loaded milestone artifact (`LoadedMilestone.artifact.details`). The skill prompts need a new step instructing the agent to read that field and incorporate relevant portions into the proposal, design, and task artifacts.

Both `strict-roadmap-propose/SKILL.md` and `strict-roadmap-recommend/SKILL.md` will be updated to:

1. Explicitly read the milestone YAML file for the owning milestone (not just `roadmap-status`)
2. Extract the `details` field if present
3. Use `details` as targeted context when filling change artifacts — for example, using technical guidance from `details` to inform the design approach, key decisions, or task breakdown
4. Not copy `details` verbatim into change artifacts — only extract the portions relevant to the selected planned change

The delta spec will add a MODIFIED requirement to `strict-roadmap-proposal-handoff-contract` describing that the proposal handoff reads milestone `details` as guidance input.

## Key Decisions

- **Skill prompts, not CLI commands.** The `strict-spec-driven propose` CLI command creates generic scaffolds. Reading and consuming milestone `details` is an agent judgment task that belongs in the skill prompt, not in the deterministic scaffold command.
- **Details informs, does not replace.** The agent uses `details` as context for better artifact authoring, but the change artifacts still describe scope for exactly one planned change. Whole-milestone prose does not get copied.
- **Optional and graceful.** Milestones without `details` must still work identically. The skill steps read the field conditionally.

## Alternatives Considered

- **CLI command reads and pre-fills details.** Rejected because the scaffold command is intentionally generic and deterministic. Injecting milestone-specific prose would couple it to roadmap state.
- **Separate `roadmap-details` CLI command.** Rejected because `details` is already part of the loaded milestone artifact. Adding a separate command would be redundant.
- **Auto-copy details into design.yaml.** Rejected because the agent should extract only relevant portions, not dump the entire field verbatim.
