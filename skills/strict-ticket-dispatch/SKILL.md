---
name: strict-ticket-dispatch
description: Dispatch a strict YAML ticket by judging whether its requirement is already implemented from specs, code, and docs, then drive the strict ticket CLI to close, promote, or reject it. For promoted tickets, refine the created milestone into executable roadmap detail, add planned-change detail, and review it again before handoff.
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
deterministic state transition you decide. Never hand-write ticket YAML or the
tickets index. For promoted milestones, do not leave the generated refinement
stub behind: refine the created milestone into concrete roadmap scope, add
milestone `details`, create at least one standalone planned-change artifact with
actionable `summary` and `details`, review the milestone and planned-change
files again against the source ticket and repository evidence, and apply
reasonable corrections before reporting completion. Resolved tickets are moved to
`.strict-spec-driven/tickets/archived/` by `ticket-resolve`; never move ticket
files by hand.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
ticket-list: strict-spec-cli ticket-list
ticket-show: strict-spec-cli ticket-show <ticket-id>
ticket-validate: strict-spec-cli ticket-validate <ticket-id>
ticket-resolve: strict-spec-cli ticket-resolve <ticket-id> --outcome <not_implemented|implemented|not_wanted> --rationale <text> [--evidence-label <text> --evidence-target <text>]...
roadmap-status: strict-spec-cli roadmap-status
roadmap-sync: strict-spec-cli roadmap-sync
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

## Ticket-Promoted Intake Evidence

When a ticket is promoted into roadmap work, treat the archived ticket problem,
desired outcome, intent, dispatch rationale, evidence links, created milestone
`source_ticket`, milestone `details`, and standalone planned-change `summary`,
`details`, `depends_on`, and labels as future change-intake evidence. Write the
promoted roadmap detail so a later roadmap-backed proposal can answer checklist
items from that evidence instead of re-asking the human.

If ticket or repository evidence does not identify affected proposal scope, spec
delta, implementation files, tests, dependencies, or technical standards, record
that uncertainty explicitly in the promoted milestone or planned-change
`details`, `risks`, or `notes` using `preferred_human_language`. Do not guess
unsupported implementation boundaries. The later roadmap-backed proposal flow
will turn unresolved implementation questions into `questions.yaml.open`
blockers before coding.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
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
   - **not_implemented** — the requirement is real, not yet built, and the
     ticket plus repository evidence are sufficient to create an executable
     milestone definition with milestone `details` and at least one standalone
     planned-change artifact immediately after promotion
   - **not_wanted** — the requirement should be rejected or deferred
   If the evidence is ambiguous, contradictory, the spec coverage is too thin to
   decide confidently, or a not-yet-built requirement lacks enough detail to
   produce a concrete promoted milestone plus planned change, do not guess:
   explain what is unclear and defer to the user, leaving the ticket open. Only
   proceed to a transition once you can justify the outcome and, for
   `not_implemented`, can also refine the created milestone with concrete
   planning detail and a concrete standalone planned change.

4. **Drive the CLI transition** — apply the decision only through
   `ticket-resolve`, never by editing ticket YAML. The command records the
   dispatch decision and moves the resolved ticket artifact into
   `.strict-spec-driven/tickets/archived/`; keep the returned `ticketPath` as the
   auditable ticket location.
   - implemented: `ticket-resolve <id> --outcome implemented --rationale <why>`
     with `--evidence-label`/`--evidence-target` pairs pointing at the
     satisfying specs, code, or docs
   - not_implemented: `ticket-resolve <id> --outcome not_implemented --rationale
     <why>` — the CLI materializes a new milestone skeleton with the goal seeded
     from the requirement and scope left as a refinement stub
   - not_wanted: `ticket-resolve <id> --outcome not_wanted --rationale <why>`

5. **Refine and review the promoted milestone** — when you promoted the ticket
   (`not_implemented`), keep the milestone path returned by `ticket-resolve`,
   run `roadmap-sync` to reconcile roadmap state, then inspect that milestone
   file. Replace the generated refinement stub with a complete milestone
   definition directly in the milestone YAML:
   - set a specific `goal` that restates the desired observable outcome as
     roadmap work
   - fill `scope.in` and `scope.out` with concrete boundaries
   - write verifiable `done_criteria`
   - capture known `dependencies`, `risks`, and `notes`
   - write a `details` field with the concrete planning context an agent will
     need when turning the milestone into strict changes
   - include the ticket provenance, evidence links, and any known spec delta,
     implementation, test, dependency, or technical-standard impact in
     `details` so roadmap-backed proposal skills can use it as intake evidence
   - keep the `source_ticket` back-reference
   - keep milestone `planned_changes` empty unless you are intentionally
     materializing legacy inline data
   - create at least one standalone
     `.strict-spec-driven/roadmap/planned-changes/*.yaml` artifact for the
     initial executable work needed to make the milestone actionable, with
     actionable `summary`, `details`, `depends_on`, and `status`
   - when implementation, test, spec, dependency, or technical-standard impact
     remains unknown after evidence gathering, state that uncertainty explicitly
     in the milestone or planned-change detail instead of inventing scope

   After editing, run `roadmap-sync`, then run `roadmap-status` and perform a
   second-pass review before handoff. Re-read the source ticket with
   `ticket-show <ticket-id>`; it should resolve from the ticket archive after
   `ticket-resolve`. Also re-read the promoted milestone, any new planned-change
   files, and the evidence used for dispatch. Check for remaining refinement
   stubs, vague scope, unverifiable done criteria, unsupported dependencies,
   missing risks, weak planned-change details, status mismatches, missing
   `source_ticket`, missing archived ticket access, and roadmap diagnostics.
   Apply reasonable corrections immediately, then run `roadmap-sync` again. Do
   not report completion until this second-pass review is done, the safe fixes
   have been applied, the milestone has `details`, and at least one standalone
   planned-change file with actionable `details` exists.

   Do not invent scope, dependencies, or planned changes that are not supported
   by the ticket, user context, or repository evidence. If the second-pass review
   reveals a product decision or boundary decision that cannot be made from the
   available evidence, keep the milestone valid and explicit about the known
   scope, record the uncertainty in `risks` or `notes`, and report the precise
   human decision needed.

6. **Report the outcome** — tell the user the decision, the evidence it relied
   on, the resulting ticket status, the archived ticket path, and (for a
   promotion) the created milestone id, the milestone and planned-change files
   you refined, the second-pass review result, and any remaining human decision.

## Rules

- The implemented-vs-not judgment stays in this prompt; the CLI performs only
  the deterministic transition you decide
- Apply every ticket transition through the ticket-resolve command; never
  hand-write ticket YAML and never edit the tickets index directly
- Treat `ticket-resolve` as the only mechanism that archives resolved tickets;
  after implemented, not_wanted, or not_implemented outcomes, the active ticket
  file should be gone and the auditable artifact should live under
  `.strict-spec-driven/tickets/archived/`
- Record the concrete evidence your judgment relied on as dispatch evidence
  references
- Defer to the user and leave the ticket open or in needs_input when evidence is
  ambiguous or spec coverage is too thin to decide confidently — never guess
- After a promotion, run roadmap-sync, refine the created milestone into
  executable roadmap detail, create at least one standalone planned-change file
  with actionable details, run roadmap-status, review the milestone and
  planned-change files again, and apply reasonable corrections before reporting
  completion
- Do not promote a ticket unless you can immediately replace the generated
  refinement stub with concrete milestone detail and at least one concrete
  standalone planned change supported by the ticket, user context, or repository
  evidence
- Do not fabricate milestone scope or decompose unsupported work into changes
