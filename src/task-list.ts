export type FlatTask = {
  sectionName: string;
  taskId: string;
  text: string;
  status: string;
  command?: string;
};

type TaskMap = Record<string, { text: string; status: string; command?: string }>;
type Sections = Record<string, TaskMap>;

export function flattenTasks(artifact: { sections?: unknown }): FlatTask[] {
  const sections = artifact.sections as Sections | undefined;
  if (!sections) return [];

  const result: FlatTask[] = [];
  for (const [sectionName, taskMap] of Object.entries(sections)) {
    for (const [taskId, task] of Object.entries(taskMap ?? {})) {
      result.push({ sectionName, taskId, text: task.text, status: task.status, command: task.command });
    }
  }
  return result;
}

export function getTestingTaskIds(artifact: { sections?: unknown }): Set<string> {
  const sections = artifact.sections as Sections | undefined;
  if (!sections) return new Set();
  const testingMap = sections["Testing"];
  return new Set(testingMap ? Object.keys(testingMap) : []);
}
