import {
  existsSync,
  readFileSync,
  statSync,
} from "fs";
import path from "path";
import { getRequiredBundledScaffoldAssets, loadBundledScaffoldYaml } from "../scaffold.js";
import { parseYamlDocument } from "../yaml.js";
import { isRecord } from "./parsers/shared.js";
import type { MigrationDiagnostic } from "./reporting.js";
import { LEGACY_WORKFLOW_DIR, STRICT_WORKFLOW_DIR, makeDiagnostic } from "./shared.js";

export const LEGACY_CONFIG_PATH = `${LEGACY_WORKFLOW_DIR}/config.yaml`;
export const STRICT_CONFIG_PATH = `${STRICT_WORKFLOW_DIR}/config.yaml`;

type StrictWorkflowConfig = {
  schema: "strict-spec-driven/config/v1";
  schema_version: 1;
  artifact_type: "workflow_config";
  context: string;
  rules: Record<string, unknown>;
};

type LegacyWorkflowConfig = {
  context?: unknown;
  rules?: unknown;
};

const LEGACY_CONFIG_TEXT_REPLACEMENTS: Array<readonly [RegExp, string]> = [
  [/\bproposal\.md\b/g, "proposal.yaml"],
  [/\bdesign\.md\b/g, "design.yaml"],
  [/\btasks\.md\b/g, "tasks.yaml"],
  [/\bquestions\.md\b/g, "questions.yaml"],
  [/\/spec-driven-modify\b/g, "strict-spec-modify"],
  [/Mark tasks \[x\] immediately upon completion/g, "Mark tasks done immediately upon completion"],
  [/\(lint \+ unit tests at minimum\)/g, "(validation + unit tests at minimum)"],
];

function normalizeLegacyConfigText(value: string): string {
  let normalized = value;
  for (const [pattern, replacement] of LEGACY_CONFIG_TEXT_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

function normalizeLegacyConfigValue(value: unknown): unknown {
  if (typeof value === "string") {
    return normalizeLegacyConfigText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeLegacyConfigValue(entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeLegacyConfigValue(entry)]),
    );
  }
  return value;
}

export function loadStrictConfigFromLegacy(rootDir: string, errors: MigrationDiagnostic[]): StrictWorkflowConfig | null {
  const legacyConfigAbsolutePath = path.join(rootDir, LEGACY_CONFIG_PATH);
  if (!existsSync(legacyConfigAbsolutePath) || !statSync(legacyConfigAbsolutePath).isFile()) {
    errors.push(
      makeDiagnostic(
        "legacy_config_missing",
        "Bootstrap migration requires .spec-driven/config.yaml to exist before migrate can initialize strict workflow state.",
        LEGACY_CONFIG_PATH,
      ),
    );
    return null;
  }

  let legacyConfigArtifact: LegacyWorkflowConfig;
  try {
    legacyConfigArtifact = parseYamlDocument<LegacyWorkflowConfig>(readFileSync(legacyConfigAbsolutePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(
      makeDiagnostic(
        "legacy_config_invalid",
        `Legacy workflow config could not be parsed as YAML: ${message}`,
        LEGACY_CONFIG_PATH,
      ),
    );
    return null;
  }

  if (!isRecord(legacyConfigArtifact)) {
    errors.push(
      makeDiagnostic(
        "legacy_config_invalid",
        "Legacy workflow config must decode to a YAML mapping before migrate can continue.",
        LEGACY_CONFIG_PATH,
      ),
    );
    return null;
  }

  const { context, rules } = legacyConfigArtifact;
  if (typeof context !== "string" || context.length === 0) {
    errors.push(
      makeDiagnostic(
        "legacy_config_invalid",
        "Legacy workflow config must provide a non-empty string context before migrate can continue.",
        LEGACY_CONFIG_PATH,
      ),
    );
    return null;
  }
  if (!isRecord(rules)) {
    errors.push(
      makeDiagnostic(
        "legacy_config_invalid",
        "Legacy workflow config must provide a rules mapping before migrate can continue.",
        LEGACY_CONFIG_PATH,
      ),
    );
    return null;
  }

  const scaffoldConfig = loadBundledScaffoldYaml<StrictWorkflowConfig>("config.yaml");
  return {
    ...scaffoldConfig,
    context,
    rules: normalizeLegacyConfigValue(rules) as Record<string, unknown>,
  };
}

export function getReportedStrictScaffoldAssets(): string[] {
  return getRequiredBundledScaffoldAssets()
    .filter((assetPath) => assetPath !== "config.yaml")
    .sort((left, right) => left.localeCompare(right));
}
