import {
  existsSync,
  readFileSync,
  statSync,
} from "fs";
import path from "path";
import { toPosix } from "../../diagnostics.js";
import { convertRoadmapIndex, convertRoadmapMilestone, convertSpecsIndex } from "../../converters/roadmap.js";
import {
  LEGACY_WORKFLOW_DIR,
  STRICT_WORKFLOW_DIR,
  buildStrictMarkdownTargetPath,
  listFilesRecursive,
  makeConversionFailure,
  recordDeferredArtifact,
  toRepoRelativePath,
  writeYamlFile,
} from "../shared.js";
import type { MigrationResult } from "../../migrate.js";

const LEGACY_ROADMAP_DIR = `${LEGACY_WORKFLOW_DIR}/roadmap`;
const STRICT_ROADMAP_DIR = `${STRICT_WORKFLOW_DIR}/roadmap`;

export function convertLegacyRoadmapArtifacts(
  rootDir: string,
  result: MigrationResult,
  handledLegacyFiles: Set<string>,
): void {
  const legacyRoadmapRoot = path.join(rootDir, LEGACY_ROADMAP_DIR);
  if (!existsSync(legacyRoadmapRoot) || !statSync(legacyRoadmapRoot).isDirectory()) {
    return;
  }

  const legacyIndexPath = `${LEGACY_ROADMAP_DIR}/INDEX.md`;
  const legacyIndexAbsPath = path.join(legacyRoadmapRoot, "INDEX.md");
  if (existsSync(legacyIndexAbsPath) && statSync(legacyIndexAbsPath).isFile()) {
    handledLegacyFiles.add(legacyIndexPath);
    try {
      const content = readFileSync(legacyIndexAbsPath, "utf8");
      const conversionResult = convertRoadmapIndex(content);
      if (!conversionResult.ok) {
        recordDeferredArtifact(
          result,
          legacyIndexPath,
          conversionResult.reason,
          conversionResult.recommendation,
          "legacy_markdown_artifact",
          "conversion_ambiguous",
        );
      } else {
        const strictIndexPath = `${STRICT_ROADMAP_DIR}/INDEX.yaml`;
        writeYamlFile(buildStrictMarkdownTargetPath(rootDir, strictIndexPath), conversionResult.artifact);
        result.converted.push({
          kind: "roadmap_index",
          sourcePath: legacyIndexPath,
          targetPath: strictIndexPath,
          note: "Migrated legacy roadmap index into a strict YAML roadmap_index artifact.",
        });
      }
    } catch (error) {
      const deferredArtifact = makeConversionFailure(legacyIndexPath, error);
      recordDeferredArtifact(
        result,
        legacyIndexPath,
        deferredArtifact.reason,
        deferredArtifact.recommendation,
        deferredArtifact.kind,
        "conversion_ambiguous",
      );
    }
  }

  const legacyMilestonesRoot = path.join(legacyRoadmapRoot, "milestones");
  if (!existsSync(legacyMilestonesRoot) || !statSync(legacyMilestonesRoot).isDirectory()) {
    return;
  }

  const milestoneFiles = listFilesRecursive(legacyMilestonesRoot)
    .map((absolutePath) => toRepoRelativePath(rootDir, absolutePath))
    .filter((repoRelativePath) => repoRelativePath.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right));

  for (const legacyMilestoneFile of milestoneFiles) {
    handledLegacyFiles.add(legacyMilestoneFile);
    try {
      const content = readFileSync(path.join(rootDir, legacyMilestoneFile), "utf8");
      const filename = path.basename(legacyMilestoneFile);
      const conversionResult = convertRoadmapMilestone(content, filename);
      if (!conversionResult.ok) {
        recordDeferredArtifact(
          result,
          legacyMilestoneFile,
          conversionResult.reason,
          conversionResult.recommendation,
          "legacy_markdown_artifact",
          "conversion_ambiguous",
        );
        continue;
      }
      const strictMilestonePath = toPosix(
        legacyMilestoneFile
          .replace(`${LEGACY_ROADMAP_DIR}/`, `${STRICT_ROADMAP_DIR}/`)
          .replace(/\.md$/i, ".yaml")
          .replace(/milestones\/\d+-/, (match) => match.replace(/\d+/, (digits) => digits.padStart(4, "0"))),
      );
      writeYamlFile(buildStrictMarkdownTargetPath(rootDir, strictMilestonePath), conversionResult.artifact);
      result.converted.push({
        kind: "roadmap_milestone",
        sourcePath: legacyMilestoneFile,
        targetPath: strictMilestonePath,
        note: "Migrated legacy roadmap milestone into a strict YAML roadmap_milestone artifact.",
      });
    } catch (error) {
      const deferredArtifact = makeConversionFailure(legacyMilestoneFile, error);
      recordDeferredArtifact(
        result,
        legacyMilestoneFile,
        deferredArtifact.reason,
        deferredArtifact.recommendation,
        deferredArtifact.kind,
        "conversion_ambiguous",
      );
    }
  }
}

export function convertLegacySpecsIndex(
  rootDir: string,
  result: MigrationResult,
  handledLegacyFiles: Set<string>,
): void {
  const legacySpecsIndexPath = `${LEGACY_WORKFLOW_DIR}/specs/INDEX.md`;
  const legacySpecsIndexAbsPath = path.join(rootDir, LEGACY_WORKFLOW_DIR, "specs", "INDEX.md");

  if (!existsSync(legacySpecsIndexAbsPath) || !statSync(legacySpecsIndexAbsPath).isFile()) {
    return;
  }

  handledLegacyFiles.add(legacySpecsIndexPath);

  const strictSpecsIndexPath = `${STRICT_WORKFLOW_DIR}/specs/INDEX.yaml`;
  const strictSpecsIndexAbsPath = path.join(rootDir, STRICT_WORKFLOW_DIR, "specs", "INDEX.yaml");

  if (existsSync(strictSpecsIndexAbsPath)) {
    result.converted.push({
      kind: "spec_index",
      sourcePath: legacySpecsIndexPath,
      targetPath: strictSpecsIndexPath,
      note: "Legacy specs index converted: strict spec index regenerated from migrated spec artifacts.",
    });
    return;
  }

  try {
    const content = readFileSync(legacySpecsIndexAbsPath, "utf8");
    const conversionResult = convertSpecsIndex(content);
    if (!conversionResult.ok) {
      recordDeferredArtifact(
        result,
        legacySpecsIndexPath,
        conversionResult.reason,
        conversionResult.recommendation,
        "legacy_markdown_artifact",
        "conversion_ambiguous",
      );
      return;
    }
    writeYamlFile(strictSpecsIndexAbsPath, conversionResult.artifact);
    result.converted.push({
      kind: "spec_index",
      sourcePath: legacySpecsIndexPath,
      targetPath: strictSpecsIndexPath,
      note: "Migrated legacy specs index into a strict YAML spec_index artifact.",
    });
  } catch (error) {
    const deferredArtifact = makeConversionFailure(legacySpecsIndexPath, error);
    recordDeferredArtifact(
      result,
      legacySpecsIndexPath,
      deferredArtifact.reason,
      deferredArtifact.recommendation,
      deferredArtifact.kind,
      "conversion_ambiguous",
    );
  }
}
