import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";
import { convertRoadmapIndex, convertRoadmapMilestone, convertSpecsIndex } from "./converters/roadmap.js";
import { sortByDeterministicKey, toPosix } from "./diagnostics.js";
import { getRequiredBundledScaffoldAssets, initializeStrictScaffold, loadBundledScaffoldYaml } from "./scaffold.js";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";
import { asObject, isRecord, toKebabCase } from "./migrate/parsers/shared.js";
import { parseLegacyDeltaSpec, parseLegacyMainSpec } from "./migrate/parsers/specs.js";
import {
  parseLegacyDesign,
  parseLegacyProposal,
  parseLegacyQuestions,
  parseLegacyTasks,
} from "./migrate/parsers/change-artifacts.js";

const LEGACY_WORKFLOW_DIR = ".spec-driven";
const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const LEGACY_CONFIG_PATH = `${LEGACY_WORKFLOW_DIR}/config.yaml`;
const STRICT_CONFIG_PATH = `${STRICT_WORKFLOW_DIR}/config.yaml`;
const SPEC_INDEX_SCHEMA_FILE = "templates/strict-spec-driven/schemas/spec-index.yaml";
const LEGACY_ROADMAP_DIR = `${LEGACY_WORKFLOW_DIR}/roadmap`;
const STRICT_ROADMAP_DIR = `${STRICT_WORKFLOW_DIR}/roadmap`;

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
  | "main_spec"
  | "delta_spec"
  | "change_proposal"
  | "change_design"
  | "task_list"
  | "question_list"
  | "roadmap_index"
  | "roadmap_milestone"
  | "spec_index"
  | "legacy_markdown_artifact"
  | "legacy_project_state";

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

type DeferredLegacyArtifact = {
  kind: "legacy_markdown_artifact" | "legacy_project_state";
  reason: string;
  recommendation: string;
};

type StrictSpecIndexArtifact = {
  schema: "strict-spec-driven/spec-index/v1";
  schema_version: 1;
  artifact_type: "spec_index";
  schema_file: string;
  specs: Array<{
    id: string;
    title: string;
    path: string;
  }>;
};

type LegacyChangeDirectory = {
  legacyDirectoryPath: string;
  repoRelativeDirectory: string;
  strictDirectoryPath: string;
  directoryName: string;
  archived: boolean;
};

function toRepoRelativePath(rootDir: string, absolutePath: string): string {
  return toPosix(path.relative(rootDir, absolutePath));
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

function readYamlFile<T>(filePath: string): T {
  return parseYamlDocument<T>(readFileSync(filePath, "utf8"));
}

function writeYamlFile(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, stringifyYamlDocument(value), "utf8");
}

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

function replaceMarkdownExtension(repoRelativePath: string): string {
  return repoRelativePath.replace(/\.md$/i, ".yaml");
}

function buildStrictMarkdownTargetPath(rootDir: string, repoRelativeTargetPath: string): string {
  return path.join(rootDir, ...repoRelativeTargetPath.split("/"));
}

function listLegacyChangeDirectories(rootDir: string): LegacyChangeDirectory[] {
  const changesRoot = path.join(rootDir, LEGACY_WORKFLOW_DIR, "changes");
  if (!existsSync(changesRoot) || !statSync(changesRoot).isDirectory()) {
    return [];
  }

  const directories: LegacyChangeDirectory[] = [];
  const changeEntries = readdirSync(changesRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of changeEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name === "archive") {
      const archiveRoot = path.join(changesRoot, "archive");
      if (!existsSync(archiveRoot) || !statSync(archiveRoot).isDirectory()) {
        continue;
      }
      const archiveEntries = readdirSync(archiveRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const archiveEntry of archiveEntries) {
        if (!archiveEntry.isDirectory()) {
          continue;
        }
        directories.push({
          legacyDirectoryPath: path.join(archiveRoot, archiveEntry.name),
          repoRelativeDirectory: `${LEGACY_WORKFLOW_DIR}/changes/archive/${archiveEntry.name}`,
          strictDirectoryPath: path.join(rootDir, STRICT_WORKFLOW_DIR, "changes", "archive", archiveEntry.name),
          directoryName: archiveEntry.name,
          archived: true,
        });
      }
      continue;
    }

    directories.push({
      legacyDirectoryPath: path.join(changesRoot, entry.name),
      repoRelativeDirectory: `${LEGACY_WORKFLOW_DIR}/changes/${entry.name}`,
      strictDirectoryPath: path.join(rootDir, STRICT_WORKFLOW_DIR, "changes", entry.name),
      directoryName: entry.name,
      archived: false,
    });
  }

  return directories;
}

function recordDeferredArtifact(
  result: MigrationResult,
  sourcePath: string,
  reason: string,
  recommendation: string,
  kind: MigrationSkippedArtifact["kind"] = "legacy_markdown_artifact",
  code = "converter_unavailable",
): void {
  result.skipped.push({
    kind,
    sourcePath,
    reason,
  });
  result.warnings.push(makeDiagnostic(code, reason, sourcePath));
  result.manualFollowUp.push({
    sourcePath,
    reason,
    recommendation,
  });
}

function makeConversionFailure(sourcePath: string, error: unknown): DeferredLegacyArtifact {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: "legacy_markdown_artifact",
    reason: `Legacy core workflow artifact uses an unsupported or ambiguous Markdown shape: ${message}`,
    recommendation:
      "Review this legacy artifact and either normalize it to the canonical Markdown structure or extend the converter before treating the migration as complete.",
  };
}

export { parseLegacyDesign, parseLegacyProposal, parseLegacyQuestions, parseLegacyTasks };

function regenerateStrictSpecIndex(rootDir: string): void {
  const specsRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "specs");
  const indexPath = path.join(specsRoot, "INDEX.yaml");
  const specs = listFilesRecursive(specsRoot)
    .map((absolutePath) => ({
      absolutePath,
      repoRelativePath: toRepoRelativePath(rootDir, absolutePath),
    }))
    .filter(({ absolutePath }) => absolutePath.endsWith(".yaml") || absolutePath.endsWith(".yml"))
    .filter(({ absolutePath }) => path.basename(absolutePath) !== "INDEX.yaml")
    .map(({ absolutePath, repoRelativePath }) => {
      const artifact = readYamlFile<unknown>(absolutePath);
      if (!isRecord(artifact) || artifact.artifact_type !== "main_spec") {
        return null;
      }
      const spec = asObject(artifact.spec, `main spec '${repoRelativePath}' field 'spec'`);
      if (typeof spec.id !== "string" || typeof spec.title !== "string") {
        throw new Error(`main spec '${repoRelativePath}' is missing spec.id or spec.title`);
      }
      return {
        id: spec.id,
        title: spec.title,
        path: repoRelativePath,
      };
    })
    .filter((value): value is { id: string; title: string; path: string } => value !== null)
    .sort((left, right) => {
      const byPath = left.path.localeCompare(right.path);
      if (byPath !== 0) {
        return byPath;
      }
      return left.id.localeCompare(right.id);
    });

  const indexArtifact: StrictSpecIndexArtifact = existsSync(indexPath)
    ? {
        ...(readYamlFile<StrictSpecIndexArtifact>(indexPath)),
        schema: "strict-spec-driven/spec-index/v1",
        schema_version: 1,
        artifact_type: "spec_index",
        schema_file: SPEC_INDEX_SCHEMA_FILE,
        specs,
      }
    : {
        schema: "strict-spec-driven/spec-index/v1",
        schema_version: 1,
        artifact_type: "spec_index",
        schema_file: SPEC_INDEX_SCHEMA_FILE,
        specs,
      };
  writeYamlFile(indexPath, indexArtifact);
}

function convertLegacySpecArtifacts(
  rootDir: string,
  result: MigrationResult,
  handledLegacyFiles: Set<string>,
): boolean {
  const legacySpecsRoot = path.join(rootDir, LEGACY_WORKFLOW_DIR, "specs");
  if (!existsSync(legacySpecsRoot) || !statSync(legacySpecsRoot).isDirectory()) {
    return false;
  }

  let convertedAny = false;
  const legacySpecFiles = listFilesRecursive(legacySpecsRoot)
    .map((absolutePath) => toRepoRelativePath(rootDir, absolutePath))
    .filter((repoRelativePath) => repoRelativePath.endsWith(".md"))
    .filter((repoRelativePath) => path.basename(repoRelativePath) !== "INDEX.md" && path.basename(repoRelativePath) !== "README.md")
    .sort((left, right) => left.localeCompare(right));

  for (const legacySpecFile of legacySpecFiles) {
    handledLegacyFiles.add(legacySpecFile);
    try {
      const strictArtifact = parseLegacyMainSpec(
        legacySpecFile,
        readFileSync(path.join(rootDir, legacySpecFile), "utf8"),
      );
      const strictTargetPath = replaceMarkdownExtension(
        legacySpecFile.replace(`${LEGACY_WORKFLOW_DIR}/specs/`, `${STRICT_WORKFLOW_DIR}/specs/`),
      );
      writeYamlFile(
        buildStrictMarkdownTargetPath(rootDir, strictTargetPath),
        strictArtifact,
      );
      result.converted.push({
        kind: "main_spec",
        sourcePath: legacySpecFile,
        targetPath: strictTargetPath,
        note: "Migrated legacy Markdown main spec into a strict YAML main_spec artifact.",
      });
      convertedAny = true;
    } catch (error) {
      const deferredArtifact = makeConversionFailure(legacySpecFile, error);
      recordDeferredArtifact(
        result,
        legacySpecFile,
        deferredArtifact.reason,
        deferredArtifact.recommendation,
        deferredArtifact.kind,
        "conversion_ambiguous",
      );
    }
  }

  if (convertedAny) {
    regenerateStrictSpecIndex(rootDir);
  }

  return convertedAny;
}

function convertLegacyChangeArtifacts(
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

function convertLegacyRoadmapArtifacts(
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
          .replace(/\.md$/i, ".yaml"),
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

function convertLegacySpecsIndex(
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

  const scaffoldResult = initializeStrictScaffold(rootDir);
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
