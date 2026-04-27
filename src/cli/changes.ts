import { existsSync, readFileSync } from "fs";
import path from "path";
import { parseYamlDocument } from "../yaml.js";
import { listDirectoryNames } from "./fs.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";

type TaskListArtifact = {
  sections?: Record<string, Record<string, { status?: string }>>;
};

type QuestionListArtifact = {
  open?: unknown[];
};

export type ActiveChangeSummary = {
  name: string;
  status: string;
};

export function getChangesDir(rootDir: string): string {
  return path.join(rootDir, STRICT_WORKFLOW_DIR, "changes");
}

export function getArchiveDir(rootDir: string): string {
  return path.join(getChangesDir(rootDir), "archive");
}

export function readActiveChangeStatus(rootDir: string, changeName: string): string {
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

    for (const taskMap of Object.values(tasksArtifact.sections ?? {})) {
      for (const task of Object.values(taskMap ?? {})) {
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

export function listActiveChanges(rootDir: string): ActiveChangeSummary[] {
  return listDirectoryNames(getChangesDir(rootDir))
    .filter((name) => name !== "archive")
    .map((name) => ({
      name,
      status: readActiveChangeStatus(rootDir, name),
    }));
}

export function listArchivedChanges(rootDir: string): string[] {
  return listDirectoryNames(getArchiveDir(rootDir));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findArchivedMatchesByBareName(rootDir: string, bareName: string): string[] {
  const archivedChangePattern = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escapeRegExp(bareName)}(?:-\\d+)?$`);
  return listArchivedChanges(rootDir).filter((archiveDirName) => archivedChangePattern.test(archiveDirName));
}
