import {
  existsSync,
  readFileSync,
  statSync,
} from "fs";
import path from "path";
import { toPosix } from "../../diagnostics.js";
import { toKebabCase } from "../parsers/shared.js";
import {
  parseLegacyDesign,
  parseLegacyProposal,
  parseLegacyQuestions,
  parseLegacyTasks,
} from "../parsers/change-artifacts.js";
import { parseLegacyDeltaSpec } from "../parsers/specs.js";
import {
  LEGACY_WORKFLOW_DIR,
  STRICT_WORKFLOW_DIR,
  buildStrictMarkdownTargetPath,
  listFilesRecursive,
  listLegacyChangeDirectories,
  makeConversionFailure,
  recordDeferredArtifact,
  replaceMarkdownExtension,
  toRepoRelativePath,
  writeYamlFile,
} from "../shared.js";
import type { MigrationConvertedArtifact, MigrationResult } from "../../migrate.js";

export function convertLegacyChangeArtifacts(
  rootDir: string,
  result: MigrationResult,
  handledLegacyFiles: Set<string>,
): void {
  for (const changeDirectory of listLegacyChangeDirectories(rootDir)) {
    const fallbackChangeId = changeDirectory.archived
      ? toKebabCase(changeDirectory.directoryName.replace(/^\d{4}-\d{2}-\d{2}-/, ""))
      : toKebabCase(changeDirectory.directoryName);
    let changeId = fallbackChangeId;

    const legacyProposalPath = path.join(changeDirectory.legacyDirectoryPath, "proposal.md");
    const repoRelativeProposalPath = `${changeDirectory.repoRelativeDirectory}/proposal.md`;
    if (existsSync(legacyProposalPath) && statSync(legacyProposalPath).isFile()) {
      handledLegacyFiles.add(repoRelativeProposalPath);
      try {
        const proposalArtifact = parseLegacyProposal(
          repoRelativeProposalPath,
          readFileSync(legacyProposalPath, "utf8"),
          fallbackChangeId,
          changeDirectory.archived,
        );
        changeId = proposalArtifact.change.id;
        const strictTargetPath = `${changeDirectory.strictDirectoryPath.replace(`${rootDir}/`, "")}/proposal.yaml`;
        writeYamlFile(path.join(changeDirectory.strictDirectoryPath, "proposal.yaml"), proposalArtifact);
        result.converted.push({
          kind: "change_proposal",
          sourcePath: repoRelativeProposalPath,
          targetPath: toPosix(strictTargetPath),
          note: "Migrated legacy Markdown proposal into a strict YAML change_proposal artifact.",
        });
      } catch (error) {
        const deferredArtifact = makeConversionFailure(repoRelativeProposalPath, error);
        recordDeferredArtifact(
          result,
          repoRelativeProposalPath,
          deferredArtifact.reason,
          deferredArtifact.recommendation,
          deferredArtifact.kind,
          "conversion_ambiguous",
        );
      }
    }

    const changeArtifactFiles: Array<{
      legacyName: string;
      targetName: string;
      kind: MigrationConvertedArtifact["kind"];
      convert: (sourcePath: string, content: string, resolvedChangeId: string) => unknown;
      note: string;
    }> = [
      {
        legacyName: "design.md",
        targetName: "design.yaml",
        kind: "change_design",
        convert: parseLegacyDesign,
        note: "Migrated legacy Markdown design into a strict YAML change_design artifact.",
      },
      {
        legacyName: "tasks.md",
        targetName: "tasks.yaml",
        kind: "task_list",
        convert: parseLegacyTasks,
        note: "Migrated legacy Markdown tasks into a strict YAML task_list artifact.",
      },
      {
        legacyName: "questions.md",
        targetName: "questions.yaml",
        kind: "question_list",
        convert: parseLegacyQuestions,
        note: "Migrated legacy Markdown questions into a strict YAML question_list artifact.",
      },
    ];

    for (const artifactFile of changeArtifactFiles) {
      const legacyFilePath = path.join(changeDirectory.legacyDirectoryPath, artifactFile.legacyName);
      const repoRelativeLegacyFilePath = `${changeDirectory.repoRelativeDirectory}/${artifactFile.legacyName}`;
      if (!existsSync(legacyFilePath) || !statSync(legacyFilePath).isFile()) {
        continue;
      }
      handledLegacyFiles.add(repoRelativeLegacyFilePath);
      try {
        const artifact = artifactFile.convert(
          repoRelativeLegacyFilePath,
          readFileSync(legacyFilePath, "utf8"),
          changeId,
        );
        const strictTargetPath = `${changeDirectory.strictDirectoryPath.replace(`${rootDir}/`, "")}/${artifactFile.targetName}`;
        writeYamlFile(path.join(changeDirectory.strictDirectoryPath, artifactFile.targetName), artifact);
        result.converted.push({
          kind: artifactFile.kind,
          sourcePath: repoRelativeLegacyFilePath,
          targetPath: toPosix(strictTargetPath),
          note: artifactFile.note,
        });
      } catch (error) {
        const deferredArtifact = makeConversionFailure(repoRelativeLegacyFilePath, error);
        recordDeferredArtifact(
          result,
          repoRelativeLegacyFilePath,
          deferredArtifact.reason,
          deferredArtifact.recommendation,
          deferredArtifact.kind,
          "conversion_ambiguous",
        );
      }
    }

    const legacyDeltaSpecsRoot = path.join(changeDirectory.legacyDirectoryPath, "specs");
    if (existsSync(legacyDeltaSpecsRoot) && statSync(legacyDeltaSpecsRoot).isDirectory()) {
      const deltaSpecFiles = listFilesRecursive(legacyDeltaSpecsRoot)
        .map((absolutePath) => toRepoRelativePath(rootDir, absolutePath))
        .filter((repoRelativePath) => repoRelativePath.endsWith(".md"))
        .sort((left, right) => left.localeCompare(right));

      for (const legacyDeltaSpecPath of deltaSpecFiles) {
        handledLegacyFiles.add(legacyDeltaSpecPath);
        try {
          const deltaArtifact = parseLegacyDeltaSpec(
            legacyDeltaSpecPath,
            readFileSync(path.join(rootDir, legacyDeltaSpecPath), "utf8"),
          );
          const strictTargetPath = replaceMarkdownExtension(
            legacyDeltaSpecPath
              .replace(`${LEGACY_WORKFLOW_DIR}/changes/`, `${STRICT_WORKFLOW_DIR}/changes/`)
              .replace("/specs/", "/specs/"),
          );
          writeYamlFile(buildStrictMarkdownTargetPath(rootDir, strictTargetPath), deltaArtifact);
          result.converted.push({
            kind: "delta_spec",
            sourcePath: legacyDeltaSpecPath,
            targetPath: strictTargetPath,
            note: "Migrated legacy Markdown delta spec into a strict YAML delta_spec artifact.",
          });
        } catch (error) {
          const deferredArtifact = makeConversionFailure(legacyDeltaSpecPath, error);
          recordDeferredArtifact(
            result,
            legacyDeltaSpecPath,
            deferredArtifact.reason,
            deferredArtifact.recommendation,
            deferredArtifact.kind,
            "conversion_ambiguous",
          );
        }
      }
    }
  }
}
