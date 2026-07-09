import { type ValidationDiagnostic } from "./validation.js";
import {
  archiveTicketArtifact,
  readTicketArtifact,
  type TicketArtifact,
  type TicketDispatchDecision,
  type TicketProvenance,
  type TicketReference,
} from "./tickets.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";

export type DispatchOutcome = "not_implemented" | "implemented" | "not_wanted";

export type ResolveTicketInput = {
  ticketId: string;
  outcome: DispatchOutcome;
  rationale: string;
  evidence?: TicketReference[];
  /**
   * For a not_implemented (promote) decision, the name of the strict spec change
   * the dispatch skill scaffolded for this ticket. Recorded as provenance.promoted_to
   * when supplied. The CLI never scaffolds the change itself; the skill owns that.
   */
  promotedTo?: string;
};

export type ResolveTicketResult = {
  valid: boolean;
  ticketId: string;
  status: string | null;
  outcome: DispatchOutcome | null;
  ticketPath: string | null;
  /** For a promote decision, the strict change name linked to the ticket, or null when none was supplied. */
  promotedTo: string | null;
  diagnostics: ValidationDiagnostic[];
};

function diagnostic(message: string, artifactPath: string, fieldPath = "$"): ValidationDiagnostic {
  return { source: "schema", artifactPath, fieldPath, message };
}

function applyDispatchDecision(ticket: TicketArtifact, input: ResolveTicketInput): TicketDispatchDecision {
  const decision: TicketDispatchDecision = {
    outcome: input.outcome,
    rationale: input.rationale,
    decided_at: new Date().toISOString(),
  };
  if (input.evidence && input.evidence.length > 0) {
    decision.evidence = input.evidence;
  }
  ticket.dispatch_decision = decision;
  return decision;
}

function failure(ticketId: string, diagnostics: ValidationDiagnostic[]): ResolveTicketResult {
  return {
    valid: false,
    ticketId,
    status: null,
    outcome: null,
    ticketPath: null,
    promotedTo: null,
    diagnostics,
  };
}

/**
 * Records a supplied dispatch decision onto a ticket and performs the deterministic
 * transition only. The CLI never judges whether a requirement is implemented; it
 * applies the outcome the caller decided:
 *   - not_implemented -> promote the ticket into a strict spec change: record the
 *     promoted decision, link provenance.promoted_to to the change the dispatch
 *     skill scaffolded (when supplied), and archive the ticket. The CLI does not
 *     scaffold the change itself.
 *   - implemented     -> close the ticket with evidence links
 *   - not_wanted      -> reject/defer the ticket with the recorded rationale
 * Resolved tickets are archived after their dispatch decision is recorded.
 */
export function resolveTicket(rootDir: string, input: ResolveTicketInput): ResolveTicketResult {
  const ticket = readTicketArtifact(rootDir, input.ticketId);
  if (!ticket) {
    return failure(input.ticketId, [diagnostic(`ticket '${input.ticketId}' not found`, STRICT_WORKFLOW_DIR, "$.ticket.id")]);
  }
  if (!input.rationale || input.rationale.trim().length === 0) {
    return failure(input.ticketId, [diagnostic("dispatch rationale is required", STRICT_WORKFLOW_DIR, "$.dispatch_decision.rationale")]);
  }

  if (input.outcome === "implemented") {
    applyDispatchDecision(ticket, input);
    ticket.status = "implemented";
    if (input.evidence && input.evidence.length > 0) {
      const provenance: TicketProvenance = ticket.provenance ?? {};
      provenance.implemented_by = input.evidence;
      ticket.provenance = provenance;
    }
    const ticketPath = archiveTicketArtifact(rootDir, ticket);
    return {
      valid: true,
      ticketId: input.ticketId,
      status: "implemented",
      outcome: input.outcome,
      ticketPath,
      promotedTo: null,
      diagnostics: [],
    };
  }

  if (input.outcome === "not_wanted") {
    applyDispatchDecision(ticket, input);
    ticket.status = "rejected";
    const ticketPath = archiveTicketArtifact(rootDir, ticket);
    return {
      valid: true,
      ticketId: input.ticketId,
      status: "rejected",
      outcome: input.outcome,
      ticketPath,
      promotedTo: null,
      diagnostics: [],
    };
  }

  // not_implemented -> promote into a strict spec change, then archive the ticket.
  // The dispatch skill scaffolds and populates the change through `propose`; the CLI
  // only records the promoted transition and the ticket -> change link.
  const promotedTo = input.promotedTo && input.promotedTo.trim().length > 0 ? input.promotedTo.trim() : null;
  applyDispatchDecision(ticket, input);
  ticket.status = "promoted";
  if (promotedTo) {
    ticket.provenance = { ...(ticket.provenance ?? {}), promoted_to: promotedTo };
  }
  const ticketPath = archiveTicketArtifact(rootDir, ticket);

  return {
    valid: true,
    ticketId: input.ticketId,
    status: "promoted",
    outcome: input.outcome,
    ticketPath,
    promotedTo,
    diagnostics: [],
  };
}
