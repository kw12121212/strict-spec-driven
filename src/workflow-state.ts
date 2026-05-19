import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { flattenTasks } from "./task-list.js";
import { parseYamlDocument } from "./yaml.js";
import { verifyChange, type VerifyDiagnostic } from "./verify.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";

type QuestionListArtifact = {
  open?: Array<{ id?: unknown; question?: unknown; context?: unknown }>;
};

export type WorkflowSuggestion = {
  command: string;
  reason: string;
};

export type WorkflowStateResult = {
  changeName: string;
  valid: boolean;
  totalTasks: number;
  completeTasks: number;
  remainingPending: number;
  openQuestionCount: number;
  blockers: VerifyDiagnostic[];
  suggestions: WorkflowSuggestion[];
};

export type ProposalReadinessResult = {
  changeName: string;
  ready: boolean;
  diagnostics: VerifyDiagnostic[];
  suggestions: WorkflowSuggestion[];
};

function changeDir(rootDir: string, changeName: string): string {
  return path.join(rootDir, STRICT_WORKFLOW_DIR, "changes", changeName);
}

function toRepoPath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function listDeltaSpecFiles(rootDir: string, changeName: string): string[] {
  const specsDir = path.join(changeDir(rootDir, changeName), "specs");
  if (!existsSync(specsDir)) return [];
  const files: string[] = [];

  function walk(currentPath: string): void {
    for (const entry of readdirSync(currentPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        files.push(toRepoPath(rootDir, fullPath));
      }
    }
  }

  walk(specsDir);
  return files;
}

function readOpenQuestionIds(rootDir: string, changeName: string): string[] {
  const questionsPath = path.join(changeDir(rootDir, changeName), "questions.yaml");
  if (!existsSync(questionsPath)) return [];
  const artifact = parseYamlDocument<QuestionListArtifact>(readFileSync(questionsPath, "utf8"), {
    source: toRepoPath(rootDir, questionsPath),
  });
  return (artifact.open ?? [])
    .map((question) => question.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .sort();
}

function readFirstPendingTask(rootDir: string, changeName: string):
  | { sectionName: string; taskId: string; text: string; command?: string }
  | undefined {
  const tasksPath = path.join(changeDir(rootDir, changeName), "tasks.yaml");
  if (!existsSync(tasksPath)) return undefined;
  const artifact = parseYamlDocument<unknown>(readFileSync(tasksPath, "utf8"), { source: toRepoPath(rootDir, tasksPath) });
  return flattenTasks(artifact as { sections?: unknown }).find((task) => task.status !== "complete");
}

function suggestionsForDiagnostics(rootDir: string, changeName: string, diagnostics: VerifyDiagnostic[]): WorkflowSuggestion[] {
  const suggestions: WorkflowSuggestion[] = [];
  const openQuestionIds = readOpenQuestionIds(rootDir, changeName);
  for (const questionId of openQuestionIds) {
    suggestions.push({
      command: `strict-spec-driven generate ${changeName} questions --resolve ${questionId} --answer <answer>`,
      reason: `Resolve open question '${questionId}' after a human supplies the answer.`,
    });
  }

  const firstPendingTask = readFirstPendingTask(rootDir, changeName);
  if (firstPendingTask) {
    if (firstPendingTask.command) {
      suggestions.push({
        command: firstPendingTask.command,
        reason: `Run the command for pending task '${firstPendingTask.taskId}' before marking it complete.`,
      });
    }
    suggestions.push({
      command: `strict-spec-driven apply ${changeName}`,
      reason: `Mark pending task '${firstPendingTask.taskId}' complete after the work is done.`,
    });
  }

  if (diagnostics.some((diagnostic) => diagnostic.source !== "task_completion" && diagnostic.source !== "open_questions")) {
    suggestions.push({
      command: `strict-spec-driven verify ${changeName}`,
      reason: "Rerun strict verification after fixing reported artifact or workflow diagnostics.",
    });
  }

  if (diagnostics.length === 0) {
    suggestions.push({
      command: `/strict-spec-review ${changeName}`,
      reason: "Perform skill-driven code review after the change verifies cleanly.",
    });
  }

  return suggestions;
}

export function getWorkflowState(rootDir: string, changeName: string): WorkflowStateResult {
  const verification = verifyChange(rootDir, changeName);
  return {
    changeName,
    valid: verification.valid,
    totalTasks: verification.totalTasks,
    completeTasks: verification.completeTasks,
    remainingPending: verification.remainingPending,
    openQuestionCount: verification.openQuestionCount,
    blockers: verification.diagnostics,
    suggestions: suggestionsForDiagnostics(rootDir, changeName, verification.diagnostics),
  };
}

export function checkProposalReadiness(rootDir: string, changeName: string): ProposalReadinessResult {
  const verification = verifyChange(rootDir, changeName);
  const diagnostics = verification.diagnostics.filter((diagnostic) => diagnostic.source !== "task_completion");
  if (listDeltaSpecFiles(rootDir, changeName).length === 0) {
    diagnostics.push({
      source: "proposal_readiness",
      artifactPath: `.strict-spec-driven/changes/${changeName}/specs/`,
      fieldPath: "$",
      message: "change has no delta spec files for proposal handoff",
      expected: "at least one delta spec file or an explicit empty-spec decision",
      actual: "no delta spec files",
    });
  }
  diagnostics.sort((a, b) => {
    const aKey = [a.source, a.artifactPath, a.fieldPath, a.message].join("|");
    const bKey = [b.source, b.artifactPath, b.fieldPath, b.message].join("|");
    return aKey.localeCompare(bKey);
  });

  const suggestions = suggestionsForDiagnostics(rootDir, changeName, diagnostics);
  if (diagnostics.some((diagnostic) => diagnostic.source === "proposal_readiness")) {
    suggestions.push({
      command: `strict-spec-driven generate ${changeName} delta-spec --target-spec <spec-id> ...`,
      reason: "Create a target-spec-scoped delta spec when the change has strict spec impact.",
    });
  }

  return {
    changeName,
    ready: diagnostics.length === 0,
    diagnostics,
    suggestions,
  };
}
