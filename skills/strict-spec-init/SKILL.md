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
init: strict-spec-cli init
```

## Prerequisites

The target project directory must be accessible from the current environment.
Before proceeding, verify the path you plan to initialize exists and is the
intended project root.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

1. **Confirm the target project** — ask which project to initialize. If the user
   is already in the project root, use the current directory.

2. **Run init** — run:
   ```bash
   strict-spec-cli init
   ```
   - If `.strict-spec-driven/` does not exist, this bootstraps it from scratch.
   - If `.strict-spec-driven/` already exists, this repairs missing scaffold
     files without overwriting existing strict artifacts.

3. **Draft context** — read project files that describe the system
   (`README.md`, `AGENTS.md`, `package.json`, and similar) and draft a concise
   `context` value for `.strict-spec-driven/config.yaml`. Also set or preserve
   `preferred_human_language`, which records the user's common human language
   for AI interaction (for example English or Chinese) and is not a programming
   language field. Use `English` when no stronger project or user preference is
   known. Cover:
   - what the project does
   - the tech stack and languages
   - key conventions or constraints worth preserving
   Then configure `review_evidence.project_regression.command` with the
   project's real complete regression command (build plus full test run) for
   the detected toolchain — the scaffold ships a REPLACE placeholder, not a
   runnable command. Recommend declaring the commented coverage contract
   (`coverage: threshold / metric / scope`) so minimum test coverage becomes a
   blocking review-evidence gate; the regression command must then enforce that
   threshold by exiting non-zero below it (for example via the test runner's
   own coverage threshold support). The strict CLI validates the declaration
   but never measures coverage itself.

4. **Ensure AGENTS.md exists** — check the target project root for an `AGENTS.md`.
   If none exists, generate a concise `AGENTS.md` describing the project for future
   agents, reusing the understanding you gathered while drafting context:
   - what the project does
   - the tech stack and languages
   - key conventions, constraints, and commands worth preserving
   Do not overwrite an existing `AGENTS.md`; if one is already present, leave it
   untouched.

5. **Capture existing behavior** — if the project already has stable behavior,
   help the user create initial strict YAML main specs under
   `.strict-spec-driven/specs/`.
   - update `.strict-spec-driven/specs/INDEX.yaml`
   - use structured YAML fields such as `spec.id`, `spec.title`, `mapping`, and
     `requirements`
   - describe current observable behavior, not future aspirations

6. **Confirm** — summarize what was created and suggest
   `strict-roadmap-plan` to shape the roadmap or `strict-spec-propose` to create
   the first strict change.

## Rules

- Do not create a change during initialization
- Keep the `context` field concise; a few sentences are enough
- Do not overwrite existing `.strict-spec-driven/` artifacts when repairing
  scaffold files
- Generate an `AGENTS.md` only when the project has none, and never overwrite an
  existing `AGENTS.md`
