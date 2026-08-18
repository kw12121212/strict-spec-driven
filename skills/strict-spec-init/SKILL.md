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
config-edit: strict-spec-cli config-edit --<named-args>
spec-edit: strict-spec-cli spec-edit <spec-id> [--spec-path <path>] --<named-args>
```

## Prerequisites

The target project directory must exist and be the intended project root;
confirm the path before initializing it.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `workflow-config` and `spec-state`. Before the first
mutation run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for each
of them: that command reports the ordered authoring steps, the owning command
for each operation, and the bundled schema and example keys with their
cache-resolved paths, bound to the artifact kind and current where a copy would
go stale. Validate the result with `strict-spec-cli check-workflow-state`.

**Stop rather than edit YAML directly.** When a required command, argument, or
artifact kind is unavailable, stop and report the missing capability. Editing
the YAML directly, writing a raw payload, or scripting around the CLI is never
an available fallback, and an unavailable command is a reason to stop rather
than a reason to improvise.

## Preferred Human Language

Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` —
the user's common human language, not a programming language — for all
user-facing and generated operator-facing text, unless that file is absent or
the active user message asks otherwise.

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
   Apply the drafted values through `strict-spec-cli config-edit` named
   arguments; never edit `config.yaml` directly. Then configure
   `review_evidence.project_regression.command` with the
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
   `.strict-spec-driven/specs/` by invoking `strict-spec-cli spec-edit <spec-id>
   --spec-path <path> --title <text> --requirement <id> --strength
   <MUST|SHOULD|MAY> --statement <text>` once per spec, adding `--scenario <id>
   --given <text> --when <text> --then <text>` for each scenario.
   - do not write `.strict-spec-driven/specs/INDEX.yaml`; `spec-edit` reconciles
     the index in the same transaction as the spec it writes
   - supply `spec.id`, `spec.title`, and `requirements` content as named
     arguments rather than as YAML text
   - describe current observable behavior, not future aspirations
   - run `strict-spec-cli check-workflow-state` once the specs are in place

6. **Confirm** — summarize what was created and suggest
   `strict-roadmap-plan` to shape the roadmap or `strict-spec-propose` to create
   the first strict change.

## Rules

- Do not create a change during initialization
- Never hand-edit `.strict-spec-driven/config.yaml`; use `config-edit` for every
  post-init field, list, and named-removal mutation
- Keep the `context` field concise; a few sentences are enough
- Do not overwrite existing `.strict-spec-driven/` artifacts when repairing
  scaffold files
- Generate an `AGENTS.md` only when the project has none, and never overwrite an
  existing `AGENTS.md`
