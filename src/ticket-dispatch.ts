import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import { parseYamlFile, stringifyYamlDocument } from "./yaml.js";
import { cloneDefaultMilestoneIntakeQuestions } from "./roadmap/model.js";
import { loadBundledSchemaBySchemaId, validateArtifact, type ValidationDiagnostic } from "./validation.js";
import {
  archiveTicketArtifact,
  readTicketArtifact,
  type TicketArtifact,
  type TicketDispatchDecision,
  type TicketProvenance,
  type TicketReference,
} from "./tickets.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const ROADMAP_INDEX_PATH = `${STRICT_WORKFLOW_DIR}/roadmap/INDEX.yaml`;
const ROADMAP_MILESTONES_DIR = `${STRICT_WORKFLOW_DIR}/roadmap/milestones`;
const MILESTONE_SCHEMA_ID = "strict-spec-driven/roadmap-milestone/v2";
const ROADMAP_INDEX_SCHEMA_ID = "strict-spec-driven/roadmap-index/v2";
const REFINEMENT_STUB_PREFIX = "REFINEMENT NEEDED";

export type DispatchOutcome = "not_implemented" | "implemented" | "not_wanted";

export type ResolveTicketInput = {
  ticketId: string;
  outcome: DispatchOutcome;
  rationale: string;
  evidence?: TicketReference[];
};

export type ResolveTicketResult = {
  valid: boolean;
  ticketId: string;
  status: string | null;
  outcome: DispatchOutcome | null;
  ticketPath: string | null;
  milestoneId: string | null;
  milestonePath: string | null;
  milestoneCreated: boolean;
  diagnostics: ValidationDiagnostic[];
};

type RoadmapIndexArtifact = {
  schema: string;
  schema_version: number;
  artifact_type: string;
  schema_file: string;
  milestones: Record<string, { title: string; path: string; status: string }>;
};

function repoRelative(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function diagnostic(message: string, artifactPath: string, fieldPath = "$"): ValidationDiagnostic {
  return { source: "schema", artifactPath, fieldPath, message };
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "milestone";
}

function milestonesDir(rootDir: string): string {
  return path.join(rootDir, ROADMAP_MILESTONES_DIR);
}

function listMilestoneFiles(rootDir: string): string[] {
  const dir = milestonesDir(rootDir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml") && name !== "INDEX.yaml")
    .map((name) => path.join(dir, name))
    .sort();
}

/** Finds an existing milestone already promoted from this ticket, so promotion is idempotent. */
function findMilestoneBySourceTicket(rootDir: string, ticketId: string): { id: string; path: string } | null {
  for (const filePath of listMilestoneFiles(rootDir)) {
    const artifact = parseYamlFile<{ milestone?: Record<string, unknown>; source_ticket?: string }>(filePath);
    if (artifact?.source_ticket === ticketId) {
      const id = Object.keys(artifact.milestone ?? {})[0];
      if (id) {
        return { id, path: repoRelative(rootDir, filePath) };
      }
    }
  }
  return null;
}

function readRoadmapIndex(rootDir: string): RoadmapIndexArtifact {
  const indexPath = path.join(rootDir, ROADMAP_INDEX_PATH);
  return parseYamlFile<RoadmapIndexArtifact>(indexPath);
}

/**
 * Allocates the next 4-digit milestone number deterministically from both the
 * roadmap index keys and the milestone files on disk, so a fresh promotion never
 * reuses or overwrites an existing milestone number.
 */
function allocateNextMilestoneNumber(rootDir: string, index: RoadmapIndexArtifact): number {
  let max = 0;
  const consider = (key: string): void => {
    const match = /^(\d{4})-/.exec(key);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  };
  for (const key of Object.keys(index.milestones ?? {})) {
    consider(key);
  }
  for (const filePath of listMilestoneFiles(rootDir)) {
    consider(path.basename(filePath, ".yaml"));
  }
  return max + 1;
}

function buildMilestoneSkeleton(milestoneId: string, ticket: TicketArtifact): Record<string, unknown> {
  const stub = `${REFINEMENT_STUB_PREFIX}: define this for the milestone promoted from ticket '${ticket.ticket.id}' (run /strict-roadmap-milestone to refine before treating it as executable)`;
  return {
    schema: MILESTONE_SCHEMA_ID,
    schema_version: 2,
    artifact_type: "roadmap_milestone",
    schema_file: "templates/strict-spec-driven/schemas/roadmap-milestone.yaml",
    milestone: {
      [milestoneId]: { title: ticket.ticket.title },
    },
    goal: ticket.requirement.desired_outcome,
    scope: {
      in: [stub],
      out: [stub],
    },
    done_criteria: [stub],
    intake_questions: cloneDefaultMilestoneIntakeQuestions(),
    planned_changes: {},
    dependencies: [],
    risks: [],
    status: "proposed",
    notes: [`Promoted from ticket '${ticket.ticket.id}'.`],
    source_ticket: ticket.ticket.id,
  };
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
    milestoneId: null,
    milestonePath: null,
    milestoneCreated: false,
    diagnostics,
  };
}

/**
 * Records a supplied dispatch decision onto a ticket and performs the deterministic
 * transition only. The CLI never judges whether a requirement is implemented; it
 * applies the outcome the caller decided:
 *   - not_implemented -> promote the ticket into a new roadmap milestone skeleton
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
      milestoneId: null,
      milestonePath: null,
      milestoneCreated: false,
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
      milestoneId: null,
      milestonePath: null,
      milestoneCreated: false,
      diagnostics: [],
    };
  }

  // not_implemented -> promote into a new roadmap milestone skeleton, then archive the ticket.
  const existing = findMilestoneBySourceTicket(rootDir, input.ticketId);
  if (existing) {
    // Idempotent: a milestone was already promoted from this ticket; do not create a second one.
    applyDispatchDecision(ticket, input);
    ticket.status = "promoted";
    ticket.provenance = { ...(ticket.provenance ?? {}), promoted_to: existing.id };
    const ticketPath = archiveTicketArtifact(rootDir, ticket);
    return {
      valid: true,
      ticketId: input.ticketId,
      status: "promoted",
      outcome: input.outcome,
      ticketPath,
      milestoneId: existing.id,
      milestonePath: existing.path,
      milestoneCreated: false,
      diagnostics: [],
    };
  }

  const indexPath = path.join(rootDir, ROADMAP_INDEX_PATH);
  if (!existsSync(indexPath)) {
    return failure(input.ticketId, [diagnostic("roadmap index not found; cannot promote ticket", ROADMAP_INDEX_PATH)]);
  }
  const index = readRoadmapIndex(rootDir);
  const number = allocateNextMilestoneNumber(rootDir, index);
  const milestoneId = `${String(number).padStart(4, "0")}-${slugify(ticket.ticket.title)}`;
  const milestoneFile = path.join(milestonesDir(rootDir), `${milestoneId}.yaml`);
  const milestoneRepoPath = repoRelative(rootDir, milestoneFile);

  if (existsSync(milestoneFile) || milestoneId in (index.milestones ?? {})) {
    return failure(input.ticketId, [
      diagnostic(`milestone '${milestoneId}' already exists; refusing to overwrite on promotion`, milestoneRepoPath),
    ]);
  }

  const milestoneArtifact = buildMilestoneSkeleton(milestoneId, ticket);
  const milestoneSchema = loadBundledSchemaBySchemaId(MILESTONE_SCHEMA_ID);
  const milestoneValidation = validateArtifact(milestoneSchema, milestoneArtifact, milestoneRepoPath);
  if (!milestoneValidation.valid) {
    return failure(input.ticketId, milestoneValidation.diagnostics);
  }

  const nextIndex: RoadmapIndexArtifact = {
    ...index,
    milestones: {
      ...index.milestones,
      [milestoneId]: {
        title: ticket.ticket.title,
        path: `roadmap/milestones/${milestoneId}.yaml`,
        status: "proposed",
      },
    },
  };
  const sortedMilestones: RoadmapIndexArtifact["milestones"] = {};
  for (const key of Object.keys(nextIndex.milestones).sort()) {
    sortedMilestones[key] = nextIndex.milestones[key];
  }
  nextIndex.milestones = sortedMilestones;

  const indexSchema = loadBundledSchemaBySchemaId(ROADMAP_INDEX_SCHEMA_ID);
  const indexValidation = validateArtifact(indexSchema, nextIndex, repoRelative(rootDir, indexPath));
  if (!indexValidation.valid) {
    return failure(input.ticketId, indexValidation.diagnostics);
  }

  // All artifacts validated; write milestone, index, then ticket links.
  mkdirSync(milestonesDir(rootDir), { recursive: true });
  writeFileSync(milestoneFile, stringifyYamlDocument(milestoneArtifact), "utf8");
  writeFileSync(indexPath, stringifyYamlDocument(nextIndex), "utf8");

  applyDispatchDecision(ticket, input);
  ticket.status = "promoted";
  ticket.provenance = { ...(ticket.provenance ?? {}), promoted_to: milestoneId };
  const ticketPath = archiveTicketArtifact(rootDir, ticket);

  return {
    valid: true,
    ticketId: input.ticketId,
    status: "promoted",
    outcome: input.outcome,
    ticketPath,
    milestoneId,
    milestonePath: milestoneRepoPath,
    milestoneCreated: true,
    diagnostics: [],
  };
}
