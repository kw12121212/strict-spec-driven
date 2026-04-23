import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";

type Task = {
  id: string;
  text: string;
  status: string;
  command?: string;
};

type Section = {
  name: string;
  tasks: Task[];
};

type TaskListArtifact = {
  sections: Section[];
};

export type ApplyResult = {
  sectionName: string;
  taskId: string;
  taskText: string;
  totalTasks: number;
  remainingPending: number;
};

export function applyTask(tasksYamlContent: string): { result: ApplyResult; updatedYaml: string } {
  const artifact = parseYamlDocument<TaskListArtifact>(tasksYamlContent);
  let totalTasks = 0;
  let targetSection: Section | undefined;
  let targetTask: Task | undefined;

  for (const section of artifact.sections) {
    for (const task of section.tasks) {
      totalTasks += 1;
      if (!targetTask && task.status === "pending") {
        targetSection = section;
        targetTask = task;
      }
    }
  }

  if (!targetTask || !targetSection) {
    throw new Error("no pending tasks remain");
  }

  targetTask.status = "complete";

  const remainingPending = totalTasks - artifact.sections.reduce(
    (count, section) => count + section.tasks.filter((t) => t.status === "complete").length,
    0,
  );

  return {
    result: {
      sectionName: targetSection.name,
      taskId: targetTask.id,
      taskText: targetTask.text,
      totalTasks,
      remainingPending,
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
