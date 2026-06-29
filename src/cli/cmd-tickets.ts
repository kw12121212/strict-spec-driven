import { createTicket, editTicket, listTickets, showTicket, validateTickets, type CreateTicketInput, type EditTicketInput, type TicketReference } from "../tickets.js";
import { resolveTicket, type DispatchOutcome, type ResolveTicketInput } from "../ticket-dispatch.js";
import { isHelpRequest } from "./argv.js";
import { writeHelp, writeJson, writeUsage } from "./output.js";

const DISPATCH_OUTCOMES = new Set<DispatchOutcome>(["not_implemented", "implemented", "not_wanted"]);

type FlagMap = Record<string, string[]>;

function parseFlagMap(argv: string[], booleanFlags: Set<string> = new Set()): FlagMap {
  const flags: FlagMap = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token.length === 2) {
      throw new Error(`unexpected argument '${token}'`);
    }
    const name = token.slice(2);
    if (booleanFlags.has(name)) {
      flags[name] ??= [];
      flags[name].push("true");
      continue;
    }
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
      "Usage: strict-spec-cli ticket-create --title <text> --problem <text> --desired-outcome <text> [--intent <text>] [--label <text>]... [--external-label <text> --external-target <text>]\n",
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
    writeHelp("Usage: strict-spec-cli ticket-list\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-cli ticket-list\n");
    return 1;
  }

  const result = listTickets(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runTicketShow(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-cli ticket-show <ticket-id>\n");
    return 0;
  }
  if (argv.length !== 1 || argv[0].startsWith("--")) {
    writeUsage("Usage: strict-spec-cli ticket-show <ticket-id>\n");
    return 1;
  }

  const result = showTicket(process.cwd(), argv[0]);
  writeJson(result);
  return result.valid ? 0 : 1;
}

const EDIT_BOOLEAN_FLAGS = new Set(["clear-intent", "clear-labels", "clear-external-tracker"]);
const EDIT_USAGE =
  "Usage: strict-spec-cli ticket-edit <ticket-id> [--title <text>] [--problem <text>] [--desired-outcome <text>] [--intent <text> | --clear-intent] [--label <text>]... | --clear-labels [--external-label <text> --external-target <text> | --clear-external-tracker]\n";

export function runTicketEdit(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(EDIT_USAGE);
    return 0;
  }
  if (argv.length === 0 || argv[0].startsWith("--")) {
    writeUsage(EDIT_USAGE);
    return 1;
  }
  const ticketId = argv[0];

  let flags: FlagMap;
  try {
    flags = parseFlagMap(argv.slice(1), EDIT_BOOLEAN_FLAGS);
    ensureAllowedFlags(flags, [
      "title",
      "problem",
      "desired-outcome",
      "intent",
      "clear-intent",
      "label",
      "clear-labels",
      "external-label",
      "external-target",
      "clear-external-tracker",
    ]);
  } catch (error) {
    writeUsage(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const hasFlag = (name: string): boolean => name in flags;
  if (Object.keys(flags).length === 0) {
    writeUsage("Error: ticket-edit requires at least one editable field\n");
    return 1;
  }

  if (hasFlag("intent") && hasFlag("clear-intent")) {
    writeUsage("Error: --intent and --clear-intent cannot be combined\n");
    return 1;
  }
  if (hasFlag("label") && hasFlag("clear-labels")) {
    writeUsage("Error: --label and --clear-labels cannot be combined\n");
    return 1;
  }
  if ((hasFlag("external-label") || hasFlag("external-target")) && hasFlag("clear-external-tracker")) {
    writeUsage("Error: --external-label/--external-target and --clear-external-tracker cannot be combined\n");
    return 1;
  }

  for (const flag of ["title", "problem", "desired-outcome", "intent"]) {
    const value = singleValue(flags, flag);
    if (value !== undefined && value.trim().length === 0) {
      writeUsage(`Error: --${flag} must not be blank\n`);
      return 1;
    }
  }

  const input: EditTicketInput = { ticketId };
  if (hasFlag("title")) {
    input.title = singleValue(flags, "title");
  }
  if (hasFlag("problem")) {
    input.problem = singleValue(flags, "problem");
  }
  if (hasFlag("desired-outcome")) {
    input.desiredOutcome = singleValue(flags, "desired-outcome");
  }
  if (hasFlag("clear-intent")) {
    input.clearIntent = true;
  } else if (hasFlag("intent")) {
    input.intent = singleValue(flags, "intent");
  }
  if (hasFlag("clear-labels")) {
    input.clearLabels = true;
  } else if (hasFlag("label")) {
    input.labels = flags.label;
  }
  if (hasFlag("clear-external-tracker")) {
    input.clearExternalTracker = true;
  } else {
    try {
      input.externalTracker = parseExternalTracker(flags);
    } catch (error) {
      writeUsage(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  const result = editTicket(process.cwd(), input);
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runTicketValidate(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-cli ticket-validate [<ticket-id>]\n");
    return 0;
  }
  if (argv.length > 1 || (argv.length === 1 && argv[0].startsWith("--"))) {
    writeUsage("Usage: strict-spec-cli ticket-validate [<ticket-id>]\n");
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
      "Usage: strict-spec-cli ticket-resolve <ticket-id> --outcome <not_implemented|implemented|not_wanted> --rationale <text> [--evidence-label <text> --evidence-target <text>]...\n",
    );
    return 0;
  }

  if (argv.length === 0 || argv[0].startsWith("--")) {
    writeUsage("Usage: strict-spec-cli ticket-resolve <ticket-id> --outcome <not_implemented|implemented|not_wanted> --rationale <text> [--evidence-label <text> --evidence-target <text>]...\n");
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
  if (outcome === undefined || !DISPATCH_OUTCOMES.has(outcome as DispatchOutcome)) {
    writeUsage("Error: --outcome must be one of not_implemented, implemented, not_wanted\n");
    return 1;
  }
  if (rationale === undefined) {
    writeUsage("Error: --rationale is required\n");
    return 1;
  }

  const input: ResolveTicketInput = {
    ticketId,
    outcome: outcome as DispatchOutcome,
    rationale,
    evidence,
  };
  const result = resolveTicket(process.cwd(), input);
  writeJson(result);
  return result.valid ? 0 : 1;
}
