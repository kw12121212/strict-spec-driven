---
name: strict-ticket-dispatch
description: Dispatch a strict YAML ticket by judging whether its requirement is already implemented from specs, code, and docs, then drive the strict ticket CLI to close, promote, or reject it. For promoted tickets, scaffold a standalone strict spec change through the propose command, populate it from the ticket evidence with source-ticket provenance, and link the archived ticket to that change.
metadata:
  skill_id: strict_ticket_dispatch
  author: strict-spec-driven
  type: agent_skill
  version: 2.0.0
---

You are helping the user dispatch a strict YAML ticket. Dispatch answers one
question the CLI deliberately does not: is the requirement's desired observable
outcome already satisfied? That judgment is yours, formed from repository
evidence and recorded as the ticket's dispatch decision. The CLI performs only the
deterministic state transition you decide. Never hand-write ticket YAML or the
tickets index. For a not-implemented decision the ticket is *promoted into a
standalone strict spec change*, not a roadmap milestone: scaffold the change with
`propose`, populate its planning artifacts from the ticket evidence, then resolve
the ticket with `--promoted-to <change-name>` so the archived ticket links to the
change. Resolved tickets are moved to `.strict-spec-driven/tickets/archived/` by
`ticket-resolve`; never move ticket files by hand.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
ticket-list: strict-spec-cli ticket-list
ticket-show: strict-spec-cli ticket-show <ticket-id>
ticket-validate: strict-spec-cli ticket-validate <ticket-id>
ticket-resolve: strict-spec-cli ticket-resolve <ticket-id> --outcome <not_implemented|implemented|not_wanted> --rationale <text> [--promoted-to <change-name>] [--evidence-label <text> --evidence-target <text>]...
propose: strict-spec-cli propose <change-name>
generate: strict-spec-cli generate <change-name> <proposal|design|questions|delta-spec|delta-tech> --<named-args>
ready: strict-spec-cli ready <change-name>
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

When a ticket is promoted into a strict spec change, treat the ticket problem,
desired outcome, intent, dispatch rationale, and evidence links as the change's
intake evidence. Record them in the change's planning artifacts — the source
ticket id and its problem/desired outcome in `proposal.yaml`, the dispatch
rationale and evidence as design context — so a later `/strict-spec-auto` or
`/strict-spec-apply` run can answer change-intake checklist items from that
evidence instead of re-asking the human.

If ticket or repository evidence does not identify affected proposal scope, spec
delta, implementation files, tests, dependencies, or technical standards, record
that uncertainty explicitly as an entry in the change's `questions.yaml.open`
using `preferred_human_language`, with concrete context and a recommended
answer. Do not guess unsupported implementation boundaries. Leaving an open
question is correct: `/strict-spec-auto` and `/strict-spec-apply` stop on open
questions before coding.

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
     ticket plus repository evidence are sufficient to scaffold a concrete
     standalone strict spec change immediately after the decision
   - **not_wanted** — the requirement should be rejected or deferred
   If the evidence is ambiguous, contradictory, the spec coverage is too thin to
   decide confidently, or a not-yet-built requirement lacks enough detail to
   produce a concrete change proposal, do not guess: explain what is unclear and
   defer to the user, leaving the ticket open. Only proceed once you can justify
   the outcome and, for `not_implemented`, can also populate the promoted change
   with concrete proposal scope.

4. **Apply implemented / not_wanted directly** — for these two outcomes there is
   no change to scaffold. Apply the decision only through `ticket-resolve`, never
   by editing ticket YAML. The command records the dispatch decision and moves
   the resolved ticket into `.strict-spec-driven/tickets/archived/`; keep the
   returned `ticketPath` as the auditable ticket location.
   - implemented: `ticket-resolve <id> --outcome implemented --rationale <why>`
     with `--evidence-label`/`--evidence-target` pairs pointing at the
     satisfying specs, code, or docs
   - not_wanted: `ticket-resolve <id> --outcome not_wanted --rationale <why>`
   Then report the outcome (step 7) and stop.

5. **Promote into a strict spec change (not_implemented)** — do this *before*
   resolving the ticket, so a scaffolding failure leaves the ticket open:
   - **Choose a kebab-case change name** derived from the ticket requirement
     (lowercase letters, numbers, and hyphens).
   - **Scaffold the change**: `propose <change-name>`. If the user asks to source
     the work from the roadmap instead, stop and tell them to use
     `/strict-spec-propose-from-roadmap`; this skill only produces standalone
     ticket-backed changes.
   - **Populate the planning artifacts from the ticket evidence** using direct
     CLI invocations, in this order:
     - `generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..."` —
       state the source ticket id and its problem/desired outcome in `why`, and
       make scope concrete and observable
     - `generate <change-name> design --reset --approach "..." --decision <id> --decision-text "..." --rationale "..."` —
       record the dispatch rationale and evidence as design context
     - edit `.strict-spec-driven/changes/<change-name>/tasks.yaml` directly with
       concrete Implementation, Testing (with runnable `command` fields and valid
       `testing_gates`), and Verification tasks
     - `generate <change-name> questions --reset [--open <id> --question "..." --context "..."]` —
       record every unresolved implementation boundary as an open question with a
       recommendation; leave `open: []` only when everything is decidable
     - only when the change has observable main-spec impact,
       `generate <change-name> delta-spec --target-spec <spec-id> --implementation "..." --test "..." --operation ADDED --requirement <id> --strength MUST --statement "..." --scenario <id> --given "..." --when "..." --then "..."`
   - **Do not invent scope, dependencies, or delta specs** unsupported by the
     ticket, user context, or repository evidence. Record genuine ambiguity as an
     open question instead.
   - **Run `ready <change-name>`** and repair any deterministic scaffolding
     blockers it reports.

6. **Resolve the ticket and link it to the change** — once the change is
   scaffolded and populated, archive the ticket and record the link:
   `ticket-resolve <id> --outcome not_implemented --rationale <why> --promoted-to <change-name>`.
   The command sets the ticket status to promoted, records
   `provenance.promoted_to` pointing at the change, and moves the ticket under
   `.strict-spec-driven/tickets/archived/`. It does not create a roadmap
   milestone. Keep the returned `ticketPath` and `promotedTo` for reporting.
   Re-read the archived ticket with `ticket-show <ticket-id>` and confirm
   `provenance.promoted_to` matches the change name.

7. **Report the outcome** — tell the user the decision, the evidence it relied
   on, the resulting ticket status, and the archived ticket path. For a
   promotion, also report the created change name, the planning artifacts you
   populated, any open questions recorded on the change, and recommend
   `/strict-spec-auto <change-name>` (or `/strict-spec-apply <change-name>`) as
   the next step, noting that open questions must be resolved before coding.

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
- Defer to the user and leave the ticket open when evidence is ambiguous or spec
  coverage is too thin to decide confidently — never guess
- For a not_implemented decision, scaffold and populate the strict spec change
  *before* running `ticket-resolve`, then resolve with `--promoted-to
  <change-name>` so the archived ticket links to the change
- Do not create the change's planning artifacts by hand-writing JSON payloads;
  use the `generate` commands and edit `tasks.yaml` directly
- Do not promote a ticket unless you can immediately populate the change with
  concrete proposal scope supported by the ticket, user context, or repository
  evidence
- Do not fabricate change scope, dependencies, or delta specs; record genuine
  ambiguity as an open question on the change instead
- This skill produces only standalone ticket-backed changes; route roadmap-sourced
  work to `/strict-spec-propose-from-roadmap`
