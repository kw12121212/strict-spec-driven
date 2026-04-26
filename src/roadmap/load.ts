import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import {
  ROADMAP_DIR,
  ROADMAP_INDEX_PATH,
  ROADMAP_MILESTONES_DIR,
  type RoadmapDiagnostic,
  type LoadedMilestone,
  type LoadedRoadmap,
} from "./model.js";
import {
  listYamlFiles,
  makeDiagnostic,
  normalizeRepoRelativePath,
  readYamlFile,
  sortDiagnostics,
  toPosix,
} from "./shared.js";
import { validateMilestoneArtifact, validateRoadmapIndexArtifact } from "./validate.js";

export function loadRoadmap(rootDir: string): LoadedRoadmap {
  const warnings: string[] = [];
  const diagnostics: RoadmapDiagnostic[] = [];
  const roadmapDir = path.join(rootDir, ROADMAP_DIR);
  const indexPath = path.join(rootDir, ROADMAP_INDEX_PATH);
  const milestonesDir = path.join(rootDir, ROADMAP_MILESTONES_DIR);

  if (!existsSync(roadmapDir) || !statSync(roadmapDir).isDirectory()) {
    diagnostics.push(
      makeDiagnostic("schema", ROADMAP_DIR, "$", "strict roadmap directory not found", ROADMAP_DIR, "missing"),
    );
    return { warnings, diagnostics, indexArtifact: null, milestones: [] };
  }

  let indexArtifact = null;
  if (existsSync(indexPath)) {
    try {
      indexArtifact = validateRoadmapIndexArtifact(readYamlFile(indexPath), ROADMAP_INDEX_PATH, diagnostics);
    } catch (error) {
      diagnostics.push(
        makeDiagnostic(
          "schema",
          ROADMAP_INDEX_PATH,
          "$",
          "failed to parse roadmap index YAML",
          "parseable YAML mapping",
          error instanceof Error ? error.message : String(error),
        ),
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
      diagnostics.push(
        makeDiagnostic(
          "schema",
          artifactPath,
          "$",
          "failed to parse roadmap milestone YAML",
          "parseable YAML mapping",
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  return {
    warnings,
    diagnostics: sortDiagnostics(diagnostics),
    indexArtifact,
    milestones,
  };
}
