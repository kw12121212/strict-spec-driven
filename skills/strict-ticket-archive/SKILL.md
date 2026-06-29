---
name: strict-ticket-archive
description: Archive a strict YAML ticket through existing strict ticket CLI commands. Use when a ticket already has an explicit dispatch decision or the user provides the exact outcome and rationale, and Codex should move the ticket into `.strict-spec-driven/tickets/archived/` without manually editing ticket YAML.
metadata:
  skill_id: strict_ticket_archive
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user archive a strict YAML ticket. This skill is narrower
than dispatch: it does not decide whether a requirement is implemented, rejected,
or should become a milestone. It only uses the existing ticket CLI to perform the
archive transition once that decision is already present or explicitly supplied.
Never move ticket files by hand.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
ticket-list: strict-spec-cli ticket-list
ticket-show: strict-spec-cli ticket-show <ticket-id>
ticket-validate: strict-spec-cli ticket-validate <ticket-id>
ticket-resolve: strict-spec-cli ticket-resolve <ticket-id> --outcome <not_implemented|implemented|not_wanted> --rationale <text> [--evidence-label <text> --evidence-target <text>]...
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
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

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Select the ticket** — if the user named a ticket id, use it; otherwise run
   `ticket-list` and ask the user which active ticket to archive if more than
   one candidate exists. Run `ticket-show <ticket-id>` to inspect the current
   ticket artifact and path.

2. **Stop if already archived** — if `ticket-show` reports a path under
   `.strict-spec-driven/tickets/archived/`, run `ticket-validate <ticket-id>` and
   report that the ticket is already archived. Do not rerun `ticket-resolve`.

3. **Confirm an existing decision** — archive only when one of these is true:
   - the ticket already has `dispatch_decision.outcome` and
     `dispatch_decision.rationale`
   - the user supplied an exact outcome (`implemented`, `not_wanted`, or
     `not_implemented`) and rationale in the current request
   - the ticket is already marked `promoted` and has
     `provenance.promoted_to`, in which case reuse `not_implemented` with a
     rationale that says the ticket was already promoted to that milestone and
     is being archived through the CLI

   If the ticket is still `open` or `needs_input` and has no explicit dispatch
   decision, stop and hand off to `/strict-ticket-dispatch`. Do not invent an
   outcome, rationale, evidence, or milestone promotion just to archive it.

4. **Run the existing archive transition** — invoke `ticket-resolve` with the
   confirmed decision. Reuse the existing `dispatch_decision.evidence` as
   `--evidence-label`/`--evidence-target` pairs when present. This command is
   the archive mechanism: it records or refreshes the dispatch decision, removes
   the active ticket file, rebuilds the active tickets index, and writes the
   auditable ticket artifact under `.strict-spec-driven/tickets/archived/`.

5. **Verify archive access** — run `ticket-show <ticket-id>` and
   `ticket-validate <ticket-id>` after `ticket-resolve`. Confirm that
   `ticket-show` now reports a path under `.strict-spec-driven/tickets/archived/`
   and that validation succeeds.

6. **Report the result** — tell the user the ticket id, final status, archived
   ticket path, and whether `ticket-resolve` reused an existing decision or used
   a decision the user supplied.

## Rules

- Use `ticket-resolve` as the only archive mechanism for tickets; never move or
  edit ticket YAML files manually
- Do not make dispatch judgments in this skill; use `/strict-ticket-dispatch`
  when the archive requires deciding implemented, not_wanted, or not_implemented
- Do not create a new promoted milestone from this skill unless the user
  explicitly supplied `not_implemented` and the rationale, or the ticket is
  already marked promoted with a `promoted_to` milestone
- Preserve existing dispatch evidence when rerunning `ticket-resolve`
- Always verify archived ticket readability with `ticket-show` and
  `ticket-validate`
