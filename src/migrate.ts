import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";
import { sortByDeterministicKey } from "./diagnostics.js";
import { isRecord } from "./migrate/parsers/shared.js";
import { getRequiredBundledScaffoldAssets, initializeStrictScaffold, loadBundledScaffoldYaml } from "./scaffold.js";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";
import { convertLegacyChangeArtifacts } from "./migrate/converters/changes.js";
import { convertLegacyRoadmapArtifacts, convertLegacySpecsIndex } from "./migrate/converters/roadmap.js";
import { convertLegacySpecArtifacts } from "./migrate/converters/specs.js";
import {
  LEGACY_WORKFLOW_DIR,
  STRICT_WORKFLOW_DIR,
  type DeferredLegacyArtifact,
  listFilesRecursive,
  makeDiagnostic,
  recordDeferredArtifact,
  toRepoRelativePath,
} from "./migrate/shared.js";

export { parseLegacyDesign, parseLegacyProposal, parseLegacyQuestions, parseLegacyTasks } from "./migrate/parsers/change-artifacts.js";

const LEGACY_CONFIG_PATH = `${LEGACY_WORKFLOW_DIR}/config.yaml`;
const STRICT_CONFIG_PATH = `${STRICT_WORKFLOW_DIR}/config.yaml`;

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

export type MigrationConvertedArtifact = {
  kind:
    | "workflow_config"
    | "strict_scaffold_asset"
    | "main_spec"
    | "delta_spec"
    | "change_proposal"
    | "change_design"
    | "task_list"
    | "question_list"
    | "roadmap_index"
    | "roadmap_milestone"
    | "spec_index";
  targetPath: string;
  sourcePath?: string;
  note: string;
};

export type MigrationSkippedArtifact = {
  kind: "legacy_markdown_artifact" | "legacy_project_state";
  sourcePath: string;
  reason: string;
};

export type MigrationDiagnostic = {
  code: string;
  message: string;
  sourcePath?: string;
  targetPath?: string;
};

export type MigrationManualFollowUp = {
  sourcePath: string;
  reason: string;
  recommendation: string;
};

export type MigrationResult = {
  valid: boolean;
  targetRoot: string;
  converted: MigrationConvertedArtifact[];
  skipped: MigrationSkippedArtifact[];
  warnings: MigrationDiagnostic[];
  errors: MigrationDiagnostic[];
  manualFollowUp: MigrationManualFollowUp[];
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

function describeDeferredLegacyArtifact(repoRelativePath: string): DeferredLegacyArtifact {
  if (repoRelativePath === `${LEGACY_WORKFLOW_DIR}/specs/INDEX.md`) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy specs index content is a project-state artifact that still requires a dedicated strict YAML converter.",
      recommendation: "Implement roadmap and project-state migration converters before attempting to migrate specs index state.",
    };
  }
  if (repoRelativePath === `${LEGACY_WORKFLOW_DIR}/specs/README.md`) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy specs README guidance does not have a dedicated strict YAML migration target in the current migrate command.",
      recommendation: "Decide whether this documentation should stay as Markdown guidance or move under a dedicated migration/documentation path before treating the migration as complete.",
    };
  }
  if (repoRelativePath.startsWith(`${LEGACY_WORKFLOW_DIR}/changes/`)) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy change artifacts require dedicated migration converters before they can become strict YAML change artifacts.",
      recommendation: "Implement the core-workflow migration converters before attempting to self-host migrated changes.",
    };
  }
  if (repoRelativePath.startsWith(`${LEGACY_WORKFLOW_DIR}/roadmap/`)) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy roadmap artifacts require dedicated migration converters before they can become strict roadmap YAML artifacts.",
      recommendation: "Implement roadmap and project-state migration converters before attempting to migrate roadmap state.",
    };
  }
  if (repoRelativePath.startsWith(`${LEGACY_WORKFLOW_DIR}/specs/`)) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy spec artifacts require dedicated migration converters before they can become strict YAML specs and deltas.",
      recommendation: "Implement spec and delta migration converters before attempting to migrate legacy spec content.",
    };
  }

  return {
    kind: repoRelativePath.endsWith(".md") ? "legacy_markdown_artifact" : "legacy_project_state",
    reason: "This legacy workflow artifact does not have a dedicated migration converter in the current migrate command.",
    recommendation: "Add a dedicated migration converter for this artifact type before treating the migration as complete.",
  };
}

function sortMigrationResult(result: MigrationResult): MigrationResult {
  sortByDeterministicKey(
    result.converted,
    (artifact) => [artifact.targetPath, artifact.sourcePath ?? "", artifact.kind, artifact.note],
  );
  sortByDeterministicKey(
    result.skipped,
    (artifact) => [artifact.sourcePath, artifact.kind, artifact.reason],
  );
  sortByDeterministicKey(
    result.warnings,
    (diagnostic) => [diagnostic.code, diagnostic.sourcePath ?? "", diagnostic.targetPath ?? "", diagnostic.message],
  );
  sortByDeterministicKey(
    result.errors,
    (diagnostic) => [diagnostic.code, diagnostic.sourcePath ?? "", diagnostic.targetPath ?? "", diagnostic.message],
  );
  sortByDeterministicKey(
    result.manualFollowUp,
    (entry) => [entry.sourcePath, entry.reason, entry.recommendation],
  );
  return result;
}

function loadStrictConfigFromLegacy(rootDir: string, errors: MigrationDiagnostic[]): StrictWorkflowConfig | null {
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

function getReportedStrictScaffoldAssets(): string[] {
  return getRequiredBundledScaffoldAssets()
    .filter((assetPath) => assetPath !== "config.yaml")
    .sort((left, right) => left.localeCompare(right));
}

export function migrateLegacyWorkflow(rootDir: string, options?: { force?: boolean }): MigrationResult {
  const legacyRootAbsolutePath = path.join(rootDir, LEGACY_WORKFLOW_DIR);
  const strictRootAbsolutePath = path.join(rootDir, STRICT_WORKFLOW_DIR);
  const result: MigrationResult = {
    valid: false,
    targetRoot: STRICT_WORKFLOW_DIR,
    converted: [],
    skipped: [],
    warnings: [],
    errors: [],
    manualFollowUp: [],
  };

  if (!existsSync(legacyRootAbsolutePath) || !statSync(legacyRootAbsolutePath).isDirectory()) {
    result.errors.push(
      makeDiagnostic(
        "legacy_source_missing",
        "Bootstrap migration requires a .spec-driven/ directory at the repository root.",
        LEGACY_WORKFLOW_DIR,
      ),
    );
    return sortMigrationResult(result);
  }

  if (existsSync(strictRootAbsolutePath)) {
    const strictRootStat = statSync(strictRootAbsolutePath);
    if (!strictRootStat.isDirectory()) {
      result.errors.push(
        makeDiagnostic(
          "strict_target_conflict",
          "Cannot migrate into .strict-spec-driven because a non-directory entry already exists at that path.",
          undefined,
          STRICT_WORKFLOW_DIR,
        ),
      );
      return sortMigrationResult(result);
    }
    if (readdirSync(strictRootAbsolutePath).length > 0 && !options?.force) {
      result.errors.push(
        makeDiagnostic(
          "strict_target_conflict",
          "Cannot migrate into a non-empty .strict-spec-driven directory without --force.",
          undefined,
          STRICT_WORKFLOW_DIR,
        ),
      );
      return sortMigrationResult(result);
    }
    if (options?.force) {
      rmSync(strictRootAbsolutePath, { recursive: true, force: true });
    }
  }

  const strictConfig = loadStrictConfigFromLegacy(rootDir, result.errors);
  if (!strictConfig) {
    return sortMigrationResult(result);
  }

  const legacyFiles = listFilesRecursive(legacyRootAbsolutePath)
    .map((absolutePath) => toRepoRelativePath(rootDir, absolutePath))
    .sort((left, right) => left.localeCompare(right));

  initializeStrictScaffold(rootDir);
  const strictConfigAbsolutePath = path.join(rootDir, STRICT_CONFIG_PATH);
  writeFileSync(strictConfigAbsolutePath, stringifyYamlDocument(strictConfig), "utf8");

  result.converted.push({
    kind: "workflow_config",
    sourcePath: LEGACY_CONFIG_PATH,
    targetPath: STRICT_CONFIG_PATH,
    note: "Migrated legacy workflow config into strict workflow config metadata.",
  });

  const handledLegacyFiles = new Set<string>([LEGACY_CONFIG_PATH]);

  for (const scaffoldAsset of getReportedStrictScaffoldAssets()) {
    result.converted.push({
      kind: "strict_scaffold_asset",
      targetPath: `${STRICT_WORKFLOW_DIR}/${scaffoldAsset}`,
      note: "Ensured required strict scaffold asset is available for migration output.",
    });
  }

  convertLegacySpecArtifacts(rootDir, result, handledLegacyFiles);
  convertLegacyChangeArtifacts(rootDir, result, handledLegacyFiles);
  convertLegacyRoadmapArtifacts(rootDir, result, handledLegacyFiles);
  convertLegacySpecsIndex(rootDir, result, handledLegacyFiles);

  for (const legacyFile of legacyFiles) {
    if (handledLegacyFiles.has(legacyFile)) {
      continue;
    }
    const deferredArtifact = describeDeferredLegacyArtifact(legacyFile);
    recordDeferredArtifact(
      result,
      legacyFile,
      deferredArtifact.reason,
      deferredArtifact.recommendation,
      deferredArtifact.kind,
      "converter_unavailable",
    );
  }

  result.valid = true;
  return sortMigrationResult(result);
}
