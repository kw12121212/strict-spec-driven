# Design: update-core-spec-skills-for-yaml

## Approach

Implement the change in three passes:

1. Replace placeholder core skill prompts with strict lifecycle guidance
- author concrete `SKILL.md` content for the nine core `strict-spec-*` skills
- give each skill an explicit command table that points at the strict bundled
  CLI and the subcommand(s) that skill owns
- update prompt prose so the skills talk about `.strict-spec-driven/` YAML
  artifacts rather than generic or legacy workflow state

2. Preserve the strict division of responsibilities
- keep deterministic filesystem, parsing, validation, and merge mechanics in
  `strict-spec-driven` scripts
- keep planning, user confirmation checkpoints, editing guidance, and review
  judgment in the skill prompts
- avoid widening any core skill beyond the milestone guardrail for these nine
  lifecycle skills

3. Add regression checks for core skill content
- extend repository validation or smoke coverage so core strict skills are not
  considered valid if they remain placeholder command stubs
- verify that expected strict command references and strict workflow directory
  references are present where the core skill contract requires them

## Key Decisions

- Limit this change to the nine core lifecycle skills from the roadmap item
  rather than mixing in planning or roadmap skills.
- Treat explicit command mappings as part of the observable skill contract so
  installed skills guide agents toward the same CLI surface the repository
  implements.
- Add automated protection for core skill content instead of relying on manual
  review, because placeholder stubs can otherwise look superficially valid after
  packaging validation passes.

## Alternatives Considered

- Rewrite all strict skills in one change.
  Rejected because milestone 04 explicitly splits core lifecycle skills from
  planning and roadmap skill families.
- Update the prompt prose only and leave validation unchanged.
  Rejected because the milestone done criteria call for automated validation or
  smoke coverage of behavior rather than trusting prompt text alone.
- Skip skill updates until migration work starts.
  Rejected because milestone 05 depends on milestone 04 providing a usable
  strict skill surface first.
