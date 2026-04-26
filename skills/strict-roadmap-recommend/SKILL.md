---
name: strict-roadmap-recommend
description: Recommend the next strict roadmap-backed change, then scaffold it as a normal strict change after explicit confirmation.
metadata:
  skill_id: strict_roadmap_recommend
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user choose the next strict roadmap-backed change and turn
the accepted recommendation into a normal strict change.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
roadmap-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
propose: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. Before
proceeding, verify that strict workflow state already exists.

## Steps

1. **Read roadmap context first** — read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/roadmap/INDEX.yaml`
   - the milestone YAML files relevant to the current strict roadmap phase
   - `.strict-spec-driven/specs/INDEX.yaml`
   - the strict YAML main specs the candidate change is likely to touch
   - the current `roadmap-status` output
   - the owning milestone YAML file's `details` field, if present, as targeted
     planning guidance for the recommended change

2. **Choose the next candidate from existing planned changes** — recommend only a
   planned change that already exists under one milestone
   in `.strict-spec-driven/roadmap/milestones/`.

3. **Present a checkpoint before scaffolding** — summarize:
   - the proposed change name
   - the milestone it comes from
   - why it is the best next step
   - which strict specs are likely to change
   - any open questions that would need to go into the strict change proposal
   Then ask for explicit confirmation before creating the change scaffold.

4. **Scaffold only after confirmation** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
   ```
   Then fill the normal strict change artifacts under
   `.strict-spec-driven/changes/<change-name>/` without copying full
   milestone-level planning metadata into the change. If the owning milestone
   has a `details` field, extract the portions relevant to the selected planned
   change and use them as targeted planning guidance when populating the
   change artifacts. Do not copy the full milestone plan — only extract
   guidance relevant to this one planned change. If `details` is absent,
   proceed normally.

5. **Validate the proposed strict change** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   ```
   Fix safe proposal-shape issues, record real ambiguity in `questions.yaml`, and
   stop if unresolved questions still need a human answer.

## Rules

- Recommend only work that already exists under `.strict-spec-driven/roadmap/`
- Keep `.strict-spec-driven/roadmap/` as the canonical home of milestone-level
  planning metadata
- Do not scaffold until the user explicitly confirms the recommendation
- Convert exactly one planned change into one normal strict change scaffold
