---
name: strict-ticket
description: Capture a raw requirement as a strict YAML ticket of pure intent — problem, desired observable outcome, and acceptance notes — and scaffold it through the strict ticket CLI without proposing any solution.
metadata:
  skill_id: strict_ticket
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user capture a raw requirement as a strict YAML ticket. A
ticket records pure intent only — the problem, the desired observable outcome,
and acceptance notes — with no solution, technology choice, or design. Dispatch
(deciding whether the requirement is already implemented, and promoting it into
a roadmap milestone) is a separate skill; this skill only captures the
requirement and scaffolds the ticket through the CLI.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
ticket-create: node {{SKILL_DIR}}/scripts/strict-spec-driven.js ticket-create --title <text> --problem <text> --desired-outcome <text> [--intent <text>] [--label <text>]... [--external-label <text> --external-target <text>]
ticket-list: node {{SKILL_DIR}}/scripts/strict-spec-driven.js ticket-list
ticket-show: node {{SKILL_DIR}}/scripts/strict-spec-driven.js ticket-show <ticket-id>
ticket-edit: node {{SKILL_DIR}}/scripts/strict-spec-driven.js ticket-edit <ticket-id> [--title <text>] [--problem <text>] [--desired-outcome <text>] [--intent <text> | --clear-intent] [--label <text>]... | --clear-labels [--external-label <text> --external-target <text> | --clear-external-tracker]
```

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Elicit pure intent** — work with the user to articulate the requirement as
   intent only:
   - **problem** — the difficulty or gap the user is experiencing, in their
     terms, with no proposed fix
   - **desired observable outcome** — what should be true or possible once the
     requirement is satisfied, described as externally observable behavior
   - **intent / acceptance notes** (optional) — how the user would recognize
     the requirement as met
   Actively steer away from solutions. If the user describes a solution,
   technology, command, or design, reflect it back as a problem and desired
   outcome instead. Do not record implementation choices in the ticket.

2. **Capture optional metadata** — ask only if relevant:
   - optional **labels** for categorization
   - an optional **external tracker** reference (label plus target, for example
     a GitHub or Jira link) — a plain reference, not a live integration

3. **Confirm the requirement** — restate the captured problem, desired outcome,
   and intent back to the user in plain language and confirm it contains no
   solutioning before creating the ticket.

4. **Scaffold the ticket through the CLI** — create the ticket only with the
   `ticket-create` command; never hand-write ticket YAML and never edit the
   tickets index directly. Pass the captured fields as arguments. The command
   generates a conflict-resistant id, writes the ticket with `open` status,
   maintains the tickets index, and reports the created path. Creation is
   idempotent: rerunning with the same requirement reports the existing ticket
   rather than creating a duplicate.

5. **Report the result** — tell the user the created ticket id and file path
   (use `ticket-show <ticket-id>` to display it), and explain that the next step
   is dispatch to decide whether the requirement is already implemented or should
   become a roadmap milestone. Do not perform that dispatch here.

6. **Refine an existing ticket** — when the user wants to correct or sharpen an
   already-captured ticket that is still active (not yet dispatched), update it
   only through `ticket-edit <ticket-id>`; never hand-edit the ticket YAML. Pass
   only the fields that change — `--title`, `--problem`, `--desired-outcome`,
   `--intent`, `--label` (repeatable, replaces the label set), and the external
   tracker flags — and use the value-less clear flags (`--clear-intent`,
   `--clear-labels`, `--clear-external-tracker`) to remove an optional field. The
   command keeps the ticket id, creation time, and status stable, so refining the
   wording never renames the ticket or breaks its links, and it re-validates the
   ticket before saving. Apply the same pure-intent discipline to edits: keep the
   requirement free of solutions. `ticket-edit` refuses to touch a resolved
   ticket, so do not use it to revise dispatch decisions.

## Rules

- Capture pure intent only — problem, desired outcome, and acceptance notes;
  never a solution, technology choice, or design
- Create and modify tickets only through the ticket CLI commands (`ticket-create`
  to capture, `ticket-edit` to refine an active ticket); never hand-write ticket
  YAML or the tickets index
- Do not dispatch, close, promote, or reject the ticket, and do not create
  milestones or propose changes — that is the dispatch skill's responsibility
- Keep the judgment about how to phrase the requirement in this prompt; keep all
  file creation and format enforcement in the CLI
