---
name: strict-spec-ship
description: Ship an archived strict YAML change. Verifies the archived change, snapshots roadmap state, constructs a focused git commit message, and hands off git push to the operator.
metadata:
  skill_id: strict_spec_ship
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user ship an archived strict YAML change with a focused git commit.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
ship: strict-spec-cli ship <change-name>
```

## Responsibility Split

**Handled by CLI scripts**
- resolve the archived change directory under `.strict-spec-driven/changes/archive/`
- read the proposal summary from archived change artifacts
- snapshot current roadmap state
- emit structured JSON for the skill to consume

**Handled by the AI**
- construct the focused git commit message from ship command output
- stage the relevant files with `git add`
- run `git commit`
- present `git push` for operator confirmation before executing

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

The change must already be archived under `.strict-spec-driven/changes/archive/`
before this skill runs. Run `/strict-spec-archive` first if the change is not
yet archived.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Run the ship command** to get verification JSON:
   ```bash
   strict-spec-cli ship <change-name>
   ```
   Stop if the command exits non-zero. The output includes `changeName`,
   `archivePath`, `proposalSummary`, and `roadmapSnapshot`.

2. **Construct the commit message** using the JSON output:
   - Title line: `feat: <changeName>` (use `fix:`, `chore:`, or `docs:` if
     `proposalSummary` clearly indicates a different commit type)
   - Keep the title under 72 characters
   - Optionally add a short body line from `proposalSummary` if it adds
     meaningful context beyond the title

3. **Review git status** to confirm which files have changed:
   ```bash
   git status
   ```
   Confirm the staged and unstaged changes correspond to the archived change
   before proceeding. Stop if unrelated work-in-progress changes are present.

4. **Stage the relevant files** — use `git add` for the implementation files,
   test files, skill files, spec files, and workflow artifacts that belong to
   this change. Do not stage unrelated files.

5. **Commit** with the constructed message:
   ```bash
   git commit -m "<commit-message>"
   ```

6. **Present push** — show the operator the `git push` command and wait for
   explicit confirmation before executing it.

## Rules

- Do not push without explicit operator confirmation
- Use the `ship` command output as the source for change name and summary
- Do not stage files that do not belong to the archived change
- Do not re-run verify or archive as part of this skill — those steps are done
