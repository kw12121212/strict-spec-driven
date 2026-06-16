import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import path from "path";
import { createHash } from "crypto";
import { parseYamlFile, stringifyYamlDocument } from "./yaml.js";
import { loadBundledSchemaBySchemaId, validateArtifact, type ValidationDiagnostic } from "./validation.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const TICKETS_DIR = `${STRICT_WORKFLOW_DIR}/tickets`;
const TICKETS_ARCHIVE_DIR = `${TICKETS_DIR}/archived`;
const TICKETS_INDEX_PATH = `${TICKETS_DIR}/INDEX.yaml`;
const TICKET_SCHEMA_ID = "strict-spec-driven/ticket/v1";
const TICKETS_INDEX_SCHEMA_ID = "strict-spec-driven/tickets-index/v1";
const TICKET_STATUSES = ["open", "needs_input", "promoted", "implemented", "rejected"] as const;

export type TicketReference = { label: string; target: string };

export type CreateTicketInput = {
  title: string;
  problem: string;
  desiredOutcome: string;
  intent?: string;
  labels?: string[];
  externalTracker?: TicketReference;
};

export type TicketDispatchDecision = {
  outcome: "not_implemented" | "implemented" | "not_wanted";
  evidence?: TicketReference[];
  rationale: string;
  decided_at: string;
};

export type TicketProvenance = {
  promoted_to?: string;
  implemented_by?: TicketReference[];
};

export type TicketArtifact = {
  schema: string;
  schema_version: number;
  artifact_type: string;
  schema_file: string;
  ticket: { id: string; title: string };
  requirement: { problem: string; desired_outcome: string; intent?: string };
  status: string;
  created_at: string;
  labels?: string[];
  external_tracker?: TicketReference;
  provenance?: TicketProvenance;
  dispatch_decision?: TicketDispatchDecision;
};

export type CreateTicketResult = {
  valid: boolean;
  created: boolean;
  ticketId: string | null;
  path: string | null;
  diagnostics: ValidationDiagnostic[];
};

export type TicketListEntry = { id: string; title: string; status: string; path: string };

export type ListTicketsResult = {
  valid: boolean;
  tickets: TicketListEntry[];
  diagnostics: ValidationDiagnostic[];
};

export type ShowTicketResult = {
  valid: boolean;
  ticketId: string;
  path: string | null;
  ticket: TicketArtifact | null;
  diagnostics: ValidationDiagnostic[];
};

export type ValidateTicketsResult = {
  valid: boolean;
  checkedCount: number;
  diagnostics: ValidationDiagnostic[];
};

export type EditTicketInput = {
  ticketId: string;
  title?: string;
  problem?: string;
  desiredOutcome?: string;
  intent?: string;
  clearIntent?: boolean;
  labels?: string[];
  clearLabels?: boolean;
  externalTracker?: TicketReference;
  clearExternalTracker?: boolean;
};

export type EditTicketResult = {
  valid: boolean;
  edited: boolean;
  ticketId: string;
  path: string | null;
  ticket: TicketArtifact | null;
  diagnostics: ValidationDiagnostic[];
};

function ticketsDir(rootDir: string): string {
  return path.join(rootDir, TICKETS_DIR);
}

function ticketsIndexPath(rootDir: string): string {
  return path.join(rootDir, TICKETS_INDEX_PATH);
}

function ticketsArchiveDir(rootDir: string): string {
  return path.join(rootDir, TICKETS_ARCHIVE_DIR);
}

function ticketFilePath(rootDir: string, ticketId: string): string {
  return path.join(ticketsDir(rootDir), `${ticketId}.yaml`);
}

function archivedTicketFilePath(rootDir: string, ticketId: string): string {
  return path.join(ticketsArchiveDir(rootDir), `${ticketId}.yaml`);
}

function findTicketFilePath(rootDir: string, ticketId: string): string | null {
  const activePath = ticketFilePath(rootDir, ticketId);
  if (existsSync(activePath)) {
    return activePath;
  }
  const archivePath = archivedTicketFilePath(rootDir, ticketId);
  return existsSync(archivePath) ? archivePath : null;
}

function repoRelative(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "ticket";
}

function contentHash(input: CreateTicketInput): string {
  return createHash("sha256")
    .update([input.title, input.problem, input.desiredOutcome].join("\u0000"))
    .digest("hex")
    .slice(0, 6);
}

/**
 * Conflict-resistant, content-derived ticket id: a slug of the title plus a short
 * hash of the requirement content. Never drawn from a shared sequential counter,
 * so concurrent multi-author intake does not collide on a global number, and the
 * same requirement always resolves to the same id (making create idempotent).
 */
export function deriveTicketId(input: CreateTicketInput): string {
  return `${slugify(input.title)}-${contentHash(input)}`;
}

function makeDiagnostic(message: string, fieldPath = "$"): ValidationDiagnostic {
  return {
    source: "schema",
    artifactPath: TICKETS_DIR,
    fieldPath,
    message,
  };
}

function listTicketFiles(rootDir: string): string[] {
  const dir = ticketsDir(rootDir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml") && name !== "INDEX.yaml")
    .map((name) => path.join(dir, name))
    .sort();
}

function listArchivedTicketFiles(rootDir: string): string[] {
  const dir = ticketsArchiveDir(rootDir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml") && name !== "INDEX.yaml")
    .map((name) => path.join(dir, name))
    .sort();
}

function buildTicketArtifact(input: CreateTicketInput, ticketId: string): TicketArtifact {
  const artifact: TicketArtifact = {
    schema: TICKET_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "ticket",
    schema_file: "templates/strict-spec-driven/schemas/ticket.yaml",
    ticket: { id: ticketId, title: input.title },
    requirement: {
      problem: input.problem,
      desired_outcome: input.desiredOutcome,
    },
    status: "open",
    created_at: new Date().toISOString(),
  };
  if (input.intent && input.intent.length > 0) {
    artifact.requirement.intent = input.intent;
  }
  if (input.labels && input.labels.length > 0) {
    artifact.labels = [...input.labels];
  }
  if (input.externalTracker) {
    artifact.external_tracker = input.externalTracker;
  }
  return artifact;
}

/**
 * Rebuilds .strict-spec-driven/tickets/INDEX.yaml deterministically from the
 * tickets on disk, so the index always reflects canonical ticket state and is
 * stable across reruns regardless of creation order.
 */
export function rebuildTicketsIndex(rootDir: string): void {
  const tickets: Record<string, { title: string; path: string; status: string }> = {};
  for (const filePath of listTicketFiles(rootDir)) {
    const artifact = parseYamlFile<TicketArtifact>(filePath);
    const ticketId = artifact?.ticket?.id;
    if (typeof ticketId !== "string" || ticketId.length === 0) {
      continue;
    }
    tickets[ticketId] = {
      title: artifact.ticket.title,
      path: repoRelative(rootDir, filePath),
      status: artifact.status,
    };
  }

  const sorted: Record<string, { title: string; path: string; status: string }> = {};
  for (const ticketId of Object.keys(tickets).sort()) {
    sorted[ticketId] = tickets[ticketId];
  }

  const indexArtifact = {
    schema: TICKETS_INDEX_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "tickets_index",
    schema_file: "templates/strict-spec-driven/schemas/tickets-index.yaml",
    tickets: sorted,
  };

  mkdirSync(ticketsDir(rootDir), { recursive: true });
  writeFileSync(ticketsIndexPath(rootDir), stringifyYamlDocument(indexArtifact), "utf8");
}

/**
 * Creates a ticket from a pure requirement with a conflict-resistant generated
 * id and initial open status, maintaining the tickets index. Idempotent: if the
 * derived id already exists, existing ticket state is left untouched.
 */
export function createTicket(rootDir: string, input: CreateTicketInput): CreateTicketResult {
  const diagnostics: ValidationDiagnostic[] = [];
  if (!input.title || input.title.trim().length === 0) {
    diagnostics.push(makeDiagnostic("ticket title is required", "$.ticket.title"));
  }
  if (!input.problem || input.problem.trim().length === 0) {
    diagnostics.push(makeDiagnostic("ticket requirement problem is required", "$.requirement.problem"));
  }
  if (!input.desiredOutcome || input.desiredOutcome.trim().length === 0) {
    diagnostics.push(makeDiagnostic("ticket requirement desired_outcome is required", "$.requirement.desired_outcome"));
  }
  if (diagnostics.length > 0) {
    return { valid: false, created: false, ticketId: null, path: null, diagnostics };
  }

  const ticketId = deriveTicketId(input);
  const filePath = ticketFilePath(rootDir, ticketId);
  const existingPath = findTicketFilePath(rootDir, ticketId);

  if (existingPath) {
    return {
      valid: true,
      created: false,
      ticketId,
      path: repoRelative(rootDir, existingPath),
      diagnostics: [],
    };
  }

  const artifact = buildTicketArtifact(input, ticketId);
  const schema = loadBundledSchemaBySchemaId(TICKET_SCHEMA_ID);
  const validation = validateArtifact(schema, artifact, repoRelative(rootDir, filePath));
  if (!validation.valid) {
    return { valid: false, created: false, ticketId, path: null, diagnostics: validation.diagnostics };
  }

  mkdirSync(ticketsDir(rootDir), { recursive: true });
  writeFileSync(filePath, stringifyYamlDocument(artifact), "utf8");
  rebuildTicketsIndex(rootDir);

  return {
    valid: true,
    created: true,
    ticketId,
    path: repoRelative(rootDir, filePath),
    diagnostics: [],
  };
}

export function listTickets(rootDir: string): ListTicketsResult {
  const entries: TicketListEntry[] = [];
  for (const filePath of listTicketFiles(rootDir)) {
    const artifact = parseYamlFile<TicketArtifact>(filePath);
    const ticketId = artifact?.ticket?.id;
    if (typeof ticketId !== "string" || ticketId.length === 0) {
      continue;
    }
    entries.push({
      id: ticketId,
      title: artifact.ticket.title,
      status: artifact.status,
      path: repoRelative(rootDir, filePath),
    });
  }
  entries.sort((left, right) => left.id.localeCompare(right.id));
  return { valid: true, tickets: entries, diagnostics: [] };
}

export function ticketPath(rootDir: string, ticketId: string): string {
  return findTicketFilePath(rootDir, ticketId) ?? ticketFilePath(rootDir, ticketId);
}

export function readTicketArtifact(rootDir: string, ticketId: string): TicketArtifact | null {
  const filePath = findTicketFilePath(rootDir, ticketId);
  if (!filePath) {
    return null;
  }
  return parseYamlFile<TicketArtifact>(filePath);
}

/** Writes a ticket artifact to its canonical file and refreshes the tickets index. */
export function writeTicketArtifact(rootDir: string, artifact: TicketArtifact): string {
  const filePath = ticketFilePath(rootDir, artifact.ticket.id);
  mkdirSync(ticketsDir(rootDir), { recursive: true });
  writeFileSync(filePath, stringifyYamlDocument(artifact), "utf8");
  rebuildTicketsIndex(rootDir);
  return repoRelative(rootDir, filePath);
}

/**
 * Edits the editable fields of an existing active ticket. Operates only on the
 * active ticket file: a ticket that resolves only to the archived directory is a
 * resolved audit record and is refused rather than edited. The ticket id,
 * created_at, status, provenance, and dispatch_decision are never touched — the
 * content-derived id is allocated once at creation and is not re-derived here, so
 * edits never rename the file or break promotion/evidence links. The resulting
 * artifact is validated against the ticket schema before it is written, and the
 * tickets index is rebuilt so a changed title stays in sync.
 */
export function editTicket(rootDir: string, input: EditTicketInput): EditTicketResult {
  const activePath = ticketFilePath(rootDir, input.ticketId);
  if (!existsSync(activePath)) {
    const archivePath = archivedTicketFilePath(rootDir, input.ticketId);
    const message = existsSync(archivePath)
      ? `ticket '${input.ticketId}' is resolved and archived; it cannot be edited`
      : `ticket '${input.ticketId}' not found`;
    return { valid: false, edited: false, ticketId: input.ticketId, path: null, ticket: null, diagnostics: [makeDiagnostic(message, "$.ticket.id")] };
  }

  const artifact = parseYamlFile<TicketArtifact>(activePath);

  if (input.title !== undefined) {
    artifact.ticket.title = input.title;
  }
  if (input.problem !== undefined) {
    artifact.requirement.problem = input.problem;
  }
  if (input.desiredOutcome !== undefined) {
    artifact.requirement.desired_outcome = input.desiredOutcome;
  }
  if (input.clearIntent) {
    delete artifact.requirement.intent;
  } else if (input.intent !== undefined) {
    artifact.requirement.intent = input.intent;
  }
  if (input.clearLabels) {
    delete artifact.labels;
  } else if (input.labels !== undefined) {
    artifact.labels = [...input.labels];
  }
  if (input.clearExternalTracker) {
    delete artifact.external_tracker;
  } else if (input.externalTracker !== undefined) {
    artifact.external_tracker = input.externalTracker;
  }

  const schema = loadBundledSchemaBySchemaId(TICKET_SCHEMA_ID);
  const validation = validateArtifact(schema, artifact, repoRelative(rootDir, activePath));
  if (!validation.valid) {
    return { valid: false, edited: false, ticketId: input.ticketId, path: null, ticket: null, diagnostics: validation.diagnostics };
  }

  const writtenPath = writeTicketArtifact(rootDir, artifact);
  return { valid: true, edited: true, ticketId: input.ticketId, path: writtenPath, ticket: artifact, diagnostics: [] };
}

/** Writes a resolved ticket to the archived directory and removes it from active ticket state. */
export function archiveTicketArtifact(rootDir: string, artifact: TicketArtifact): string {
  const archivePath = archivedTicketFilePath(rootDir, artifact.ticket.id);
  const activePath = ticketFilePath(rootDir, artifact.ticket.id);
  mkdirSync(ticketsArchiveDir(rootDir), { recursive: true });
  writeFileSync(archivePath, stringifyYamlDocument(artifact), "utf8");
  if (existsSync(activePath)) {
    rmSync(activePath, { force: true });
  }
  rebuildTicketsIndex(rootDir);
  return repoRelative(rootDir, archivePath);
}

export function showTicket(rootDir: string, ticketId: string): ShowTicketResult {
  const filePath = findTicketFilePath(rootDir, ticketId);
  if (!filePath) {
    return {
      valid: false,
      ticketId,
      path: null,
      ticket: null,
      diagnostics: [makeDiagnostic(`ticket '${ticketId}' not found`, "$.ticket.id")],
    };
  }
  const ticket = parseYamlFile<TicketArtifact>(filePath);
  return {
    valid: true,
    ticketId,
    path: repoRelative(rootDir, filePath),
    ticket,
    diagnostics: [],
  };
}

/**
 * Validates one ticket (when ticketId is provided) or every ticket plus the
 * tickets index against the bundled schemas with path-aware diagnostics.
 */
export function validateTickets(rootDir: string, ticketId?: string): ValidateTicketsResult {
  const ticketSchema = loadBundledSchemaBySchemaId(TICKET_SCHEMA_ID);
  const diagnostics: ValidationDiagnostic[] = [];
  let checkedCount = 0;

  const foundTicketPath = ticketId ? findTicketFilePath(rootDir, ticketId) : null;
  const targetFiles = ticketId
    ? [foundTicketPath ?? ticketFilePath(rootDir, ticketId)]
    : [...listTicketFiles(rootDir), ...listArchivedTicketFiles(rootDir)];

  for (const filePath of targetFiles) {
    if (!existsSync(filePath)) {
      diagnostics.push(makeDiagnostic(`ticket '${ticketId}' not found`, "$.ticket.id"));
      continue;
    }
    const artifact = parseYamlFile<unknown>(filePath);
    const result = validateArtifact(ticketSchema, artifact, repoRelative(rootDir, filePath));
    diagnostics.push(...result.diagnostics);
    checkedCount += 1;
  }

  if (!ticketId) {
    const indexPath = ticketsIndexPath(rootDir);
    if (existsSync(indexPath)) {
      const indexSchema = loadBundledSchemaBySchemaId(TICKETS_INDEX_SCHEMA_ID);
      const indexArtifact = parseYamlFile<unknown>(indexPath);
      const indexResult = validateArtifact(indexSchema, indexArtifact, repoRelative(rootDir, indexPath));
      diagnostics.push(...indexResult.diagnostics);
    }
  }

  return { valid: diagnostics.length === 0, checkedCount, diagnostics };
}

export { TICKET_STATUSES, TICKETS_ARCHIVE_DIR, TICKETS_DIR, TICKETS_INDEX_PATH };
