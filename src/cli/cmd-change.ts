import { existsSync, rmSync, statSync } from "fs";
import path from "path";
import { applyTask, readChangeTasks, writeChangeTasks } from "../apply.js";
import { archiveChange } from "../archive.js";
import { verifyChange } from "../verify.js";
import { CHANGE_NAME_PATTERN, handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import {
  findArchivedMatchesByBareName,
  getArchiveDir,
  getChangesDir,
  listActiveChanges,
  listArchivedChanges,
} from "./changes.js";
import { listYamlFiles, normalizeRepoRelativePath } from "./fs.js";
import { writeError, writeJson, writeOut, writeUsage } from "./output.js";
import { withRerenderedDocuments } from "./generated-document-rerender.js";

export function printChangeArtifacts(rootDir: string, name: string, changeDir: string): void {
  writeOut(`Artifacts for '${name}':\n`);

  for (const artifact of ["proposal.yaml", "design.yaml", "tasks.yaml", "questions.yaml"]) {
    const artifactPath = path.join(changeDir, artifact);
    const displayPath = normalizeRepoRelativePath(rootDir, artifactPath);
    writeOut(`  ${displayPath}${existsSync(artifactPath) ? "" : " (missing)"}\n`);
  }

  const specsDir = path.join(changeDir, "specs");
  const specFiles = listYamlFiles(specsDir);
  if (specFiles.length === 0) {
    writeOut(`  ${normalizeRepoRelativePath(rootDir, specsDir)}/ (empty)\n`);
    return;
  }
  for (const specFile of specFiles) {
    writeOut(`  ${normalizeRepoRelativePath(rootDir, specFile)}\n`);
  }
}

export function runApply(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (handleHelpRequest("apply", argv)) {
    return 0;
  }
  if (!changeName || extraArgs.length > 0) {
    writeUsage(getCommandUsage("apply"));
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    writeError("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }

  try {
    const tasksYaml = readChangeTasks(process.cwd(), changeName);
    const { result, updatedYaml } = applyTask(tasksYaml);
    writeChangeTasks(process.cwd(), changeName, updatedYaml);
    writeJson(result);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}

export function runVerify(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (handleHelpRequest("verify", argv)) {
    return 0;
  }
  if (!changeName || extraArgs.length > 0) {
    writeUsage(getCommandUsage("verify"));
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    writeError("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }

  try {
    const result = verifyChange(process.cwd(), changeName);
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}

export function runArchive(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (handleHelpRequest("archive", argv)) {
    return 0;
  }
  if (!changeName || extraArgs.length > 0) {
    writeUsage(getCommandUsage("archive"));
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    writeError("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }

  try {
    const result = withRerenderedDocuments(process.cwd(), archiveChange(process.cwd(), changeName));
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}

export function runList(argv: string[]): number {
  if (handleHelpRequest("list", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("list"));
    return 1;
  }

  const rootDir = process.cwd();
  const changesDir = getChangesDir(rootDir);
  if (!existsSync(changesDir) || !statSync(changesDir).isDirectory()) {
    writeOut("No .strict-spec-driven/changes/ directory found.\n");
    return 0;
  }

  const activeChanges = listActiveChanges(rootDir);
  if (activeChanges.length > 0) {
    writeOut("Active:\n");
    for (const activeChange of activeChanges) {
      writeOut(`  ${activeChange.name}    ${activeChange.status}\n`);
    }
  }

  const archivedChanges = listArchivedChanges(rootDir);
  if (archivedChanges.length > 0) {
    writeOut("Archived:\n");
    for (const archivedChange of archivedChanges) {
      writeOut(`  ${archivedChange}\n`);
    }
  }

  if (activeChanges.length === 0 && archivedChanges.length === 0) {
    writeOut("No changes.\n");
  }

  return 0;
}

export function runModify(argv: string[]): number {
  const [target, ...extraArgs] = argv;
  if (handleHelpRequest("modify", argv)) {
    return 0;
  }
  if (extraArgs.length > 0) {
    writeUsage(getCommandUsage("modify"));
    return 1;
  }

  const rootDir = process.cwd();
  if (!target) {
    const activeChanges = listActiveChanges(rootDir);
    if (activeChanges.length === 0) {
      writeOut("No active changes.\n");
      return 0;
    }

    writeOut("Active changes:\n");
    for (const activeChange of activeChanges) {
      writeOut(`  ${activeChange.name}    ${activeChange.status}\n`);
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
    writeError(
      `archived targets require exact archive directory names (YYYY-MM-DD-<name>); matched: ${archivedBareMatches.join(", ")}`,
    );
    return 1;
  }

  writeError(`change '${target}' not found`);
  return 1;
}

export function runCancel(argv: string[]): number {
  const [target, ...extraArgs] = argv;
  if (handleHelpRequest("cancel", argv)) {
    return 0;
  }
  if (!target || extraArgs.length > 0) {
    writeUsage(getCommandUsage("cancel"));
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(target)) {
    writeError("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }

  const rootDir = process.cwd();
  const archiveRoot = getArchiveDir(rootDir);
  const archivedTargetDir = path.join(archiveRoot, target);
  if (existsSync(archivedTargetDir) && statSync(archivedTargetDir).isDirectory()) {
    writeError(`cancel is limited to active changes; archived target '${target}' cannot be cancelled`);
    return 1;
  }

  const activeTargetDir = path.join(getChangesDir(rootDir), target);
  if (existsSync(activeTargetDir) && statSync(activeTargetDir).isDirectory()) {
    rmSync(activeTargetDir, { recursive: true, force: true });
    writeOut(`Cancelled: ${normalizeRepoRelativePath(rootDir, activeTargetDir)}\n`);
    return 0;
  }

  const archivedBareMatches = findArchivedMatchesByBareName(rootDir, target);
  if (archivedBareMatches.length > 0) {
    writeError(`cancel is limited to active changes; '${target}' is archived as ${archivedBareMatches.join(", ")}`);
    return 1;
  }

  writeError(`change '${target}' not found`);
  return 1;
}
