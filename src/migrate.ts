import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { initializeStrictScaffold, loadBundledScaffoldYaml } from "./scaffold.js";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";

const LEGACY_WORKFLOW_DIR = ".spec-driven";
const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
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

type MigrationArtifactKind =
  | "workflow_config"
  | "strict_scaffold_asset"
  | "legacy_markdown_artifact"
  | "legacy_project_state";

export type MigrationConvertedArtifact = {
  kind: "workflow_config" | "strict_scaffold_asset";
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

type DeferredLegacyArtifact = {
  kind: "legacy_markdown_artifact" | "legacy_project_state";
  reason: string;
  recommendation: string;
};

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function toRepoRelativePath(rootDir: string, absolutePath: string): string {
  return toPosix(path.relative(rootDir, absolutePath));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function listFilesRecursive(directoryPath: string): string[] {
  if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) {
    return [];
  }

  const files: string[] = [];

  function walk(currentPath: string): void {
    const entries = readdirSync(currentPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  walk(directoryPath);
  return files;
}

function makeDiagnostic(
  code: string,
  message: string,
  sourcePath?: string,
  targetPath?: string,
): MigrationDiagnostic {
  return { code, message, sourcePath, targetPath };
}

function describeDeferredLegacyArtifact(repoRelativePath: string): DeferredLegacyArtifact {
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
  result.converted.sort((left, right) => {
    const leftKey = [left.targetPath, left.sourcePath ?? "", left.kind, left.note].join("|");
    const rightKey = [right.targetPath, right.sourcePath ?? "", right.kind, right.note].join("|");
    return leftKey.localeCompare(rightKey);
  });
  result.skipped.sort((left, right) => {
    const leftKey = [left.sourcePath, left.kind, left.reason].join("|");
    const rightKey = [right.sourcePath, right.kind, right.reason].join("|");
    return leftKey.localeCompare(rightKey);
  });
  result.warnings.sort((left, right) => {
    const leftKey = [left.code, left.sourcePath ?? "", left.targetPath ?? "", left.message].join("|");
    const rightKey = [right.code, right.sourcePath ?? "", right.targetPath ?? "", right.message].join("|");
    return leftKey.localeCompare(rightKey);
  });
  result.errors.sort((left, right) => {
    const leftKey = [left.code, left.sourcePath ?? "", left.targetPath ?? "", left.message].join("|");
    const rightKey = [right.code, right.sourcePath ?? "", right.targetPath ?? "", right.message].join("|");
    return leftKey.localeCompare(rightKey);
  });
  result.manualFollowUp.sort((left, right) => {
    const leftKey = [left.sourcePath, left.reason, left.recommendation].join("|");
    const rightKey = [right.sourcePath, right.reason, right.recommendation].join("|");
    return leftKey.localeCompare(rightKey);
  });
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
    rules,
  };
}

export function migrateLegacyWorkflow(rootDir: string): MigrationResult {
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
    if (readdirSync(strictRootAbsolutePath).length > 0) {
      result.errors.push(
        makeDiagnostic(
          "strict_target_conflict",
          "Cannot migrate into a non-empty .strict-spec-driven directory without a future safe rerun policy.",
          undefined,
          STRICT_WORKFLOW_DIR,
        ),
      );
      return sortMigrationResult(result);
    }
  }

  const strictConfig = loadStrictConfigFromLegacy(rootDir, result.errors);
  if (!strictConfig) {
    return sortMigrationResult(result);
  }

  const legacyFiles = listFilesRecursive(legacyRootAbsolutePath)
    .map((absolutePath) => toRepoRelativePath(rootDir, absolutePath))
    .sort((left, right) => left.localeCompare(right));

  const scaffoldResult = initializeStrictScaffold(rootDir);
  const strictConfigAbsolutePath = path.join(rootDir, STRICT_CONFIG_PATH);
  writeFileSync(strictConfigAbsolutePath, stringifyYamlDocument(strictConfig), "utf8");

  result.converted.push({
    kind: "workflow_config",
    sourcePath: LEGACY_CONFIG_PATH,
    targetPath: STRICT_CONFIG_PATH,
    note: "Migrated legacy workflow config into strict workflow config metadata.",
  });

  for (const createdAsset of scaffoldResult.created.sort((left, right) => left.localeCompare(right))) {
    if (createdAsset === "config.yaml") {
      continue;
    }
    result.converted.push({
      kind: "strict_scaffold_asset",
      targetPath: `${STRICT_WORKFLOW_DIR}/${createdAsset}`,
      note: "Initialized strict scaffold asset pending dedicated legacy content converters.",
    });
  }

  for (const legacyFile of legacyFiles) {
    if (legacyFile === LEGACY_CONFIG_PATH) {
      continue;
    }
    const deferredArtifact = describeDeferredLegacyArtifact(legacyFile);
    result.skipped.push({
      kind: deferredArtifact.kind,
      sourcePath: legacyFile,
      reason: deferredArtifact.reason,
    });
    result.warnings.push(
      makeDiagnostic("converter_unavailable", deferredArtifact.reason, legacyFile),
    );
    result.manualFollowUp.push({
      sourcePath: legacyFile,
      reason: deferredArtifact.reason,
      recommendation: deferredArtifact.recommendation,
    });
  }

  result.valid = true;
  return sortMigrationResult(result);
}
