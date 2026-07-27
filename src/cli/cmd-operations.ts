import { existsSync, readFileSync, statSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { getRoadmapStatus } from "../roadmap.js";
import { validateStrictSkillPackaging } from "../skills.js";
import { parseYamlDocument } from "../yaml.js";
import { handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { findArchivedMatchesByBareName, getArchiveDir, listArchivedChanges } from "./changes.js";
import { normalizeRepoRelativePath } from "./fs.js";
import { writeErr, writeError, writeJson, writeUsage } from "./output.js";
import { verifySpecMappings } from "./spec-mapping.js";
import { getTechStatus, verifyTechMappings } from "./tech-mapping.js";

export type ShipResult = {
  changeName: string;
  archivePath: string;
  proposalSummary: string;
  roadmapSnapshot: ReturnType<typeof getRoadmapStatus>;
};

export function runShip(argv: string[]): number {
  const [target, ...extraArgs] = argv;
  if (handleHelpRequest("ship", argv)) {
    return 0;
  }
  if (!target || extraArgs.length > 0) {
    writeUsage(getCommandUsage("ship"));
    return 1;
  }

  const rootDir = process.cwd();
  const archiveRoot = getArchiveDir(rootDir);

  let resolvedArchiveName: string | null = null;
  const exactDir = path.join(archiveRoot, target);
  if (existsSync(exactDir) && statSync(exactDir).isDirectory()) {
    resolvedArchiveName = target;
  } else {
    const bareMatches = findArchivedMatchesByBareName(rootDir, target);
    if (bareMatches.length > 1) {
      writeError(`ambiguous archived change name '${target}'; matched: ${bareMatches.join(", ")}`);
      writeErr("Specify the full archive directory name to disambiguate.\n");
      return 1;
    }
    if (bareMatches.length === 1) {
      resolvedArchiveName = bareMatches[0];
    }
  }

  if (!resolvedArchiveName) {
    writeError(`archived change '${target}' not found`);
    return 1;
  }

  const resolvedArchiveDir = path.join(archiveRoot, resolvedArchiveName);
  const archivePath = normalizeRepoRelativePath(rootDir, resolvedArchiveDir);

  let proposalSummary = "";
  const proposalPath = path.join(resolvedArchiveDir, "proposal.yaml");
  if (existsSync(proposalPath)) {
    try {
      const proposalDoc = parseYamlDocument<Record<string, unknown>>(readFileSync(proposalPath, "utf8"));
      const summary = proposalDoc.summary;
      if (summary && typeof summary === "object" && !Array.isArray(summary)) {
        const what = (summary as Record<string, unknown>).what;
        if (Array.isArray(what)) {
          proposalSummary = what.filter((item): item is string => typeof item === "string").join(" ");
        } else if (typeof what === "string") {
          proposalSummary = what;
        }
      }
    } catch {
      // proposal.yaml missing or unparseable — leave proposalSummary empty
    }
  }

  const roadmapSnapshot = getRoadmapStatus(rootDir);

  const result: ShipResult = {
    changeName: resolvedArchiveName,
    archivePath,
    proposalSummary,
    roadmapSnapshot,
  };

  writeJson(result);
  return 0;
}

export function runValidateSkills(argv: string[]): number {
  if (handleHelpRequest("validate-skills", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("validate-skills"));
    return 1;
  }

  const result = validateStrictSkillPackaging(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runVerifySpecMappings(argv: string[]): number {
  if (handleHelpRequest("verify-spec-mappings", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("verify-spec-mappings"));
    return 1;
  }

  const result = verifySpecMappings(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runVerifyTechMappings(argv: string[]): number {
  if (handleHelpRequest("verify-tech-mappings", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("verify-tech-mappings"));
    return 1;
  }

  const result = verifyTechMappings(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runTechStatus(argv: string[]): number {
  if (handleHelpRequest("tech-status", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("tech-status"));
    return 1;
  }

  writeJson(getTechStatus(process.cwd()));
  return 0;
}

const ARCHIVE_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

function getDirectoryCreationTimeMs(directoryPath: string): number {
  const stats = statSync(directoryPath);
  return stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.ctimeMs;
}

export function runCommitAndPush(argv: string[]): number {
  if (handleHelpRequest("commit-and-push", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("commit-and-push"));
    return 1;
  }

  const rootDir = process.cwd();
  const archiveRoot = getArchiveDir(rootDir);
  const archived = listArchivedChanges(rootDir);

  if (archived.length === 0) {
    writeError("no archived changes found under .strict-spec-driven/changes/archive/");
    return 1;
  }

  const dated = archived
    .map((name) => {
      const match = ARCHIVE_DATE_PATTERN.exec(name);
      return match
        ? {
            dirName: name,
            createdAtMs: getDirectoryCreationTimeMs(path.join(archiveRoot, name)),
            bareName: match[2],
          }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.createdAtMs - a.createdAtMs || b.dirName.localeCompare(a.dirName));

  if (dated.length === 0) {
    writeError("no date-prefixed archived changes found under .strict-spec-driven/changes/archive/");
    return 1;
  }

  const latest = dated[0];
  const commitMessage = `feat: ${latest.bareName}`;

  try {
    execSync("git add .", { cwd: rootDir, stdio: "pipe" });
  } catch (e) {
    writeError(`git add failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  try {
    execSync(`git commit -m ${JSON.stringify(commitMessage)}`, { cwd: rootDir, stdio: "pipe" });
  } catch (e) {
    const output = e instanceof Error && "stdout" in e ? String((e as { stdout: Buffer }).stdout) : "";
    if (output.includes("nothing to commit")) {
      writeError("nothing to commit, working tree clean");
      return 1;
    }
    writeError(`git commit failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  try {
    execSync("git push", { cwd: rootDir, stdio: "pipe" });
  } catch (e) {
    writeJson({ changeName: latest.bareName, archiveDir: latest.dirName, commitMessage, pushed: false, pushError: e instanceof Error ? e.message : String(e) });
    return 1;
  }

  writeJson({ changeName: latest.bareName, archiveDir: latest.dirName, commitMessage, pushed: true });
  return 0;
}
