import {
  existsSync,
  readFileSync,
  statSync,
} from "fs";
import path from "path";
import { asObject, isRecord } from "../parsers/shared.js";
import { parseLegacyMainSpec } from "../parsers/specs.js";
import {
  LEGACY_WORKFLOW_DIR,
  STRICT_WORKFLOW_DIR,
  buildStrictMarkdownTargetPath,
  listFilesRecursive,
  makeConversionFailure,
  readYamlFile,
  recordDeferredArtifact,
  replaceMarkdownExtension,
  toRepoRelativePath,
  writeYamlFile,
} from "../shared.js";
import type { MigrationResult } from "../../migrate.js";

const SPEC_INDEX_SCHEMA_FILE = "templates/strict-spec-driven/schemas/spec-index.yaml";

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

export function regenerateStrictSpecIndex(rootDir: string): void {
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

export function convertLegacySpecArtifacts(
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
