import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";
import { toPosix } from "../diagnostics.js";
import { parseYamlDocument, stringifyYamlDocument } from "../yaml.js";
import type {
  MigrationDiagnostic,
  MigrationResult,
  MigrationSkippedArtifact,
} from "../migrate.js";

export const LEGACY_WORKFLOW_DIR = ".spec-driven";
export const STRICT_WORKFLOW_DIR = ".strict-spec-driven";

export type LegacyChangeDirectory = {
  legacyDirectoryPath: string;
  repoRelativeDirectory: string;
  strictDirectoryPath: string;
  directoryName: string;
  archived: boolean;
};

export type DeferredLegacyArtifact = {
  kind: "legacy_markdown_artifact" | "legacy_project_state";
  reason: string;
  recommendation: string;
};

export function toRepoRelativePath(rootDir: string, absolutePath: string): string {
  return toPosix(path.relative(rootDir, absolutePath));
}

export function listFilesRecursive(directoryPath: string): string[] {
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

export function makeDiagnostic(
  code: string,
  message: string,
  sourcePath?: string,
  targetPath?: string,
): MigrationDiagnostic {
  return { code, message, sourcePath, targetPath };
}

export function readYamlFile<T>(filePath: string): T {
  return parseYamlDocument<T>(readFileSync(filePath, "utf8"));
}

export function writeYamlFile(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, stringifyYamlDocument(value), "utf8");
}

export function replaceMarkdownExtension(repoRelativePath: string): string {
  return repoRelativePath.replace(/\.md$/i, ".yaml");
}

export function buildStrictMarkdownTargetPath(rootDir: string, repoRelativeTargetPath: string): string {
  return path.join(rootDir, ...repoRelativeTargetPath.split("/"));
}

export function listLegacyChangeDirectories(rootDir: string): LegacyChangeDirectory[] {
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

export function recordDeferredArtifact(
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

export function makeConversionFailure(sourcePath: string, error: unknown): DeferredLegacyArtifact {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: "legacy_markdown_artifact",
    reason: `Legacy core workflow artifact uses an unsupported or ambiguous Markdown shape: ${message}`,
    recommendation:
      "Review this legacy artifact and either normalize it to the canonical Markdown structure or extend the converter before treating the migration as complete.",
  };
}
