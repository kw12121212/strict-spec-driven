import {
  createSop,
  editSop,
  listSops,
  showSop,
  validateSops,
  type CreateSopInput,
  type EditSopInput,
  type SopBranch,
  type SopEscalation,
  type SopException,
  type SopLink,
  type SopReference,
  type SopRole,
  type SopStep,
} from "../sops.js";
import { listSopCategories, showSopCategory } from "../sop-categories.js";
import { isHelpRequest } from "./argv.js";
import { writeHelp, writeJson, writeUsage } from "./output.js";

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

function zip<T>(flags: FlagMap, names: string[], build: (values: string[]) => T): T[] {
  const columns = names.map((name) => flags[name] ?? []);
  const lengths = columns.filter((column) => column.length > 0).map((column) => column.length);
  if (lengths.length === 0) {
    return [];
  }
  const length = lengths[0];
  if (!lengths.every((value) => value === length)) {
    throw new Error(`flags ${names.map((name) => `--${name}`).join(", ")} must be provided in equal counts`);
  }
  const rows: T[] = [];
  for (let index = 0; index < length; index += 1) {
    rows.push(build(columns.map((column) => column[index] ?? "")));
  }
  return rows;
}

const SOP_CREATE_FLAGS = [
  "title",
  "category",
  "purpose",
  "trigger",
  "scope-in",
  "scope-out",
  "success",
  "prerequisite",
  "classification",
  "output",
  "role-id",
  "role-name",
  "role-responsibility",
  "step-id",
  "step-actor",
  "step-action",
  "step-expected",
  "branch-step",
  "branch-condition",
  "branch-goto",
  "escalation-trigger",
  "escalation-to",
  "escalation-action",
  "exception-condition",
  "exception-handling",
  "reference-label",
  "reference-target",
  "link-kind",
  "link-target",
];

const SOP_CREATE_USAGE =
  "Usage: strict-spec-cli sop-create --title <text> --category <id> --purpose <text> --trigger <text> --scope-in <text>... --success <text>... --step-id <id> --step-actor <text> --step-action <text> --step-expected <text> [step/role/branch/exception/escalation/link flags]\n";

function buildCreateInput(flags: FlagMap): CreateSopInput {
  const roles = zip<SopRole>(flags, ["role-id", "role-name", "role-responsibility"], ([id, name, responsibility]) => ({ id, name, responsibility }));

  const baseSteps = zip<SopStep>(flags, ["step-id", "step-actor", "step-action", "step-expected"], ([id, actor, action, expected], ) => ({
    id,
    order: 0,
    actor,
    action,
    expected_result: expected,
  }));
  baseSteps.forEach((step, index) => {
    step.order = index + 1;
  });

  const branchRows = zip<{ step: string; branch: SopBranch }>(flags, ["branch-step", "branch-condition", "branch-goto"], ([step, condition, goto]) => ({
    step,
    branch: { condition, goto_step: goto },
  }));
  for (const row of branchRows) {
    const owner = baseSteps.find((step) => step.id === row.step);
    if (!owner) {
      throw new Error(`--branch-step '${row.step}' does not match any --step-id`);
    }
    owner.branches ??= [];
    owner.branches.push(row.branch);
  }

  const escalation = zip<SopEscalation>(flags, ["escalation-trigger", "escalation-to", "escalation-action"], ([trigger, to, action]) => {
    const entry: SopEscalation = { trigger, to };
    if (action.length > 0) {
      entry.action = action;
    }
    return entry;
  });
  const exceptions = zip<SopException>(flags, ["exception-condition", "exception-handling"], ([condition, handling]) => ({ condition, handling }));
  const references = zip<SopReference>(flags, ["reference-label", "reference-target"], ([label, target]) => ({ label, target }));
  const links = zip<SopLink>(flags, ["link-kind", "link-target"], ([kind, target]) => ({ kind: kind as SopLink["kind"], target }));

  return {
    title: singleValue(flags, "title") ?? "",
    category: singleValue(flags, "category") ?? "",
    purpose: singleValue(flags, "purpose") ?? "",
    trigger: singleValue(flags, "trigger") ?? "",
    scopeIn: flags["scope-in"] ?? [],
    scopeOut: flags["scope-out"],
    successCriteria: flags.success ?? [],
    roles,
    prerequisites: flags.prerequisite,
    classification: singleValue(flags, "classification"),
    steps: baseSteps,
    escalation,
    exceptions,
    outputs: flags.output,
    references,
    links,
  };
}

export function runSopCreate(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(SOP_CREATE_USAGE);
    return 0;
  }

  let flags: FlagMap;
  let input: CreateSopInput;
  try {
    flags = parseFlagMap(argv);
    ensureAllowedFlags(flags, SOP_CREATE_FLAGS);
    input = buildCreateInput(flags);
  } catch (error) {
    writeUsage(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  if (input.title.length === 0 || input.category.length === 0 || input.purpose.length === 0 || input.trigger.length === 0) {
    writeUsage("Error: --title, --category, --purpose, and --trigger are required\n");
    return 1;
  }
  if (input.scopeIn.length === 0) {
    writeUsage("Error: at least one --scope-in is required\n");
    return 1;
  }
  if (input.successCriteria.length === 0) {
    writeUsage("Error: at least one --success is required\n");
    return 1;
  }
  if (input.steps.length === 0) {
    writeUsage("Error: at least one step (--step-id, --step-actor, --step-action, --step-expected) is required\n");
    return 1;
  }

  const result = createSop(process.cwd(), input);
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runSopList(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-cli sop-list\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-cli sop-list\n");
    return 1;
  }
  const result = listSops(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runSopShow(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-cli sop-show <sop-id>\n");
    return 0;
  }
  if (argv.length !== 1 || argv[0].startsWith("--")) {
    writeUsage("Usage: strict-spec-cli sop-show <sop-id>\n");
    return 1;
  }
  const result = showSop(process.cwd(), argv[0]);
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runSopValidate(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-cli sop-validate [<sop-id>]\n");
    return 0;
  }
  if (argv.length > 1 || (argv.length === 1 && argv[0].startsWith("--"))) {
    writeUsage("Usage: strict-spec-cli sop-validate [<sop-id>]\n");
    return 1;
  }
  const result = validateSops(process.cwd(), argv[0]);
  writeJson(result);
  return result.valid ? 0 : 1;
}

const SOP_EDIT_FLAGS = ["title", "purpose", "trigger", "scope-in", "scope-out", "success"];
const SOP_EDIT_USAGE =
  "Usage: strict-spec-cli sop-edit <sop-id> [--title <text>] [--purpose <text>] [--trigger <text>] [--scope-in <text>]... [--scope-out <text>]... [--success <text>]...\n";

export function runSopEdit(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp(SOP_EDIT_USAGE);
    return 0;
  }
  if (argv.length === 0 || argv[0].startsWith("--")) {
    writeUsage(SOP_EDIT_USAGE);
    return 1;
  }
  const sopId = argv[0];

  let flags: FlagMap;
  try {
    flags = parseFlagMap(argv.slice(1));
    ensureAllowedFlags(flags, SOP_EDIT_FLAGS);
  } catch (error) {
    writeUsage(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  if (Object.keys(flags).length === 0) {
    writeUsage("Error: sop-edit requires at least one editable field\n");
    return 1;
  }
  for (const flag of ["title", "purpose", "trigger"]) {
    const value = singleValue(flags, flag);
    if (value !== undefined && value.trim().length === 0) {
      writeUsage(`Error: --${flag} must not be blank\n`);
      return 1;
    }
  }

  const input: EditSopInput = { sopId };
  if ("title" in flags) {
    input.title = singleValue(flags, "title");
  }
  if ("purpose" in flags) {
    input.purpose = singleValue(flags, "purpose");
  }
  if ("trigger" in flags) {
    input.trigger = singleValue(flags, "trigger");
  }
  if ("scope-in" in flags) {
    input.scopeIn = flags["scope-in"];
  }
  if ("scope-out" in flags) {
    input.scopeOut = flags["scope-out"];
  }
  if ("success" in flags) {
    input.successCriteria = flags.success;
  }

  const result = editSop(process.cwd(), input);
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runSopCategoryList(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-cli sop-category-list\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-cli sop-category-list\n");
    return 1;
  }
  const result = listSopCategories();
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runSopCategoryShow(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-cli sop-category-show <category-id>\n");
    return 0;
  }
  if (argv.length !== 1 || argv[0].startsWith("--")) {
    writeUsage("Usage: strict-spec-cli sop-category-show <category-id>\n");
    return 1;
  }
  const result = showSopCategory(argv[0]);
  writeJson(result);
  return result.valid ? 0 : 1;
}
