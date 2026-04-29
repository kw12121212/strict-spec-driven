import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { formatYamlParseSummary, getYamlDiagnosticDetails, getYamlParseDetails, parseYamlDocument, type YamlDiagnosticDetails } from "./yaml.js";
import {
  loadBundledSchemaByArtifactType,
  validateArtifact,
  type ValidationDiagnostic,
} from "./validation.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const FORBIDDEN_SPEC_SUBDIRS = new Set([".strict-spec-driven", "changes", "archive"]);

type TaskMap = Record<string, { text: string; status: string; command?: string }>;

type TaskListArtifact = {
  sections: Record<string, TaskMap>;
  testing_gates?: {
    validation_task?: string;
    unit_test_task?: string;
  };
};

type QuestionListArtifact = {
  open?: unknown[];
};

type DeltaSpecArtifact = {
  operations?: {
    MODIFIED?: Record<string, unknown>;
    REMOVED?: Record<string, unknown>;
  };
};

export type VerifyDiagnostic = {
  source: string;
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
} & YamlDiagnosticDetails;

export type VerifyResult = {
  valid: boolean;
  diagnostics: VerifyDiagnostic[];
  changeName: string;
  totalTasks: number;
  completeTasks: number;
  remainingPending: number;
  openQuestionCount: number;
};

function collectDiagnostics(
  results: ValidationDiagnostic[],
): VerifyDiagnostic[] {
  return results.map((d) => ({
    source: d.source,
    artifactPath: d.artifactPath,
    fieldPath: d.fieldPath,
    message: d.message,
    expected: d.expected,
    actual: d.actual,
  }));
}

function makeYamlParseDiagnostic(
  artifactPath: string,
  message: string,
  error: unknown,
): VerifyDiagnostic {
  const yamlDetails = getYamlParseDetails(error);
  const yamlDiagnosticDetails = getYamlDiagnosticDetails(error);
  return {
    source: "yaml_parse",
    artifactPath,
    fieldPath: "$",
    message,
    expected: "parseable YAML mapping",
    actual: yamlDetails ? formatYamlParseSummary(yamlDetails) : error instanceof Error ? error.message : String(error),
    ...yamlDiagnosticDetails,
  };
}

function validateArtifactSchema(
  artifactType: string,
  artifact: unknown,
  artifactPath: string,
): VerifyDiagnostic[] {
  const diagnostics: VerifyDiagnostic[] = [];

  const record = artifact as Record<string, unknown> | null;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    diagnostics.push({
      source: "schema",
      artifactPath,
      fieldPath: "$",
      message: "artifact is not a YAML mapping",
      expected: "YAML mapping",
      actual: String(typeof artifact),
    });
    return diagnostics;
  }

  const expectedArtifactType = artifactType;
  if (record.artifact_type !== expectedArtifactType) {
    diagnostics.push({
      source: "schema",
      artifactPath,
      fieldPath: "$.artifact_type",
      message: `artifact_type mismatch`,
      expected: expectedArtifactType,
      actual: String(record.artifact_type),
    });
  }

  const schema = loadBundledSchemaByArtifactType(artifactType);
  const result = validateArtifact(schema, artifact, artifactPath);
  diagnostics.push(...collectDiagnostics(result.diagnostics));

  return diagnostics;
}

function checkTaskCompletion(
  artifact: TaskListArtifact,
  artifactPath: string,
): { diagnostics: VerifyDiagnostic[]; totalTasks: number; completeTasks: number } {
  let totalTasks = 0;
  let completeTasks = 0;
  const diagnostics: VerifyDiagnostic[] = [];

  for (const [sectionName, taskMap] of Object.entries(artifact.sections ?? {})) {
    for (const [taskId, task] of Object.entries(taskMap ?? {})) {
      totalTasks += 1;
      if (task.status === "complete") {
        completeTasks += 1;
      } else {
        diagnostics.push({
          source: "task_completion",
          artifactPath,
          fieldPath: `$.sections.${sectionName}.${taskId}`,
          message: `task '${taskId}' has status '${task.status}', expected 'complete'`,
          expected: "complete",
          actual: task.status,
        });
      }
    }
  }

  return { diagnostics, totalTasks, completeTasks };
}

function checkOpenQuestions(
  artifact: QuestionListArtifact,
  artifactPath: string,
): { diagnostics: VerifyDiagnostic[]; openCount: number } {
  const open = artifact.open ?? [];
  const diagnostics: VerifyDiagnostic[] = [];

  if (open.length > 0) {
    diagnostics.push({
      source: "open_questions",
      artifactPath,
      fieldPath: "$.open",
      message: `questions.yaml has ${open.length} unresolved open question(s)`,
      expected: "0 open questions",
      actual: `${open.length} open question(s)`,
    });
  }

  return { diagnostics, openCount: open.length };
}

function checkTestingGates(
  artifact: TaskListArtifact,
  artifactPath: string,
): VerifyDiagnostic[] {
  const diagnostics: VerifyDiagnostic[] = [];
  const gates = artifact.testing_gates;
  if (!gates) return diagnostics;

  const testingMap = artifact.sections?.["Testing"];
  const testingTaskIds = new Set(testingMap ? Object.keys(testingMap) : []);

  const gateRefs: [string, string | undefined][] = [
    ["validation_task", gates.validation_task],
    ["unit_test_task", gates.unit_test_task],
  ];

  for (const [gateName, taskId] of gateRefs) {
    if (taskId !== undefined && !testingTaskIds.has(taskId)) {
      diagnostics.push({
        source: "testing_gates",
        artifactPath,
        fieldPath: `$.testing_gates.${gateName}`,
        message: `testing gate '${gateName}' references task '${taskId}' which does not exist in the Testing section`,
        expected: "existing Testing section task ID",
        actual: taskId,
      });
    }
  }

  return diagnostics;
}

function validateDeltaSpecs(
  changeDir: string,
  artifactPathPrefix: string,
): VerifyDiagnostic[] {
  const specsDir = path.join(changeDir, "specs");
  if (!existsSync(specsDir)) return [];

  const diagnostics: VerifyDiagnostic[] = [];

  function scanDir(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        const relativePath = path.relative(specsDir, fullPath).split(path.sep).join("/");
        const content = readFileSync(fullPath, "utf8");
        const artifactPath = `${artifactPathPrefix}/${relativePath}`;
        let artifact: unknown;
        try {
          artifact = parseYamlDocument<unknown>(content, { source: artifactPath });
        } catch (error) {
          diagnostics.push(makeYamlParseDiagnostic(artifactPath, "delta spec is not valid YAML", error));
          continue;
        }
        diagnostics.push(
          ...validateArtifactSchema("delta_spec", artifact, artifactPath),
        );
      }
    }
  }

  scanDir(specsDir);
  return diagnostics;
}

function checkExclusiveActiveTargets(
  rootDir: string,
  changeName: string,
): VerifyDiagnostic[] {
  const changesDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes");
  if (!existsSync(changesDir)) return [];

  const diagnostics: VerifyDiagnostic[] = [];

  const targetMap = new Map<
    string,
    { changeName: string; operation: string }[]
  >();

  const activeDirs = readdirSync(changesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const activeChange of activeDirs) {
    const specsDir = path.join(changesDir, activeChange, "specs");
    if (!existsSync(specsDir)) continue;

    function scanDir(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
          const artifactPath = path.relative(rootDir, fullPath).split(path.sep).join("/");
          const content = readFileSync(fullPath, "utf8");
          let artifact: DeltaSpecArtifact;
          try {
            artifact = parseYamlDocument<DeltaSpecArtifact>(content, { source: artifactPath });
          } catch (error) {
            if (activeChange !== changeName) {
              diagnostics.push(makeYamlParseDiagnostic(artifactPath, "delta spec is not valid YAML", error));
            }
            continue;
          }
          const ops = artifact.operations ?? {};
          for (const [opName, entries] of Object.entries(ops)) {
            if (opName !== "MODIFIED" && opName !== "REMOVED") continue;
            if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
            for (const target of Object.keys(entries)) {
              if (!targetMap.has(target)) targetMap.set(target, []);
              targetMap.get(target)!.push({
                changeName: activeChange,
                operation: opName,
              });
            }
          }
        }
      }
    }

    scanDir(specsDir);
  }

  for (const [requirementId, changes] of targetMap) {
    if (changes.length <= 1) continue;
    const changeNames = [...new Set(changes.map((c) => c.changeName))];
    if (!changeNames.includes(changeName)) continue;
    if (changeNames.length <= 1) continue;

    diagnostics.push({
      source: "exclusive_active_target",
      artifactPath: `.strict-spec-driven/changes/${changeName}/specs/`,
      fieldPath: `$.operations`,
      message: `requirement '${requirementId}' is MODIFIED/REMOVED in multiple active changes: ${changeNames.join(", ")}`,
      expected: "unique MODIFIED/REMOVED target across active changes",
      actual: `conflict between ${changes.map((c) => c.changeName).join(" and ")}`,
    });
  }

  return diagnostics;
}

export function verifyChange(
  rootDir: string,
  changeName: string,
): VerifyResult {
  const changeDir = path.join(
    rootDir,
    STRICT_WORKFLOW_DIR,
    "changes",
    changeName,
  );
  if (!existsSync(changeDir)) {
    throw new Error(`change '${changeName}' not found`);
  }

  const allDiagnostics: VerifyDiagnostic[] = [];
  let totalTasks = 0;
  let completeTasks = 0;
  let openQuestionCount = 0;

  const specsRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "specs");
  if (existsSync(specsRoot) && statSync(specsRoot).isDirectory()) {
    for (const entry of readdirSync(specsRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && FORBIDDEN_SPEC_SUBDIRS.has(entry.name)) {
        allDiagnostics.push({
          source: "directory_structure",
          artifactPath: `.strict-spec-driven/specs/${entry.name}`,
          fieldPath: "$",
          message: `.strict-spec-driven/specs/ must not contain a '${entry.name}' subdirectory; workflow state directories belong under .strict-spec-driven/ directly`,
          expected: `no '${entry.name}' subdirectory under .strict-spec-driven/specs/`,
          actual: `found .strict-spec-driven/specs/${entry.name}/`,
        });
      }
    }
  }

  const artifactConfigs: [string, string][] = [
    ["change_proposal", "proposal.yaml"],
    ["change_design", "design.yaml"],
    ["task_list", "tasks.yaml"],
    ["question_list", "questions.yaml"],
  ];

  for (const [artifactType, fileName] of artifactConfigs) {
    const filePath = path.join(changeDir, fileName);
    const artifactPath = `.strict-spec-driven/changes/${changeName}/${fileName}`;
    if (!existsSync(filePath)) {
      allDiagnostics.push({
        source: "schema",
        artifactPath,
        fieldPath: "$",
        message: `required artifact '${fileName}' is missing`,
      });
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    let artifact: unknown;
    try {
      artifact = parseYamlDocument<unknown>(content, { source: artifactPath });
    } catch (error) {
      allDiagnostics.push(makeYamlParseDiagnostic(artifactPath, `artifact '${fileName}' is not valid YAML`, error));
      continue;
    }
    allDiagnostics.push(
      ...validateArtifactSchema(artifactType, artifact, artifactPath),
    );

    if (artifactType === "task_list") {
      const taskArtifact = artifact as TaskListArtifact;
      const taskResult = checkTaskCompletion(taskArtifact, artifactPath);
      allDiagnostics.push(...taskResult.diagnostics);
      totalTasks = taskResult.totalTasks;
      completeTasks = taskResult.completeTasks;

      allDiagnostics.push(...checkTestingGates(taskArtifact, artifactPath));
    }

    if (artifactType === "question_list") {
      const questionArtifact = artifact as QuestionListArtifact;
      const questionResult = checkOpenQuestions(questionArtifact, artifactPath);
      allDiagnostics.push(...questionResult.diagnostics);
      openQuestionCount = questionResult.openCount;
    }
  }

  const specsPrefix = `.strict-spec-driven/changes/${changeName}/specs`;
  allDiagnostics.push(...validateDeltaSpecs(changeDir, specsPrefix));

  allDiagnostics.push(...checkExclusiveActiveTargets(rootDir, changeName));

  allDiagnostics.sort((a, b) => {
    const aKey = [a.source, a.artifactPath, a.fieldPath, a.message].join("|");
    const bKey = [b.source, b.artifactPath, b.fieldPath, b.message].join("|");
    return aKey.localeCompare(bKey);
  });

  return {
    valid: allDiagnostics.length === 0,
    diagnostics: allDiagnostics,
    changeName,
    totalTasks,
    completeTasks,
    remainingPending: totalTasks - completeTasks,
    openQuestionCount,
  };
}
