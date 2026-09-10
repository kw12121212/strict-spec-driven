import {
  authorMainSpec,
  authorMainTech,
  type MainSpecAuthorInput,
  type MainTechAuthorInput,
  type ScenarioStep,
} from "../spec-tech-author.js";
import { handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeUsage } from "./output.js";
import { withRerenderedDocuments } from "./generated-document-rerender.js";

type FlagMap = Record<string, string[]>;

export const SPEC_EDIT_FLAGS = [
  "spec-path", "title", "requirement", "strength", "statement", "scenario",
  "given", "when", "then", "and", "remove-requirement", "remove-scenario", "delete",
] as const;

export const TECH_EDIT_FLAGS = [
  "tech-path", "title", "category", "rule", "strength", "statement",
  "rationale", "method", "detail", "example-good", "example-bad", "exception", "remove-rule",
  "remove-example-good", "remove-example-bad", "remove-exception", "delete",
] as const;

function parseFlags(argv: string[], allowed: readonly string[]): FlagMap {
  const allowedSet = new Set(allowed);
  const flags: FlagMap = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token === "--") throw new Error(`unexpected argument '${token ?? ""}'`);
    const equals = token.indexOf("=");
    const name = token.slice(2, equals === -1 ? undefined : equals);
    if (!allowedSet.has(name)) throw new Error(`unsupported argument --${name}`);
    if (name === "delete") {
      if (equals !== -1) throw new Error("--delete does not accept a value");
      flags.delete = ["true"];
      continue;
    }
    const value = equals === -1 ? argv[index + 1] : token.slice(equals + 1);
    if (value === undefined || value.length === 0 || (equals === -1 && value.startsWith("--"))) {
      throw new Error(`missing value for --${name}`);
    }
    flags[name] ??= [];
    flags[name].push(value);
    if (equals === -1) index += 1;
  }
  return flags;
}

function one(flags: FlagMap, name: string): string | undefined {
  const values = flags[name] ?? [];
  if (values.length > 1) throw new Error(`--${name} may be supplied at most once`);
  return values[0];
}

function many(flags: FlagMap, name: string): string[] {
  return flags[name] ?? [];
}

function parseSteps(flags: FlagMap): ScenarioStep[] {
  const steps: ScenarioStep[] = [];
  for (const [flagName, key] of [["given", "GIVEN"], ["when", "WHEN"], ["then", "THEN"]] as const) {
    const value = one(flags, flagName);
    if (value !== undefined) steps.push({ [key]: value });
  }
  for (const value of many(flags, "and")) steps.push({ AND: value });
  return steps;
}

function parseSpecInput(id: string, argv: string[]): MainSpecAuthorInput {
  const flags = parseFlags(argv, SPEC_EDIT_FLAGS);
  const requirementId = one(flags, "requirement");
  const scenarioId = one(flags, "scenario");
  const strength = one(flags, "strength");
  const statement = one(flags, "statement");
  const steps = parseSteps(flags);
  if ((strength !== undefined || statement !== undefined || scenarioId !== undefined || steps.length > 0) && requirementId === undefined) {
    throw new Error("requirement fields require --requirement");
  }
  if (steps.length > 0 && scenarioId === undefined) throw new Error("scenario steps require --scenario");
  return {
    id,
    specPath: one(flags, "spec-path"),
    title: one(flags, "title"),

    ...(requirementId === undefined ? {} : {
      requirement: {
        id: requirementId,
        strength,
        statement,
        ...(scenarioId === undefined ? {} : { scenario: { id: scenarioId, steps } }),
      },
    }),
    removeRequirements: many(flags, "remove-requirement"),
    removeScenarios: many(flags, "remove-scenario"),

    delete: flags.delete !== undefined,
  };
}

function parseTechInput(id: string, argv: string[]): MainTechAuthorInput {
  const flags = parseFlags(argv, TECH_EDIT_FLAGS);
  const ruleId = one(flags, "rule");
  const ruleFields = [
    "strength", "statement", "rationale", "method", "detail", "example-good", "example-bad", "exception",
    "remove-example-good", "remove-example-bad", "remove-exception",
  ];
  if (ruleFields.some((name) => many(flags, name).length > 0) && ruleId === undefined) {
    throw new Error("rule fields and rule-scoped removals require --rule");
  }
  return {
    id,
    techPath: one(flags, "tech-path"),
    title: one(flags, "title"),
    category: one(flags, "category"),

    ...(ruleId === undefined ? {} : {
      rule: {
        id: ruleId,
        strength: one(flags, "strength"),
        statement: one(flags, "statement"),
        rationale: one(flags, "rationale"),
        method: one(flags, "method"),
        detail: one(flags, "detail"),
        exampleGood: many(flags, "example-good"),
        exampleBad: many(flags, "example-bad"),
        exceptions: many(flags, "exception"),
        removeExampleGood: many(flags, "remove-example-good"),
        removeExampleBad: many(flags, "remove-example-bad"),
        removeExceptions: many(flags, "remove-exception"),
      },
    }),
    removeRules: many(flags, "remove-rule"),

    delete: flags.delete !== undefined,
  };
}

function runLiveArtifactEdit(
  commandName: "spec-edit" | "tech-edit",
  argv: string[],
): number {
  if (handleHelpRequest(commandName, argv)) return 0;
  const [id, ...flagArgs] = argv;
  if (id === undefined || id.startsWith("--")) {
    writeUsage(getCommandUsage(commandName));
    return 1;
  }
  try {
    const result = withRerenderedDocuments(
      process.cwd(),
      commandName === "spec-edit"
        ? authorMainSpec(process.cwd(), parseSpecInput(id, flagArgs))
        : authorMainTech(process.cwd(), parseTechInput(id, flagArgs)),
    );
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(getCommandUsage(commandName));
    return 1;
  }
}

export function runSpecEdit(argv: string[]): number {
  return runLiveArtifactEdit("spec-edit", argv);
}

export function runTechEdit(argv: string[]): number {
  return runLiveArtifactEdit("tech-edit", argv);
}
