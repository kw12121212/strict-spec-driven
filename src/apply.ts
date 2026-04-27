import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";

export type ApplyResult = {
  sectionName: string;
  taskId: string;
  taskText: string;
  totalTasks: number;
  remainingPending: number;
};

type TaskMap = Record<string, { text: string; status: string; command?: string }>;

export function applyTask(tasksYamlContent: string): { result: ApplyResult; updatedYaml: string } {
  const artifact = parseYamlDocument<{ sections: Record<string, TaskMap> }>(tasksYamlContent);
  let totalTasks = 0;
  let targetSectionName = "";
  let targetTaskId = "";
  let targetTaskText = "";

  for (const [sectionName, taskMap] of Object.entries(artifact.sections)) {
    for (const [taskId, task] of Object.entries(taskMap)) {
      totalTasks += 1;
      if (!targetTaskId && task.status === "pending") {
        targetSectionName = sectionName;
        targetTaskId = taskId;
        targetTaskText = task.text;
        task.status = "complete";
      }
    }
  }

  if (!targetTaskId) {
    throw new Error("no pending tasks remain");
  }

  let complete = 0;
  for (const taskMap of Object.values(artifact.sections)) {
    for (const task of Object.values(taskMap)) {
      if (task.status === "complete") complete++;
    }
  }

  return {
    result: {
      sectionName: targetSectionName,
      taskId: targetTaskId,
      taskText: targetTaskText,
      totalTasks,
      remainingPending: totalTasks - complete,
    },
    updatedYaml: stringifyYamlDocument(artifact),
  };
}

export function readChangeTasks(rootDir: string, changeName: string): string {
  const tasksPath = path.join(rootDir, ".strict-spec-driven", "changes", changeName, "tasks.yaml");
  if (!existsSync(tasksPath)) {
    throw new Error(`change '${changeName}' not found`);
  }
  return readFileSync(tasksPath, "utf8");
}

export function writeChangeTasks(rootDir: string, changeName: string, content: string): void {
  const tasksPath = path.join(rootDir, ".strict-spec-driven", "changes", changeName, "tasks.yaml");
  writeFileSync(tasksPath, content, "utf8");
}
