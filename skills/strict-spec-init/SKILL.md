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

The target project directory must be accessible from the current environment.
Before proceeding, verify the path you plan to initialize exists and is the
intended project root.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `workflow-config` and `spec-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli init --help --json`, `strict-spec-cli config-edit --help --json`, `strict-spec-cli spec-edit --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show config`, `strict-spec-cli schema-show spec-index`, `strict-spec-cli schema-show main-spec`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show config`, `strict-spec-cli sample-show spec-index`, `strict-spec-cli sample-show main-spec`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli init`, `strict-spec-cli config-edit`, `strict-spec-cli spec-edit`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
6. **Inspect the structured result and changed paths** — read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.
7. **Run the artifact's validation command** — `strict-spec-cli check-workflow-state`

**Stop rather than edit YAML directly.**

When a required command, argument, or artifact kind is unavailable, stop and
report the missing capability. Editing the YAML directly, writing a raw
payload, or scripting around the CLI is never an available fallback, and an
unavailable command is a reason to stop rather than a reason to improvise.

When you stop, report:

- the operation that could not be completed
- the artifact kind and target artifact it would have written
- the command or argument that is missing
- the discovery commands already consulted

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
