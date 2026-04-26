import { existsSync, rmSync, statSync } from "fs";
import path from "path";
import { applyTask, readChangeTasks, writeChangeTasks } from "../apply.js";
import { archiveChange } from "../archive.js";
import { reviewChange } from "../review.js";
import { verifyChange } from "../verify.js";
import { CHANGE_NAME_PATTERN } from "./argv.js";
import {
  findArchivedMatchesByBareName,
  getArchiveDir,
  getChangesDir,
  listActiveChanges,
  listArchivedChanges,
} from "./changes.js";
import { listYamlFiles, normalizeRepoRelativePath } from "./fs.js";

export function printChangeArtifacts(rootDir: string, name: string, changeDir: string): void {
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

export function runApply(argv: string[]): number {
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

export function runVerify(argv: string[]): number {
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

export function runReview(argv: string[]): number {
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

export function runArchive(argv: string[]): number {
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

export function runList(argv: string[]): number {
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

export function runModify(argv: string[]): number {
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

export function runCancel(argv: string[]): number {
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
