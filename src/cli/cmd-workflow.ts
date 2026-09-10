import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { loadBundledSchemaByArtifactType, validateArtifact } from "../validation.js";
import { authorWorkflowConfig, type WorkflowConfigAuthorInput } from "../workflow-config-author.js";
import { checkProposalReadiness, getWorkflowState } from "../workflow-state.js";
import { parseYamlFile } from "../yaml.js";
import { CHANGE_NAME_PATTERN, handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeOut, writeUsage } from "./output.js";
import { withRerenderedDocuments } from "./generated-document-rerender.js";

const STRICT_WORKFLOW_STATE_DIR = ".strict-spec-driven";
const WORKFLOW_CONFIG_RELATIVE_PATH = `${STRICT_WORKFLOW_STATE_DIR}/config.yaml`;

const CONFIG_VALUE_FLAGS = new Set([
  "preferred-human-language", "context", "rule", "regression-method", "regression-command",
  "regression-meaning", "regression-unavailable-behavior", "coverage-threshold", "coverage-include",
  "coverage-exclude", "maintenance-check", "remove-rule", "remove-coverage-include",
  "remove-coverage-exclude", "remove-maintenance-check",
]);

const CONFIG_BOOLEAN_FLAGS = new Set([
  "remove-preferred-human-language", "remove-context", "remove-regression-method",
  "remove-regression-command", "remove-regression-meaning", "remove-regression-unavailable-behavior",
  "remove-coverage",
]);

function parseConfigEditArgs(argv: string[]): WorkflowConfigAuthorInput {
  const flags: Record<string, string[]> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token === "--") throw new Error(`unexpected argument '${token ?? ""}'`);
    const equals = token.indexOf("=");
    const name = token.slice(2, equals === -1 ? undefined : equals);
    if (CONFIG_BOOLEAN_FLAGS.has(name)) {
      if (equals !== -1) throw new Error(`--${name} does not accept a value`);
      flags[name] = ["true"];
      continue;
    }
    if (!CONFIG_VALUE_FLAGS.has(name)) throw new Error(`unsupported argument --${name}`);
    const value = equals === -1 ? argv[index + 1] : token.slice(equals + 1);
    if (value === undefined || (equals === -1 && value.startsWith("--")) || value.length === 0) {
      throw new Error(`missing value for --${name}`);
    }
    flags[name] ??= [];
    flags[name].push(value);
    if (equals === -1) index += 1;
  }

  const scalar = (name: string): string | undefined => {
    const values = flags[name] ?? [];
    if (values.length > 1) throw new Error(`--${name} may be supplied at most once`);
    return values[0];
  };
  const thresholdText = scalar("coverage-threshold");
  const threshold = thresholdText === undefined ? undefined : Number(thresholdText);
  if (thresholdText !== undefined && (!Number.isFinite(threshold) || threshold! < 0 || threshold! > 100)) {
    throw new Error("--coverage-threshold must be a number from 0 through 100");
  }

  return {
    preferredHumanLanguage: scalar("preferred-human-language"),
    context: scalar("context"),
    regressionMethod: scalar("regression-method"),
    regressionCommand: scalar("regression-command"),
    regressionMeaning: scalar("regression-meaning"),
    regressionUnavailableBehavior: scalar("regression-unavailable-behavior"),
    coverageThreshold: threshold,
    rules: flags.rule ?? [],
    coverageIncludes: flags["coverage-include"] ?? [],
    coverageExcludes: flags["coverage-exclude"] ?? [],
    maintenanceChecks: flags["maintenance-check"] ?? [],
    removeRules: flags["remove-rule"] ?? [],
    removeCoverageIncludes: flags["remove-coverage-include"] ?? [],
    removeCoverageExcludes: flags["remove-coverage-exclude"] ?? [],
    removeMaintenanceChecks: flags["remove-maintenance-check"] ?? [],
    removePreferredHumanLanguage: flags["remove-preferred-human-language"] !== undefined,
    removeContext: flags["remove-context"] !== undefined,
    removeRegressionMethod: flags["remove-regression-method"] !== undefined,
    removeRegressionCommand: flags["remove-regression-command"] !== undefined,
    removeRegressionMeaning: flags["remove-regression-meaning"] !== undefined,
    removeRegressionUnavailableBehavior: flags["remove-regression-unavailable-behavior"] !== undefined,
    removeCoverage: flags["remove-coverage"] !== undefined,
  };
}

export function runConfigEdit(argv: string[]): number {
  if (handleHelpRequest("config-edit", argv)) return 0;
  try {
    const result = withRerenderedDocuments(process.cwd(), authorWorkflowConfig(process.cwd(), parseConfigEditArgs(argv)));
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(getCommandUsage("config-edit"));
    return 1;
  }
}

function checkWorkflowConfig(workflowStatePath: string): number {
  const configPath = path.join(workflowStatePath, "config.yaml");
  if (!existsSync(configPath)) {
    return 0;
  }

  let artifact: unknown;
  try {
    artifact = parseYamlFile(configPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(`workflow config is not valid YAML: ${WORKFLOW_CONFIG_RELATIVE_PATH}`);
    writeError(message);
    return 1;
  }

  let result;
  try {
    const schema = loadBundledSchemaByArtifactType("workflow_config");
    result = validateArtifact(schema, artifact, WORKFLOW_CONFIG_RELATIVE_PATH);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(`workflow config validation could not run: ${message}`);
    return 1;
  }
  if (result.valid) {
    return 0;
  }

  writeError(`workflow config validation failed: ${WORKFLOW_CONFIG_RELATIVE_PATH}`);
  for (const diagnostic of result.diagnostics) {
    const expected = diagnostic.expected !== undefined ? ` (expected: ${diagnostic.expected})` : "";
    writeError(`${diagnostic.fieldPath}: ${diagnostic.message}${expected}`);
  }
  return 1;
}

export function runCheckWorkflowState(argv: string[]): number {
  if (handleHelpRequest("check-workflow-state", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("check-workflow-state"));
    return 1;
  }

  const workflowStatePath = path.join(process.cwd(), STRICT_WORKFLOW_STATE_DIR);
  if (existsSync(workflowStatePath) && statSync(workflowStatePath).isDirectory()) {
    if (checkWorkflowConfig(workflowStatePath) !== 0) {
      return 1;
    }
    writeOut("strict workflow state exists: .strict-spec-driven/\n");
    return 0;
  }

  writeError("strict workflow state is missing: .strict-spec-driven/");
  writeUsage("Run /strict-spec-init before using strict workflow commands.\n");
  return 1;
}

export function runReady(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (handleHelpRequest("ready", argv)) {
    return 0;
  }
  if (!changeName || extraArgs.length > 0) {
    writeUsage(getCommandUsage("ready"));
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    writeError("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }

  try {
    const result = checkProposalReadiness(process.cwd(), changeName);
    writeJson(result);
    return result.ready ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}

export function runNext(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (handleHelpRequest("next", argv)) {
    return 0;
  }
  if (!changeName || extraArgs.length > 0) {
    writeUsage(getCommandUsage("next"));
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    writeError("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }

  try {
    writeJson(getWorkflowState(process.cwd(), changeName));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}
