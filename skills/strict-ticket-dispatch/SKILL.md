---
name: strict-ticket-dispatch
description: Dispatch a strict YAML ticket by judging whether its requirement is already implemented from specs, code, and docs, then drive the strict ticket CLI to close, promote, or reject it — keeping the judgment in this prompt and all state transitions in the CLI.
metadata:
  skill_id: strict_ticket_dispatch
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user dispatch a strict YAML ticket. Dispatch answers one
question the CLI deliberately does not: is the requirement's desired observable
outcome already satisfied? That judgment is yours, formed from repository
evidence and recorded as the ticket's dispatch decision. The CLI performs only the
deterministic state transition you decide. Never hand-write ticket or milestone
YAML, and never fabricate milestone scope.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
ticket-list: node {{SKILL_DIR}}/scripts/strict-spec-driven.js ticket-list
ticket-show: node {{SKILL_DIR}}/scripts/strict-spec-driven.js ticket-show <ticket-id>
ticket-validate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js ticket-validate <ticket-id>
ticket-resolve: node {{SKILL_DIR}}/scripts/strict-spec-driven.js ticket-resolve <ticket-id> --outcome <not_implemented|implemented|not_wanted> --rationale <text> [--evidence-label <text> --evidence-target <text>]...
roadmap-sync: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
```

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Steps

Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Select the ticket** — if the user named a ticket, use it; otherwise run
   `ticket-list` and choose an open ticket to dispatch. Run `ticket-show
   <ticket-id>` to read its problem, desired observable outcome, and intent.

2. **Gather evidence** — determine whether the desired observable outcome is
   already satisfied by reading:
   - `.strict-spec-driven/specs/INDEX.yaml` and the relevant strict main specs
   - spec-to-code mapping fields and the mapped implementation and test files
   - repository documentation (README, QUICKSTART, guides) that describes
     existing behavior
   Note the concrete spec, code, and doc references your judgment relies on;
   you will pass them to the CLI as evidence.

3. **Form a judgment** — decide one outcome:
   - **implemented** — the desired outcome is already satisfied by existing
     specs, code, or docs
   - **not_implemented** — the requirement is real and not yet built
   - **not_wanted** — the requirement should be rejected or deferred
   If the evidence is ambiguous, contradictory, or the spec coverage is too thin
   to decide confidently, do not guess: explain what is unclear and defer to the
   user, leaving the ticket open. Only proceed to a transition once you can
   justify the outcome with concrete evidence.

4. **Drive the CLI transition** — apply the decision only through
   `ticket-resolve`, never by editing ticket YAML:
   - implemented: `ticket-resolve <id> --outcome implemented --rationale <why>`
     with `--evidence-label`/`--evidence-target` pairs pointing at the
     satisfying specs, code, or docs
   - not_implemented: `ticket-resolve <id> --outcome not_implemented --rationale
     <why>` — the CLI materializes a new milestone skeleton with the goal seeded
     from the requirement and scope left as a refinement stub
   - not_wanted: `ticket-resolve <id> --outcome not_wanted --rationale <why>`

5. **Hand off after a promotion** — when you promoted the ticket
   (not_implemented), run `roadmap-sync` to reconcile roadmap state, then hand
   off to `/strict-roadmap-milestone` (or `/strict-roadmap-plan`) so a human or
   planning skill defines the milestone's real scope, done criteria, and
   dependencies. Do not fabricate that scope yourself and do not decompose the
   milestone into changes here.

6. **Report the outcome** — tell the user the decision, the evidence it relied
   on, the resulting ticket status, and (for a promotion) the created milestone
   id and the refinement handoff.

## Rules

- The implemented-vs-not judgment stays in this prompt; the CLI performs only
  the deterministic transition you decide
- Apply every transition through the ticket-resolve command; never hand-write
  ticket or milestone YAML and never edit the tickets index directly
- Record the concrete evidence your judgment relied on as dispatch evidence
  references
- Defer to the user and leave the ticket open or in needs_input when evidence is
  ambiguous or spec coverage is too thin to decide confidently — never guess
- After a promotion, run roadmap-sync and hand off scope definition to
  /strict-roadmap-milestone; do not fabricate milestone scope or decompose it
  into changes
