#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";
import { compileSchema, createSchemaValidator } from "./validation.js";
import {
  findMissingRequiredChangeTemplateAssets,
  findMissingRequiredScaffoldAssets,
  getBundledScaffoldPath,
  getRequiredBundledChangeTemplateAssets,
  getRequiredBundledScaffoldAssets,
  initializeStrictChangeScaffold,
  initializeStrictScaffold,
  loadBundledScaffoldYaml,
  readBundledScaffoldTemplate,
} from "./scaffold.js";
import { applyTask, readChangeTasks, writeChangeTasks } from "./apply.js";
import { verifyChange } from "./verify.js";
import { reviewChange } from "./review.js";
import { archiveChange } from "./archive.js";

export type CommandHandler = (argv: string[]) => number | void;
export const commands: Record<string, CommandHandler> = {};
const CHANGE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const LEGACY_SPECS_DIR = path.join(".spec-driven", "specs");
const EXCLUDED_MAPPING_SPEC_BASENAMES = new Set(["INDEX.md", "README.md"]);

type TaskListArtifact = {
  sections?: Array<{
    tasks?: Array<{
      status?: string;
    }>;
  }>;
};

type QuestionListArtifact = {
  open?: unknown[];
};

type ActiveChangeSummary = {
  name: string;
  status: string;
};

type MappingField = "implementation" | "tests";

type MappingAuditDiagnostic = {
  source: "mapping_input" | "mapping_coverage" | "unmapped_evidence";
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
};

type VerifySpecMappingsResult = {
  valid: boolean;
  diagnostics: MappingAuditDiagnostic[];
  summary: {
    specCount: number;
    mappedImplementationCount: number;
    mappedTestCount: number;
    candidateImplementationCount: number;
    candidateTestCount: number;
    unmappedImplementationCount: number;
    unmappedTestCount: number;
  };
};
export { parseYamlDocument, stringifyYamlDocument };
export { compileSchema, createSchemaValidator };
export {
  getBundledScaffoldPath,
  readBundledScaffoldTemplate,
  loadBundledScaffoldYaml,
  getRequiredBundledScaffoldAssets,
  findMissingRequiredScaffoldAssets,
  getRequiredBundledChangeTemplateAssets,
  findMissingRequiredChangeTemplateAssets,
  initializeStrictScaffold,
  initializeStrictChangeScaffold,
};
export { applyTask, readChangeTasks, writeChangeTasks };
export { verifyChange };
export { reviewChange };
export { archiveChange };

function normalizeRepoRelativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function getChangesDir(rootDir: string): string {
  return path.join(rootDir, STRICT_WORKFLOW_DIR, "changes");
}

function getArchiveDir(rootDir: string): string {
  return path.join(getChangesDir(rootDir), "archive");
}

function listDirectoryNames(directoryPath: string): string[] {
  if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) {
    return [];
  }

  return readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function readActiveChangeStatus(rootDir: string, changeName: string): string {
  const changeDir = path.join(getChangesDir(rootDir), changeName);
  const questionsPath = path.join(changeDir, "questions.yaml");
  const tasksPath = path.join(changeDir, "tasks.yaml");

  try {
    if (existsSync(questionsPath)) {
      const questionsArtifact = parseYamlDocument<QuestionListArtifact>(readFileSync(questionsPath, "utf8"));
      if (Array.isArray(questionsArtifact.open) && questionsArtifact.open.length > 0) {
        return "blocked";
      }
    }

    if (!existsSync(tasksPath)) {
      return "proposed";
    }

    const tasksArtifact = parseYamlDocument<TaskListArtifact>(readFileSync(tasksPath, "utf8"));
    let total = 0;
    let complete = 0;

    for (const section of tasksArtifact.sections ?? []) {
      for (const task of section.tasks ?? []) {
        total += 1;
        if (task.status === "complete") {
          complete += 1;
        }
      }
    }

    if (total === 0 || complete === 0) {
      return "proposed";
    }
    if (complete === total) {
      return "done";
    }
    return `in-progress (${complete}/${total})`;
  } catch {
    return "invalid";
  }
}

function listActiveChanges(rootDir: string): ActiveChangeSummary[] {
  return listDirectoryNames(getChangesDir(rootDir))
    .filter((name) => name !== "archive")
    .map((name) => ({
      name,
      status: readActiveChangeStatus(rootDir, name),
    }));
}

function listArchivedChanges(rootDir: string): string[] {
  return listDirectoryNames(getArchiveDir(rootDir));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findArchivedMatchesByBareName(rootDir: string, bareName: string): string[] {
  const archivedChangePattern = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escapeRegExp(bareName)}(?:-\\d+)?$`);
  return listArchivedChanges(rootDir).filter((archiveDirName) => archivedChangePattern.test(archiveDirName));
}

function listYamlFiles(directoryPath: string): string[] {
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
      if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        files.push(fullPath);
      }
    }
  }

  walk(directoryPath);
  return files;
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

function normalizePathSeparators(value: string): string {
  return value.split(path.sep).join("/");
}

function makeMappingDiagnostic(
  source: MappingAuditDiagnostic["source"],
  artifactPath: string,
  fieldPath: string,
  message: string,
  expected?: string,
  actual?: string,
): MappingAuditDiagnostic {
  return { source, artifactPath, fieldPath, message, expected, actual };
}

function normalizeMappedPath(
  rootDir: string,
  artifactPath: string,
  field: MappingField,
  index: number,
  rawPath: unknown,
  diagnostics: MappingAuditDiagnostic[],
): string | null {
  const fieldPath = `$.mapping.${field}[${index}]`;
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        fieldPath,
        "mapping entry must be a non-empty string",
        "non-empty repo-relative path",
        String(rawPath),
      ),
    );
    return null;
  }

  const normalizedInput = rawPath.trim().replaceAll("\\", "/");
  if (path.isAbsolute(normalizedInput)) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        fieldPath,
        "mapping entry must be repo-relative",
        "repo-relative path",
        normalizedInput,
      ),
    );
    return null;
  }

  const resolved = path.resolve(rootDir, normalizedInput);
  const repoRelative = normalizeRepoRelativePath(rootDir, resolved);
  if (repoRelative === ".." || repoRelative.startsWith("../")) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        fieldPath,
        "mapping entry cannot traverse outside repository",
        "path inside repository",
        normalizedInput,
      ),
    );
    return null;
  }

  if (repoRelative !== normalizedInput) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        fieldPath,
        "mapping entry must be normalized repo-relative path",
        repoRelative,
        normalizedInput,
      ),
    );
    return null;
  }

  if (!existsSync(path.join(rootDir, repoRelative))) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        fieldPath,
        "mapping entry points to a file that does not exist",
        "existing file path",
        normalizedInput,
      ),
    );
    return null;
  }

  return repoRelative;
}

function parseSpecMapping(
  rootDir: string,
  specPath: string,
  diagnostics: MappingAuditDiagnostic[],
): { implementation: string[]; tests: string[] } | null {
  const artifactPath = normalizeRepoRelativePath(rootDir, specPath);
  const content = readFileSync(specPath, "utf8").replace(/\r\n?/g, "\n");
  const lines = content.split("\n");

  if (lines[0] !== "---") {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        "$.mapping",
        "spec is missing mapping frontmatter",
        "frontmatter with mapping fields",
      ),
    );
    return null;
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingIndex === -1) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        "$.mapping",
        "spec mapping frontmatter is unterminated",
        "closing --- line",
      ),
    );
    return null;
  }

  let frontmatter: unknown;
  try {
    frontmatter = parseYamlDocument<unknown>(lines.slice(1, closingIndex).join("\n"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        "$.mapping",
        "spec mapping frontmatter is not valid YAML",
        "parseable YAML mapping",
        message,
      ),
    );
    return null;
  }

  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        "$.mapping",
        "spec mapping frontmatter must be a YAML mapping",
        "YAML mapping",
      ),
    );
    return null;
  }

  const mappingValue = (frontmatter as Record<string, unknown>).mapping;
  if (!mappingValue || typeof mappingValue !== "object" || Array.isArray(mappingValue)) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        "$.mapping",
        "spec mapping frontmatter must define mapping.implementation and mapping.tests arrays",
        "mapping object",
      ),
    );
    return null;
  }

  const mapping = mappingValue as Record<string, unknown>;
  const normalized: { implementation: string[]; tests: string[] } = {
    implementation: [],
    tests: [],
  };

  for (const field of ["implementation", "tests"] as const) {
    const value = mapping[field];
    const fieldPath = `$.mapping.${field}`;

    if (!Array.isArray(value)) {
      diagnostics.push(
        makeMappingDiagnostic(
          "mapping_coverage",
          artifactPath,
          fieldPath,
          `mapping.${field} must be an array`,
          "array of repo-relative paths",
          String(value),
        ),
      );
      continue;
    }

    if (value.length === 0) {
      diagnostics.push(
        makeMappingDiagnostic(
          "mapping_coverage",
          artifactPath,
          fieldPath,
          `mapping.${field} must contain at least one mapped path`,
          "non-empty array",
          "[]",
        ),
      );
      continue;
    }

    value.forEach((entry, index) => {
      const mappedPath = normalizeMappedPath(rootDir, artifactPath, field, index, entry, diagnostics);
      if (mappedPath) {
        normalized[field].push(mappedPath);
      }
    });
  }

  return normalized;
}

function collectEvidenceCandidates(rootDir: string): { implementation: string[]; tests: string[] } {
  const implementation = listFilesRecursive(path.join(rootDir, "src"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => normalizeRepoRelativePath(rootDir, file));
  for (const file of ["package.json", "tsconfig.json"]) {
    if (existsSync(path.join(rootDir, file))) {
      implementation.push(file);
    }
  }

  const tests = listFilesRecursive(path.join(rootDir, "test"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => normalizeRepoRelativePath(rootDir, file));

  const dedupeSort = (values: string[]) => [...new Set(values.map((value) => normalizePathSeparators(value)))].sort();
  return {
    implementation: dedupeSort(implementation),
    tests: dedupeSort(tests),
  };
}

function sortMappingDiagnostics(diagnostics: MappingAuditDiagnostic[]): MappingAuditDiagnostic[] {
  return diagnostics.sort((left, right) => {
    const leftKey = [
      left.source,
      left.artifactPath,
      left.fieldPath,
      left.message,
      left.expected ?? "",
      left.actual ?? "",
    ].join("|");
    const rightKey = [
      right.source,
      right.artifactPath,
      right.fieldPath,
      right.message,
      right.expected ?? "",
      right.actual ?? "",
    ].join("|");
    return leftKey.localeCompare(rightKey);
  });
}

function verifySpecMappings(rootDir: string): VerifySpecMappingsResult {
  const diagnostics: MappingAuditDiagnostic[] = [];
  const specsDir = path.join(rootDir, LEGACY_SPECS_DIR);

  const mapped = {
    implementation: new Set<string>(),
    tests: new Set<string>(),
  };

  if (!existsSync(specsDir) || !statSync(specsDir).isDirectory()) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_input",
        LEGACY_SPECS_DIR,
        "$",
        "spec mapping inputs are unavailable because .spec-driven/specs/ does not exist",
        "existing .spec-driven/specs/ directory",
      ),
    );
  }

  const specFiles =
    diagnostics.length === 0
      ? listFilesRecursive(specsDir).filter((filePath) => {
          const basename = path.basename(filePath);
          return basename.endsWith(".md") && !EXCLUDED_MAPPING_SPEC_BASENAMES.has(basename);
        })
      : [];

  if (diagnostics.length === 0 && specFiles.length === 0) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_input",
        LEGACY_SPECS_DIR,
        "$",
        "spec mapping inputs are unavailable because no main spec files were found",
        "at least one main spec markdown file",
      ),
    );
  }

  for (const specFile of specFiles) {
    const mapping = parseSpecMapping(rootDir, specFile, diagnostics);
    if (!mapping) {
      continue;
    }
    mapping.implementation.forEach((value) => mapped.implementation.add(value));
    mapping.tests.forEach((value) => mapped.tests.add(value));
  }

  let evidenceCandidates = { implementation: [] as string[], tests: [] as string[] };
  let unmappedImplementation: string[] = [];
  let unmappedTests: string[] = [];
  const hasInputErrors = diagnostics.some((diagnostic) => diagnostic.source === "mapping_input");
  if (!hasInputErrors) {
    evidenceCandidates = collectEvidenceCandidates(rootDir);
    unmappedImplementation = evidenceCandidates.implementation.filter((file) => !mapped.implementation.has(file));
    unmappedTests = evidenceCandidates.tests.filter((file) => !mapped.tests.has(file));

    for (const unmappedPath of unmappedImplementation) {
      diagnostics.push(
        makeMappingDiagnostic(
          "unmapped_evidence",
          unmappedPath,
          "$",
          "implementation file is not referenced by any spec mapping",
          "mapped by at least one spec mapping.implementation entry",
          "unmapped",
        ),
      );
    }
    for (const unmappedPath of unmappedTests) {
      diagnostics.push(
        makeMappingDiagnostic(
          "unmapped_evidence",
          unmappedPath,
          "$",
          "test file is not referenced by any spec mapping",
          "mapped by at least one spec mapping.tests entry",
          "unmapped",
        ),
      );
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics: sortMappingDiagnostics(diagnostics),
    summary: {
      specCount: specFiles.length,
      mappedImplementationCount: mapped.implementation.size,
      mappedTestCount: mapped.tests.size,
      candidateImplementationCount: evidenceCandidates.implementation.length,
      candidateTestCount: evidenceCandidates.tests.length,
      unmappedImplementationCount: unmappedImplementation.length,
      unmappedTestCount: unmappedTests.length,
    },
  };
}

function printChangeArtifacts(rootDir: string, name: string, changeDir: string): void {
  process.stdout.write(`Artifacts for '${name}':\n`);

  for (const artifact of ["proposal.yaml", "design.yaml", "tasks.yaml", "questions.yaml"]) {
    const artifactPath = path.join(changeDir, artifact);
    const displayPath = normalizeRepoRelativePath(rootDir, artifactPath);
    process.stdout.write(`  ${displayPath}${existsSync(artifactPath) ? "" : " (missing)"}\n`);
  }

  const specsDir = path.join(changeDir, "specs");
  const specFiles = listYamlFiles(specsDir);
  if (specFiles.length === 0) {
    process.stdout.write(`  ${normalizeRepoRelativePath(rootDir, specsDir)}/ (empty)\n`);
    return;
  }
  for (const specFile of specFiles) {
    process.stdout.write(`  ${normalizeRepoRelativePath(rootDir, specFile)}\n`);
  }
}

function runInit(): number {
  const missingAssets = findMissingRequiredScaffoldAssets();
  if (missingAssets.length > 0) {
    process.stderr.write("Error: missing bundled scaffold assets required by init:\n");
    for (const assetPath of missingAssets) {
      process.stderr.write(`- ${assetPath}\n`);
    }
    return 1;
  }

  const result = initializeStrictScaffold(process.cwd());

  for (const warning of result.warnings) {
    process.stderr.write(`${warning}\n`);
  }
  process.stdout.write(`Initialized ${result.rootDir}\n`);
  process.stdout.write(`Created ${result.created.length} scaffold file(s).\n`);
  process.stdout.write(`Skipped ${result.skipped.length} existing scaffold file(s).\n`);
  return 0;
}

function runPropose(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (!changeName || extraArgs.length > 0) {
    process.stderr.write("Usage: strict-spec-driven propose <change-name>\n");
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    process.stderr.write("Error: change name must be kebab-case (lowercase letters, numbers, and hyphens)\n");
    return 1;
  }

  const missingAssets = findMissingRequiredChangeTemplateAssets();
  if (missingAssets.length > 0) {
    process.stderr.write("Error: missing bundled change templates required by propose:\n");
    for (const assetPath of missingAssets) {
      process.stderr.write(`- ${assetPath}\n`);
    }
    return 1;
  }

  try {
    const result = initializeStrictChangeScaffold(process.cwd(), changeName);
    process.stdout.write(`Created strict change scaffold at ${result.changeDir}/\n`);
    process.stdout.write("Planning artifacts:\n");
    for (const artifactPath of result.planningArtifacts) {
      process.stdout.write(`- ${artifactPath}\n`);
    }
    process.stdout.write(`- ${result.specsDir}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }
}

commands.init = () => runInit();
commands.propose = (argv) => runPropose(argv);

function runApply(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (!changeName || extraArgs.length > 0) {
    process.stderr.write("Usage: strict-spec-driven apply <change-name>\n");
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    process.stderr.write("Error: change name must be kebab-case (lowercase letters, numbers, and hyphens)\n");
    return 1;
  }

  try {
    const tasksYaml = readChangeTasks(process.cwd(), changeName);
    const { result, updatedYaml } = applyTask(tasksYaml);
    writeChangeTasks(process.cwd(), changeName, updatedYaml);
    process.stdout.write(JSON.stringify(result) + "\n");
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }
}

commands.apply = (argv) => runApply(argv);

function runVerify(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (!changeName || extraArgs.length > 0) {
    process.stderr.write("Usage: strict-spec-driven verify <change-name>\n");
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    process.stderr.write("Error: change name must be kebab-case (lowercase letters, numbers, and hyphens)\n");
    return 1;
  }

  try {
    const result = verifyChange(process.cwd(), changeName);
    process.stdout.write(JSON.stringify(result) + "\n");
    return result.valid ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }
}

commands.verify = (argv) => runVerify(argv);

function runReview(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (!changeName || extraArgs.length > 0) {
    process.stderr.write("Usage: strict-spec-driven review <change-name>\n");
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    process.stderr.write("Error: change name must be kebab-case (lowercase letters, numbers, and hyphens)\n");
    return 1;
  }

  try {
    const result = reviewChange(process.cwd(), changeName);
    process.stdout.write(JSON.stringify(result) + "\n");
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }
}

commands.review = (argv) => runReview(argv);

function runVerifySpecMappings(argv: string[]): number {
  if (argv.length > 0) {
    process.stderr.write("Usage: strict-spec-driven verify-spec-mappings\n");
    return 1;
  }

  const result = verifySpecMappings(process.cwd());
  process.stdout.write(JSON.stringify(result) + "\n");
  return result.valid ? 0 : 1;
}

commands["verify-spec-mappings"] = (argv) => runVerifySpecMappings(argv);

function runArchive(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (!changeName || extraArgs.length > 0) {
    process.stderr.write("Usage: strict-spec-driven archive <change-name>\n");
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    process.stderr.write("Error: change name must be kebab-case (lowercase letters, numbers, and hyphens)\n");
    return 1;
  }

  try {
    const result = archiveChange(process.cwd(), changeName);
    process.stdout.write(JSON.stringify(result) + "\n");
    return result.valid ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }
}

commands.archive = (argv) => runArchive(argv);

function runList(argv: string[]): number {
  if (argv.length > 0) {
    process.stderr.write("Usage: strict-spec-driven list\n");
    return 1;
  }

  const rootDir = process.cwd();
  const changesDir = getChangesDir(rootDir);
  if (!existsSync(changesDir) || !statSync(changesDir).isDirectory()) {
    process.stdout.write("No .strict-spec-driven/changes/ directory found.\n");
    return 0;
  }

  const activeChanges = listActiveChanges(rootDir);
  if (activeChanges.length > 0) {
    process.stdout.write("Active:\n");
    for (const activeChange of activeChanges) {
      process.stdout.write(`  ${activeChange.name}    ${activeChange.status}\n`);
    }
  }

  const archivedChanges = listArchivedChanges(rootDir);
  if (archivedChanges.length > 0) {
    process.stdout.write("Archived:\n");
    for (const archivedChange of archivedChanges) {
      process.stdout.write(`  ${archivedChange}\n`);
    }
  }

  if (activeChanges.length === 0 && archivedChanges.length === 0) {
    process.stdout.write("No changes.\n");
  }

  return 0;
}

commands.list = (argv) => runList(argv);

function runModify(argv: string[]): number {
  const [target, ...extraArgs] = argv;
  if (extraArgs.length > 0) {
    process.stderr.write("Usage: strict-spec-driven modify [change-name|archive-dir]\n");
    return 1;
  }

  const rootDir = process.cwd();
  if (!target) {
    const activeChanges = listActiveChanges(rootDir);
    if (activeChanges.length === 0) {
      process.stdout.write("No active changes.\n");
      return 0;
    }

    process.stdout.write("Active changes:\n");
    for (const activeChange of activeChanges) {
      process.stdout.write(`  ${activeChange.name}    ${activeChange.status}\n`);
    }
    return 0;
  }

  const activeTargetDir = path.join(getChangesDir(rootDir), target);
  if (existsSync(activeTargetDir) && statSync(activeTargetDir).isDirectory()) {
    printChangeArtifacts(rootDir, target, activeTargetDir);
    return 0;
  }

  const archiveRoot = getArchiveDir(rootDir);
  const archivedTargetDir = path.join(archiveRoot, target);
  if (existsSync(archivedTargetDir) && statSync(archivedTargetDir).isDirectory()) {
    printChangeArtifacts(rootDir, target, archivedTargetDir);
    return 0;
  }

  const archivedBareMatches = findArchivedMatchesByBareName(rootDir, target);
  if (archivedBareMatches.length > 0) {
    process.stderr.write(
      `Error: archived targets require exact archive directory names (YYYY-MM-DD-<name>); matched: ${archivedBareMatches.join(", ")}\n`,
    );
    return 1;
  }

  process.stderr.write(`Error: change '${target}' not found\n`);
  return 1;
}

commands.modify = (argv) => runModify(argv);

function runCancel(argv: string[]): number {
  const [target, ...extraArgs] = argv;
  if (!target || extraArgs.length > 0) {
    process.stderr.write("Usage: strict-spec-driven cancel <change-name>\n");
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(target)) {
    process.stderr.write("Error: change name must be kebab-case (lowercase letters, numbers, and hyphens)\n");
    return 1;
  }

  const rootDir = process.cwd();
  const archiveRoot = getArchiveDir(rootDir);
  const archivedTargetDir = path.join(archiveRoot, target);
  if (existsSync(archivedTargetDir) && statSync(archivedTargetDir).isDirectory()) {
    process.stderr.write(
      `Error: cancel is limited to active changes; archived target '${target}' cannot be cancelled\n`,
    );
    return 1;
  }

  const activeTargetDir = path.join(getChangesDir(rootDir), target);
  if (existsSync(activeTargetDir) && statSync(activeTargetDir).isDirectory()) {
    rmSync(activeTargetDir, { recursive: true, force: true });
    process.stdout.write(`Cancelled: ${normalizeRepoRelativePath(rootDir, activeTargetDir)}\n`);
    return 0;
  }

  const archivedBareMatches = findArchivedMatchesByBareName(rootDir, target);
  if (archivedBareMatches.length > 0) {
    process.stderr.write(
      `Error: cancel is limited to active changes; '${target}' is archived as ${archivedBareMatches.join(", ")}\n`,
    );
    return 1;
  }

  process.stderr.write(`Error: change '${target}' not found\n`);
  return 1;
}

commands.cancel = (argv) => runCancel(argv);

export function run(argv: string[]): number {
  const [subcommand, ...subcommandArgs] = argv;
  if (!subcommand || !(subcommand in commands)) {
    process.stderr.write("Usage: strict-spec-driven <command>\n");
    if (Object.keys(commands).length > 0) {
      process.stderr.write(`Commands: ${Object.keys(commands).join(", ")}\n`);
    }
    return 1;
  }
  const status = commands[subcommand](subcommandArgs);
  return typeof status === "number" ? status : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)));
}
