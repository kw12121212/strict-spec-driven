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
import { archiveChange } from "./archive.js";

export type CommandHandler = (argv: string[]) => number | void;
export const commands: Record<string, CommandHandler> = {};
const CHANGE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STRICT_WORKFLOW_DIR = ".strict-spec-driven";

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
