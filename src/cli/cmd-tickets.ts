import { createTicket, listTickets, showTicket, validateTickets, type CreateTicketInput, type TicketReference } from "../tickets.js";
import { resolveTicket, type ResolveTicketInput, type TriageOutcome } from "../ticket-triage.js";
import { isHelpRequest } from "./argv.js";
import { writeHelp, writeJson, writeUsage } from "./output.js";

const TRIAGE_OUTCOMES = new Set<TriageOutcome>(["not_implemented", "implemented", "not_wanted"]);

type FlagMap = Record<string, string[]>;

function parseFlagMap(argv: string[]): FlagMap {
  const flags: FlagMap = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token.length === 2) {
      throw new Error(`unexpected argument '${token}'`);
    }
    const name = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for --${name}`);
    }
    flags[name] ??= [];
    flags[name].push(value);
    index += 1;
  }
  return flags;
}

function ensureAllowedFlags(flags: FlagMap, allowed: string[]): void {
  const allowedSet = new Set(allowed);
  const unsupported = Object.keys(flags).filter((flag) => !allowedSet.has(flag));
  if (unsupported.length > 0) {
    throw new Error(`unsupported argument(s): ${unsupported.map((flag) => `--${flag}`).join(", ")}`);
  }
}

function singleValue(flags: FlagMap, name: string): string | undefined {
  const values = flags[name];
  return values && values.length > 0 ? values[values.length - 1] : undefined;
}

function parseExternalTracker(flags: FlagMap): TicketReference | undefined {
  const label = singleValue(flags, "external-label");
  const target = singleValue(flags, "external-target");
  if (label === undefined && target === undefined) {
    return undefined;
  }
  if (label === undefined || target === undefined) {
    throw new Error("--external-label and --external-target must be provided together");
  }
  return { label, target };
}

export function runTicketCreate(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(
      "Usage: strict-spec-driven ticket-create --title <text> --problem <text> --desired-outcome <text> [--intent <text>] [--label <text>]... [--external-label <text> --external-target <text>]\n",
    );
    return 0;
  }

  let flags: FlagMap;
  try {
    flags = parseFlagMap(argv);
    ensureAllowedFlags(flags, ["title", "problem", "desired-outcome", "intent", "label", "external-label", "external-target"]);
  } catch (error) {
    writeUsage(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const title = singleValue(flags, "title");
  const problem = singleValue(flags, "problem");
  const desiredOutcome = singleValue(flags, "desired-outcome");
  if (title === undefined || problem === undefined || desiredOutcome === undefined) {
    writeUsage("Error: --title, --problem, and --desired-outcome are required\n");
    return 1;
  }

  const input: CreateTicketInput = {
    title,
    problem,
    desiredOutcome,
    intent: singleValue(flags, "intent"),
    labels: flags.label,
    externalTracker: undefined,
  };
  try {
    input.externalTracker = parseExternalTracker(flags);
  } catch (error) {
    writeUsage(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const result = createTicket(process.cwd(), input);
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runTicketList(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven ticket-list\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-driven ticket-list\n");
    return 1;
  }

  const result = listTickets(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runTicketShow(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven ticket-show <ticket-id>\n");
    return 0;
  }
  if (argv.length !== 1 || argv[0].startsWith("--")) {
    writeUsage("Usage: strict-spec-driven ticket-show <ticket-id>\n");
    return 1;
  }

  const result = showTicket(process.cwd(), argv[0]);
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runTicketValidate(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven ticket-validate [<ticket-id>]\n");
    return 0;
  }
  if (argv.length > 1 || (argv.length === 1 && argv[0].startsWith("--"))) {
    writeUsage("Usage: strict-spec-driven ticket-validate [<ticket-id>]\n");
    return 1;
  }

  const result = validateTickets(process.cwd(), argv[0]);
  writeJson(result);
  return result.valid ? 0 : 1;
}

function parseEvidence(flags: FlagMap): TicketReference[] {
  const labels = flags["evidence-label"] ?? [];
  const targets = flags["evidence-target"] ?? [];
  if (labels.length !== targets.length) {
    throw new Error("each --evidence-label must be paired with an --evidence-target");
  }
  return labels.map((label, index) => ({ label, target: targets[index] }));
}

export function runTicketResolve(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(
      "Usage: strict-spec-driven ticket-resolve <ticket-id> --outcome <not_implemented|implemented|not_wanted> --rationale <text> [--evidence-label <text> --evidence-target <text>]...\n",
    );
    return 0;
  }

  if (argv.length === 0 || argv[0].startsWith("--")) {
    writeUsage("Usage: strict-spec-driven ticket-resolve <ticket-id> --outcome <not_implemented|implemented|not_wanted> --rationale <text> [--evidence-label <text> --evidence-target <text>]...\n");
    return 1;
  }
  const ticketId = argv[0];

  let flags: FlagMap;
  let evidence: TicketReference[];
  try {
    flags = parseFlagMap(argv.slice(1));
    ensureAllowedFlags(flags, ["outcome", "rationale", "evidence-label", "evidence-target"]);
    evidence = parseEvidence(flags);
  } catch (error) {
    writeUsage(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const outcome = singleValue(flags, "outcome");
  const rationale = singleValue(flags, "rationale");
  if (outcome === undefined || !TRIAGE_OUTCOMES.has(outcome as TriageOutcome)) {
    writeUsage("Error: --outcome must be one of not_implemented, implemented, not_wanted\n");
    return 1;
  }
  if (rationale === undefined) {
    writeUsage("Error: --rationale is required\n");
    return 1;
  }

  const input: ResolveTicketInput = {
    ticketId,
    outcome: outcome as TriageOutcome,
    rationale,
    evidence,
  };
  const result = resolveTicket(process.cwd(), input);
  writeJson(result);
  return result.valid ? 0 : 1;
}
