import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import {
  ROADMAP_DIR,
  ROADMAP_ARCHIVE_DIR,
  ROADMAP_ARCHIVE_PLANNED_CHANGES_DIR,
  ROADMAP_INDEX_PATH,
  ROADMAP_MILESTONES_DIR,
  type RoadmapDiagnostic,
  type LoadedMilestone,
  type LoadedPlannedChange,
  type LoadedRoadmap,
} from "./model.js";
import {
  isRecord,
  listYamlFiles,
  makeDiagnostic,
  normalizeRepoRelativePath,
  readYamlFile,
  sortDiagnostics,
  toPosix,
} from "./shared.js";
import { validateMilestoneArtifact, validateRoadmapIndexArtifact } from "./validate.js";
import { validateStandalonePlannedChangeArtifact } from "./validate.js";
import { formatYamlParseSummary, getYamlDiagnosticDetails, getYamlParseDetails } from "../yaml.js";

export type LoadRoadmapOptions = {
  allowInlinePlannedChanges?: boolean;
};

function isInsideDirectory(filePath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, filePath);
  return relativePath.length > 0 && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function listStandalonePlannedChangeFiles(
  roadmapDir: string,
  indexPath: string,
  milestonesDir: string,
  archiveDir: string,
): string[] {
  return listYamlFiles(roadmapDir).filter((filePath) => {
    if (filePath === indexPath) return false;
    if (isInsideDirectory(filePath, milestonesDir)) return false;
    if (isInsideDirectory(filePath, archiveDir)) return false;
    return true;
  });
}

function appendLegacyInlinePlannedChangeDiagnostic(
  artifactPath: string,
  plannedChangeIds: string[],
  diagnostics: RoadmapDiagnostic[],
): void {
  diagnostics.push(
    makeDiagnostic(
      "semantic",
      artifactPath,
      "$.planned_changes",
      "inline milestone planned_changes are no longer supported; run the materialization form of the strict-roadmap-transition skill's sync operation (repository equivalent: `node scripts/strict-spec-driven.js roadmap-sync --materialize-planned-changes`) to convert them into standalone planned-change files",
      "empty mapping after materialization",
      plannedChangeIds.join(", "),
    ),
  );
}

export function loadRoadmap(rootDir: string, options: LoadRoadmapOptions = {}): LoadedRoadmap {
  const warnings: string[] = [];
  const diagnostics: RoadmapDiagnostic[] = [];
  const roadmapDir = path.join(rootDir, ROADMAP_DIR);
  const archiveDir = path.join(rootDir, ROADMAP_ARCHIVE_DIR);
  const indexPath = path.join(rootDir, ROADMAP_INDEX_PATH);
  const milestonesDir = path.join(rootDir, ROADMAP_MILESTONES_DIR);

  if (!existsSync(roadmapDir) || !statSync(roadmapDir).isDirectory()) {
    diagnostics.push(
      makeDiagnostic("schema", ROADMAP_DIR, "$", "strict roadmap directory not found", ROADMAP_DIR, "missing"),
    );
    return { warnings, diagnostics, indexArtifact: null, milestones: [], plannedChanges: [] };
  }

  let indexArtifact = null;
  if (existsSync(indexPath)) {
    try {
      indexArtifact = validateRoadmapIndexArtifact(readYamlFile(indexPath), ROADMAP_INDEX_PATH, diagnostics);
    } catch (error) {
      const yamlDetails = getYamlParseDetails(error);
      const yamlDiagnosticDetails = getYamlDiagnosticDetails(error);
      diagnostics.push(
        {
          ...makeDiagnostic(
            "schema",
            ROADMAP_INDEX_PATH,
            "$",
            "failed to parse roadmap index YAML",
            "parseable YAML mapping",
            yamlDetails ? formatYamlParseSummary(yamlDetails) : error instanceof Error ? error.message : String(error),
          ),
          ...yamlDiagnosticDetails,
        },
      );
    }
  } else {
    diagnostics.push(
      makeDiagnostic("schema", ROADMAP_INDEX_PATH, "$", "roadmap index is missing", ROADMAP_INDEX_PATH, "missing"),
    );
  }

  const milestoneFiles = listYamlFiles(milestonesDir);
  if (milestoneFiles.length === 0) {
    warnings.push("roadmap/milestones/ is empty");
  }

  const milestones: LoadedMilestone[] = [];
  for (const absolutePath of milestoneFiles) {
    const artifactPath = normalizeRepoRelativePath(rootDir, absolutePath);
    try {
      const raw = readFileSync(absolutePath, "utf8");
       const artifact = validateMilestoneArtifact(readYamlFile(absolutePath), artifactPath, diagnostics);
       if (!artifact) continue;
       const inlinePlannedChangeIds = Object.keys(artifact.planned_changes);
       if (!options.allowInlinePlannedChanges && inlinePlannedChangeIds.length > 0) {
         appendLegacyInlinePlannedChangeDiagnostic(artifactPath, inlinePlannedChangeIds, diagnostics);
       }
       const relativeMilestonePath = toPosix(path.relative(milestonesDir, absolutePath));
       milestones.push({
         absolutePath,
         artifactPath,
        file: path.basename(relativeMilestonePath),
        relativeMilestonePath,
        repoRelativePath: normalizeRepoRelativePath(rootDir, absolutePath),
        raw,
        artifact,
      });
    } catch (error) {
      const yamlDetails = getYamlParseDetails(error);
      const yamlDiagnosticDetails = getYamlDiagnosticDetails(error);
      diagnostics.push(
        {
          ...makeDiagnostic(
            "schema",
            artifactPath,
            "$",
            "failed to parse roadmap milestone YAML",
            "parseable YAML mapping",
            yamlDetails ? formatYamlParseSummary(yamlDetails) : error instanceof Error ? error.message : String(error),
          ),
          ...yamlDiagnosticDetails,
        },
      );
    }
  }

  const plannedChanges: LoadedPlannedChange[] = [];
  for (const absolutePath of listStandalonePlannedChangeFiles(roadmapDir, indexPath, milestonesDir, archiveDir)) {
    const artifactPath = normalizeRepoRelativePath(rootDir, absolutePath);
    try {
      const raw = readFileSync(absolutePath, "utf8");
      const artifact = validateStandalonePlannedChangeArtifact(readYamlFile(absolutePath), artifactPath, diagnostics);
      if (!artifact) continue;
      const relativeRoadmapPath = toPosix(path.relative(roadmapDir, absolutePath));
      plannedChanges.push({
        absolutePath,
        artifactPath,
        file: path.basename(relativeRoadmapPath),
        relativeRoadmapPath,
        repoRelativePath: normalizeRepoRelativePath(rootDir, absolutePath),
        raw,
        artifact,
      });
    } catch (error) {
      const yamlDetails = getYamlParseDetails(error);
      const yamlDiagnosticDetails = getYamlDiagnosticDetails(error);
      diagnostics.push(
        {
          ...makeDiagnostic(
            "schema",
            artifactPath,
            "$",
            "failed to parse roadmap planned-change YAML",
            "parseable YAML mapping",
            yamlDetails ? formatYamlParseSummary(yamlDetails) : error instanceof Error ? error.message : String(error),
          ),
          ...yamlDiagnosticDetails,
        },
      );
    }
  }

  return {
    warnings,
    diagnostics: sortDiagnostics(diagnostics),
    indexArtifact,
    milestones,
    plannedChanges,
  };
}

/**
 * Collect the set of planned-change ids that have been relocated into the
 * roadmap archive. Archiving moves completed standalone planned-change files
 * into ROADMAP_ARCHIVE_PLANNED_CHANGES_DIR without deleting them, so a planned
 * change in the active roadmap may legitimately depend on completed-and-archived
 * work. These ids are used only to satisfy dependency-target membership checks;
 * they never re-enter active validation, status derivation, or cycle detection.
 *
 * The archive holds frozen history, so unreadable or malformed archived files
 * are skipped silently rather than producing diagnostics.
 */
export function loadArchivedPlannedChangeIds(rootDir: string): Set<string> {
  const archivePlannedChangesDir = path.join(rootDir, ROADMAP_ARCHIVE_PLANNED_CHANGES_DIR);
  const ids = new Set<string>();
  if (!existsSync(archivePlannedChangesDir) || !statSync(archivePlannedChangesDir).isDirectory()) {
    return ids;
  }

  for (const absolutePath of listYamlFiles(archivePlannedChangesDir)) {
    try {
      const parsed = readYamlFile(absolutePath);
      if (!isRecord(parsed)) continue;
      const plannedChange = parsed.planned_change;
      if (!isRecord(plannedChange)) continue;
      const id = plannedChange.id;
      if (typeof id === "string" && id.length > 0) {
        ids.add(id);
      }
    } catch {
      // Archived history is frozen; an unreadable archived file does not block
      // active dependency resolution.
    }
  }

  return ids;
}
