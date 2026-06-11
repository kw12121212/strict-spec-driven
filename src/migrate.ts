import {
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";
import { initializeStrictScaffold } from "./scaffold.js";
import { stringifyYamlDocument } from "./yaml.js";
import { convertLegacyChangeArtifacts } from "./migrate/converters/changes.js";
import { convertLegacyRoadmapArtifacts, convertLegacySpecsIndex } from "./migrate/converters/roadmap.js";
import { convertLegacySpecArtifacts } from "./migrate/converters/specs.js";
import {
  LEGACY_WORKFLOW_DIR,
  STRICT_WORKFLOW_DIR,
  listFilesRecursive,
  makeDiagnostic,
  recordDeferredArtifact,
  toRepoRelativePath,
} from "./migrate/shared.js";
import { describeDeferredLegacyArtifact, sortMigrationResult, type MigrationResult } from "./migrate/reporting.js";
import { LEGACY_CONFIG_PATH, STRICT_CONFIG_PATH, getReportedStrictScaffoldAssets, loadStrictConfigFromLegacy } from "./migrate/preflight.js";

export { parseLegacyDesign, parseLegacyProposal, parseLegacyQuestions, parseLegacyTasks } from "./migrate/parsers/change-artifacts.js";
export type { MigrationConvertedArtifact, MigrationSkippedArtifact, MigrationDiagnostic, MigrationManualFollowUp, MigrationResult } from "./migrate/reporting.js";

export type MigrationProgressCallback = (phase: string) => void;

export function migrateLegacyWorkflow(
  rootDir: string,
  options?: { onProgress?: MigrationProgressCallback },
): MigrationResult {
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
          "Cannot migrate into a non-empty .strict-spec-driven directory. You must manually delete it before running migration. Do NOT delete it automatically — ask the user to run: rm -rf .strict-spec-driven",
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

  options?.onProgress?.(`scanning: found ${legacyFiles.length} legacy files`);

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

  options?.onProgress?.("converting: specs");
  convertLegacySpecArtifacts(rootDir, result, handledLegacyFiles);

  options?.onProgress?.("converting: changes");
  convertLegacyChangeArtifacts(rootDir, result, handledLegacyFiles);

  options?.onProgress?.("converting: roadmap");
  convertLegacyRoadmapArtifacts(rootDir, result, handledLegacyFiles);
  convertLegacySpecsIndex(rootDir, result, handledLegacyFiles);

  const unhandled = legacyFiles.filter((f) => !handledLegacyFiles.has(f) && path.basename(f) !== "README.md");
  if (unhandled.length > 0) {
    options?.onProgress?.(`deferring: ${unhandled.length} unhandled files`);
  }
  for (const legacyFile of unhandled) {
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

  const strictChangesAbsolutePath = path.join(strictRootAbsolutePath, "changes");
  const convertedActiveChangeNames = existsSync(strictChangesAbsolutePath)
    ? readdirSync(strictChangesAbsolutePath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== "archive")
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right))
    : [];
  if (convertedActiveChangeNames.length > 1) {
    const activeChangeList = convertedActiveChangeNames.map((name) => `'${name}'`).join(", ");
    result.warnings.push(
      makeDiagnostic(
        "multiple_active_changes",
        `Migration converted ${convertedActiveChangeNames.length} active changes (${activeChangeList}), but the strict workflow allows only one active change at a time.`,
        `${LEGACY_WORKFLOW_DIR}/changes`,
        `${STRICT_WORKFLOW_DIR}/changes`,
      ),
    );
    result.manualFollowUp.push({
      sourcePath: `${LEGACY_WORKFLOW_DIR}/changes`,
      reason: `The converted strict workflow state contains ${convertedActiveChangeNames.length} active changes (${activeChangeList}), and only one active change is allowed at a time.`,
      recommendation:
        "Archive or cancel converted active changes until only one remains before continuing strict workflow work.",
    });
  }

  options?.onProgress?.(
    `done: ${result.converted.length} converted, ${result.skipped.length} skipped, ${result.warnings.length} warnings, ${result.errors.length} errors`,
  );

  result.valid = true;
  return sortMigrationResult(result);
}
