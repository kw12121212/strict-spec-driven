---
name: strict-spec-init
description: Initialize a .strict-spec-driven/ directory in a project. Creates strict YAML scaffold files, then guides the user to fill in project context and initial specs.
metadata:
  skill_id: strict_spec_init
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user initialize the strict spec-driven workflow in a
project.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
init: node {{SKILL_DIR}}/scripts/strict-spec-driven.js init
```

## Prerequisites

The target project directory must be accessible from the current environment.
Before proceeding, verify the path you plan to initialize exists and is the
intended project root.

## Steps

1. **Confirm the target project** — ask which project to initialize. If the user
   is already in the project root, use the current directory.

2. **Run init** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js init
   ```
   - If `.strict-spec-driven/` does not exist, this bootstraps it from scratch.
   - If `.strict-spec-driven/` already exists, this repairs missing scaffold
     files without overwriting existing strict artifacts.

3. **Draft context** — read project files that describe the system
   (`README.md`, `AGENTS.md`, `package.json`, and similar) and draft a concise
   `context` value for `.strict-spec-driven/config.yaml`. Cover:
   - what the project does
   - the tech stack and languages
   - key conventions or constraints worth preserving

4. **Capture existing behavior** — if the project already has stable behavior,
   help the user create initial strict YAML main specs under
   `.strict-spec-driven/specs/`.
   - update `.strict-spec-driven/specs/INDEX.yaml`
   - use structured YAML fields such as `spec.id`, `spec.title`, `mapping`, and
     `requirements`
   - describe current observable behavior, not future aspirations

5. **Confirm** — summarize what was created and suggest
   `strict-roadmap-plan` to shape the roadmap or `strict-spec-propose` to create
   the first strict change.

## Rules

- Do not create a change during initialization
- Keep the `context` field concise; a few sentences are enough
- Do not overwrite existing `.strict-spec-driven/` artifacts when repairing
  scaffold files
