import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import {
  ROOT,
  TestContext,
  cli,
  createCopiedProjectWorkspace,
  fixturePath,
  formatLocalDateStamp,
  loadDistModule,
  projectFixturePath,
  projectWorkspaceCli,
  runCommand,
  type MigrateConverterModule,
  type RoadmapConverterModule,
  type ScaffoldModule,
  type SkillValidationModule,
  type ValidationModule,
  type YamlModule,
} from "../support/harness.js";

export async function runChangeLifecycleSuite(context: TestContext): Promise<void> {
  const yamlModule = await loadDistModule<YamlModule>("yaml.js");

context.section("[11] apply command");

const applyHappyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-apply-happy-"));
try {
  mkdirSync(path.join(applyHappyDir, ".strict-spec-driven", "changes", "my-change"), { recursive: true });
  writeFileSync(
    path.join(applyHappyDir, ".strict-spec-driven", "changes", "my-change", "tasks.yaml"),
    [
      "schema: strict-spec-driven/task-list/v2",
      "schema_version: 2",
      "artifact_type: task_list",
      "sections:",
      "  Implementation:",
      "    task-a:",
      "      text: First task",
      "      status: pending",
      "    task-b:",
      "      text: Second task",
      "      status: pending",
      "  Testing:",
      "    test-a:",
      "      text: Run tests",
      "      status: pending",
      "      command: bun test/run.ts",
    ].join("\n") + "\n",
    "utf8",
  );

  const applyFirst = cli(["apply", "my-change"], { cwd: applyHappyDir });
  context.assert(applyFirst.status === 0, "apply exits zero when pending tasks exist", `got exit code ${applyFirst.status}`);
  const firstJson = JSON.parse(applyFirst.stdout.trim());
  context.assert(firstJson.sectionName === "Implementation", "apply json includes completed section name");
  context.assert(firstJson.taskId === "task-a", "apply json includes completed task id");
  context.assert(!("taskText" in firstJson), "apply json omits completed task text");
  context.assert(firstJson.totalTasks === 3, "apply json includes total task count");
  context.assert(firstJson.remainingPending === 2, "apply json includes remaining pending count");

  const updatedContent = readFileSync(
    path.join(applyHappyDir, ".strict-spec-driven", "changes", "my-change", "tasks.yaml"),
    "utf8",
  );
  const updatedParsed = yamlModule.parseYamlDocument<{ sections: Record<string, Record<string, { status: string }>> }>(updatedContent);
  context.assert(
    updatedParsed.sections["Implementation"]["task-a"].status === "complete" &&
      updatedParsed.sections["Implementation"]["task-b"].status === "pending" &&
      updatedParsed.sections["Testing"]["test-a"].status === "pending",
    "apply only modifies the first pending task status",
  );

  const applySecond = cli(["apply", "my-change"], { cwd: applyHappyDir });
  context.assert(applySecond.status === 0, "apply second invocation exits zero");
  const secondJson = JSON.parse(applySecond.stdout.trim());
  context.assert(secondJson.taskId === "task-b", "apply second invocation completes next pending task");
  context.assert(secondJson.remainingPending === 1, "apply second invocation reports correct remaining count");

  const applyThird = cli(["apply", "my-change"], { cwd: applyHappyDir });
  context.assert(applyThird.status === 0, "apply third invocation exits zero");
  const thirdJson = JSON.parse(applyThird.stdout.trim());
  context.assert(thirdJson.taskId === "test-a", "apply third invocation completes task from second section");
  context.assert(thirdJson.remainingPending === 0, "apply third invocation reports zero remaining");

  const applyAllDone = cli(["apply", "my-change"], { cwd: applyHappyDir });
  context.assert(applyAllDone.status !== 0, "apply rejects when all tasks complete", `got exit code ${applyAllDone.status}`);
  context.assert(
    applyAllDone.stderr.includes("no pending tasks"),
    "apply all-complete failure reports no pending tasks",
    `stderr: ${applyAllDone.stderr.trim()}`,
  );
} finally {
  rmSync(applyHappyDir, { recursive: true, force: true });
}

const applyMissingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-apply-missing-"));
try {
  mkdirSync(path.join(applyMissingDir, ".strict-spec-driven", "changes"), { recursive: true });
  const applyMissing = cli(["apply", "no-such-change"], { cwd: applyMissingDir });
  context.assert(applyMissing.status !== 0, "apply rejects missing change", `got exit code ${applyMissing.status}`);
  context.assert(
    applyMissing.stderr.includes("not found"),
    "apply missing-change failure reports change not found",
    `stderr: ${applyMissing.stderr.trim()}`,
  );
} finally {
  rmSync(applyMissingDir, { recursive: true, force: true });
}

const applyEmptyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-apply-empty-"));
try {
  mkdirSync(path.join(applyEmptyDir, ".strict-spec-driven", "changes", "empty-tasks"), { recursive: true });
  writeFileSync(
    path.join(applyEmptyDir, ".strict-spec-driven", "changes", "empty-tasks", "tasks.yaml"),
    "sections: {}\n",
    "utf8",
  );
  const applyEmpty = cli(["apply", "empty-tasks"], { cwd: applyEmptyDir });
  context.assert(applyEmpty.status !== 0, "apply rejects when tasks.yaml has no sections", `got exit code ${applyEmpty.status}`);
  context.assert(
    applyEmpty.stderr.includes("no pending tasks"),
    "apply empty-tasks failure reports no pending tasks",
    `stderr: ${applyEmpty.stderr.trim()}`,
  );
} finally {
  rmSync(applyEmptyDir, { recursive: true, force: true });
}

const applyDeterminismDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-apply-det-"));
try {
  mkdirSync(path.join(applyDeterminismDir, ".strict-spec-driven", "changes", "det-test"), { recursive: true });
  const tasksContent = [
    "sections:",
    "  Build:",
    "    build:",
    "      text: Build step",
    "      status: pending",
  ].join("\n") + "\n";

  for (let i = 0; i < 2; i++) {
    writeFileSync(
      path.join(applyDeterminismDir, ".strict-spec-driven", "changes", "det-test", "tasks.yaml"),
      tasksContent,
      "utf8",
    );
    const result = cli(["apply", "det-test"], { cwd: applyDeterminismDir });
    context.assert(result.status === 0, `apply determinism run ${i + 1} exits zero`);
    const parsed = JSON.parse(result.stdout.trim());
    context.assert(
      parsed.sectionName === "Build" && parsed.taskId === "build" && !("taskText" in parsed),
      `apply determinism run ${i + 1} output matches expected fields`,
    );
  }
} finally {
  rmSync(applyDeterminismDir, { recursive: true, force: true });
}

context.section("[11a] deterministic workflow guidance commands");

const workflowGuidanceDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-workflow-guidance-"));
try {
  const changeName = "workflow-demo";
  const changeDir = path.join(workflowGuidanceDir, ".strict-spec-driven", "changes", changeName);
  mkdirSync(path.join(changeDir, "specs"), { recursive: true });

  writeFileSync(path.join(changeDir, "proposal.yaml"), [
    "schema: strict-spec-driven/change-proposal/v1",
    "schema_version: 1",
    "artifact_type: change_proposal",
    "schema_file: test",
    "change:",
    `  id: ${changeName}`,
    "  status: proposed",
    "summary:",
    "  what:",
    "    - Test deterministic workflow guidance",
    "  why:",
    "    - Testing",
    "scope:",
    "  in: []",
    "  out: []",
    "unchanged_behavior: []",
  ].join("\n") + "\n", "utf8");
  writeFileSync(path.join(changeDir, "design.yaml"), [
    "schema: strict-spec-driven/change-design/v1",
    "schema_version: 1",
    "artifact_type: change_design",
    "schema_file: test",
    `change: ${changeName}`,
    "approach:",
    "  - Test approach",
    "decisions: {}",
    "alternatives: []",
  ].join("\n") + "\n", "utf8");
  writeFileSync(path.join(changeDir, "tasks.yaml"), [
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: test",
    `change: ${changeName}`,
    "sections:",
    "  Implementation:",
    "    impl-1:",
    "      text: Implement",
    "      status: pending",
    "  Testing:",
    "    run-tests:",
    "      text: Run tests",
    "      status: complete",
    "      command: bun test/run.ts",
    "  Verification:",
    "    verify-1:",
    "      text: Verify",
    "      status: pending",
    "testing_gates:",
    "  validation_task: run-tests",
    "  unit_test_task: run-tests",
  ].join("\n") + "\n", "utf8");
  writeFileSync(path.join(changeDir, "questions.yaml"), [
    "schema: strict-spec-driven/question-list/v1",
    "schema_version: 1",
    "artifact_type: question_list",
    "schema_file: test",
    `change: ${changeName}`,
    "open:",
    "  - id: scope",
    "    question: Should scope proceed?",
    "    context: Test context",
    "    status: open",
    "resolved: []",
  ].join("\n") + "\n", "utf8");

  const readyMissingDelta = cli(["ready", changeName], { cwd: workflowGuidanceDir });
  context.assert(readyMissingDelta.status !== 0, "ready exits non-zero when proposal handoff is blocked");
  const readyJson = JSON.parse(readyMissingDelta.stdout.trim());
  context.assert(
    readyJson.ready === false &&
      readyJson.diagnostics.some((diagnostic: { source: string }) => diagnostic.source === "proposal_readiness"),
    "ready reports missing delta specs as deterministic readiness diagnostics",
  );
  context.assert(
    readyJson.diagnostics.some((diagnostic: { fieldPath: string }) => diagnostic.fieldPath === "$.scope.in")
      && readyJson.diagnostics.some((diagnostic: { fieldPath: string }) => diagnostic.fieldPath === "$.scope.out")
      && readyJson.diagnostics.some((diagnostic: { fieldPath: string }) => diagnostic.fieldPath === "$.unchanged_behavior")
      && readyJson.diagnostics.some((diagnostic: { fieldPath: string }) => diagnostic.fieldPath === "$.decisions"),
    "ready reports missing deterministic question-gate evidence for proposal scope, unchanged behavior, and design decisions",
  );

  const nextResult = cli(["next", changeName], { cwd: workflowGuidanceDir });
  context.assert(nextResult.status === 0, "next exits zero while reporting workflow blockers");
  const nextJson = JSON.parse(nextResult.stdout.trim());
  context.assert(
    nextJson.blockers.some((diagnostic: { source: string }) => diagnostic.source === "open_questions") &&
      nextJson.suggestions.some((suggestion: { command: string }) => suggestion.command.includes("questions --resolve scope --answer <answer>")) &&
      nextJson.suggestions.some((suggestion: { command: string }) => suggestion.command === `strict-spec-cli apply ${changeName}`),
    "next reports open questions, pending tasks, and script-owned command suggestions",
  );

  const resolveQuestion = cli(["generate", changeName, "questions", "--resolve", "scope", "--answer", "Yes"], { cwd: workflowGuidanceDir });
  context.assert(resolveQuestion.status === 0, "generate questions resolves an existing open question", resolveQuestion.stderr.trim());
  const resolvedQuestions = yamlModule.parseYamlDocument<{ open: unknown[]; resolved: Array<{ id: string; answer: string }> }>(
    readFileSync(path.join(changeDir, "questions.yaml"), "utf8"),
  );
  context.assert(
    resolvedQuestions.open.length === 0 &&
      resolvedQuestions.resolved[0]?.id === "scope" &&
      resolvedQuestions.resolved[0]?.answer === "Yes",
    "question resolution removes the open entry and writes resolved state",
  );

  const rejectedTasksGenerate = cli(["generate", changeName, "tasks", "--reset"], { cwd: workflowGuidanceDir });
  context.assert(rejectedTasksGenerate.status !== 0, "generate tasks remains unsupported for task-list editing");
  context.assert(
    rejectedTasksGenerate.stderr.includes("artifact must be one of") &&
      !rejectedTasksGenerate.stderr.includes("tasks"),
    "generate tasks failure keeps task-list editing outside scripted generation",
    rejectedTasksGenerate.stderr.trim(),
  );

  const readyChangeName = "workflow-ready";
  const readyChangeDir = path.join(workflowGuidanceDir, ".strict-spec-driven", "changes", readyChangeName);
  mkdirSync(path.join(readyChangeDir, "specs", "cli"), { recursive: true });
  writeFileSync(path.join(readyChangeDir, "proposal.yaml"), [
    "schema: strict-spec-driven/change-proposal/v1",
    "schema_version: 1",
    "artifact_type: change_proposal",
    "schema_file: test",
    "change:",
    `  id: ${readyChangeName}`,
    "  status: proposed",
    "summary:",
    "  what:",
    "    - Test complete deterministic workflow guidance",
    "  why:",
    "    - Testing",
    "scope:",
    "  in:",
    "    - Include readiness checks",
    "  out:",
    "    - Do not judge product semantics",
    "unchanged_behavior:",
    "  - Existing open-question blocking remains unchanged",
  ].join("\n") + "\n", "utf8");
  writeFileSync(path.join(readyChangeDir, "design.yaml"), [
    "schema: strict-spec-driven/change-design/v1",
    "schema_version: 1",
    "artifact_type: change_design",
    "schema_file: test",
    `change: ${readyChangeName}`,
    "approach:",
    "  - Test approach",
    "decisions:",
    "  deterministic-evidence:",
    "    decision: Use existing artifacts for deterministic readiness checks.",
    "    rationale: The CLI can check recorded fields without judging their semantics.",
    "alternatives: []",
  ].join("\n") + "\n", "utf8");
  writeFileSync(path.join(readyChangeDir, "tasks.yaml"), [
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: test",
    `change: ${readyChangeName}`,
    "sections:",
    "  Implementation:",
    "    impl-1:",
    "      text: Implement",
    "      status: pending",
    "  Testing:",
    "    run-tests:",
    "      text: Run tests",
    "      status: pending",
    "      command: bun test/run.ts",
    "  Verification:",
    "    verify-1:",
    "      text: Verify",
    "      status: pending",
    "testing_gates:",
    "  validation_task: run-tests",
    "  unit_test_task: run-tests",
  ].join("\n") + "\n", "utf8");
  writeFileSync(path.join(readyChangeDir, "questions.yaml"), [
    "schema: strict-spec-driven/question-list/v1",
    "schema_version: 1",
    "artifact_type: question_list",
    "schema_file: test",
    `change: ${readyChangeName}`,
    "open: []",
    "resolved: []",
  ].join("\n") + "\n", "utf8");
  // The ready delta targets cli-foundation, so that main spec must exist for
  // the change to resolve at ready/verify time.
  writeMainSpecArtifact(workflowGuidanceDir, "cli/foundation.yaml", "cli-foundation", "CLI Foundation", []);
  writeFileSync(path.join(readyChangeDir, "specs", "cli", "foundation.yaml"), [
    "schema: strict-spec-driven/delta-spec/v1",
    "schema_version: 1",
    "artifact_type: delta_spec",
    "schema_file: test",
    "target_spec: cli-foundation",
    "mapping:",
    "  implementation:",
    "    - src/workflow-state.ts",
    "  tests:",
    "    - test/suites/change-lifecycle.ts",
    "operations:",
    "  ADDED:",
    "    workflow-ready-contract:",
    "      strength: MUST",
    "      statement: The system MUST have complete deterministic readiness evidence.",
    "      scenarios:",
    "        ready-evidence-exists:",
    "          - GIVEN: complete evidence exists",
    "          - WHEN: ready runs",
    "          - THEN: readiness passes",
    "  MODIFIED: {}",
    "  REMOVED: {}",
  ].join("\n") + "\n", "utf8");
  const readyComplete = cli(["ready", readyChangeName], { cwd: workflowGuidanceDir });
  context.assert(readyComplete.status === 0, "ready exits zero when deterministic question-gate evidence is complete", readyComplete.stdout.trim());
  const readyCompleteJson = JSON.parse(readyComplete.stdout.trim());
  context.assert(
    readyCompleteJson.ready === true
      && !readyCompleteJson.diagnostics.some((diagnostic: { source: string }) => diagnostic.source === "proposal_readiness"),
    "ready emits no proposal_readiness diagnostics for complete deterministic question-gate evidence",
  );
} finally {
  rmSync(workflowGuidanceDir, { recursive: true, force: true });
}

context.section("[11b] change-intake question gate fixture regression");

function generateReadyFixtureChange(workspaceRoot: string, changeName: string): void {
  const proposeResult = projectWorkspaceCli(workspaceRoot, ["propose", changeName]);
  context.assert(
    proposeResult.status === 0,
    `${changeName} fixture propose exits zero`,
    `stdout: ${proposeResult.stdout.trim()} stderr: ${proposeResult.stderr.trim()}`,
  );
  context.assert(
    projectWorkspaceCli(workspaceRoot, [
      "generate",
      changeName,
      "proposal",
      "--what",
      "Document fixture todo filtering behavior",
      "--why",
      "The copied fixture needs complete proposal evidence for readiness coverage",
      "--in",
      "Update the todo domain spec evidence",
      "--out",
      "Do not change persistence behavior",
      "--unchanged",
      "Existing todo creation and completion behavior remains unchanged",
    ]).status === 0,
    `${changeName} fixture proposal generation exits zero`,
  );
  context.assert(
    projectWorkspaceCli(workspaceRoot, [
      "generate",
      changeName,
      "design",
      "--reset",
      "--approach",
      "Reuse the existing todo fixture files and record complete evidence.",
      "--decision",
      "fixture-evidence",
      "--decision-text",
      "Use copied fixture code and tests as the implementation and validation evidence.",
      "--rationale",
      "The copied project proves the question gate works outside the self-hosted workflow state.",
    ]).status === 0,
    `${changeName} fixture design generation exits zero`,
  );
  context.assert(
    projectWorkspaceCli(workspaceRoot, ["generate", changeName, "questions", "--reset"]).status === 0,
    `${changeName} fixture empty questions generation exits zero`,
  );
  context.assert(
    projectWorkspaceCli(workspaceRoot, [
      "generate",
      changeName,
      "delta-spec",
      "--target-spec",
      "todo-management",
      "--implementation",
      "src/todos.ts",
      "--test",
      "test/todos.test.ts",
      "--operation",
      "ADDED",
      "--requirement",
      `${changeName}-evidence`,
      "--strength",
      "MUST",
      "--statement",
      "The copied fixture MUST carry complete question-gate evidence for this strict change.",
      "--scenario",
      "fixture-evidence-complete",
      "--given",
      "complete proposal, design, question, delta, implementation, and test evidence exists",
      "--when",
      "ready runs",
      "--then",
      "the change is ready without human questions",
    ]).status === 0,
    `${changeName} fixture delta generation exits zero`,
  );
}

const questionGateFixture = createCopiedProjectWorkspace("todo-app");
try {
  const { workspaceRoot } = questionGateFixture;
  const migrateResult = projectWorkspaceCli(workspaceRoot, ["migrate"]);
  context.assert(
    migrateResult.status === 0,
    "question-gate fixture migrate succeeds",
    `stdout: ${migrateResult.stdout.trim()} stderr: ${migrateResult.stderr.trim()}`,
  );
  const cancelSeededChange = projectWorkspaceCli(workspaceRoot, ["cancel", "add-due-dates"]);
  context.assert(
    cancelSeededChange.status === 0,
    "question-gate fixture removes seeded active change before proposal coverage",
    `stdout: ${cancelSeededChange.stdout.trim()} stderr: ${cancelSeededChange.stderr.trim()}`,
  );
  const strictConfigPath = path.join(workspaceRoot, ".strict-spec-driven", "config.yaml");
  const strictConfigContent = readFileSync(strictConfigPath, "utf8");
  writeFileSync(
    strictConfigPath,
    strictConfigContent.replace("preferred_human_language: English", "preferred_human_language: Chinese"),
    "utf8",
  );

  generateReadyFixtureChange(workspaceRoot, "fixture-ready");
  const readyNoQuestion = projectWorkspaceCli(workspaceRoot, ["ready", "fixture-ready"]);
  context.assert(
    readyNoQuestion.status === 0,
    "copied fixture ready path passes when evidence answers the question gate",
    `stdout: ${readyNoQuestion.stdout.trim()} stderr: ${readyNoQuestion.stderr.trim()}`,
  );
  const readyNoQuestionJson = JSON.parse(readyNoQuestion.stdout.trim());
  context.assert(
    readyNoQuestionJson.ready === true && readyNoQuestionJson.diagnostics.length === 0,
    "copied fixture no-question path emits no readiness diagnostics",
  );
  context.assert(
    projectWorkspaceCli(workspaceRoot, ["cancel", "fixture-ready"]).status === 0,
    "copied fixture cancels ready path change before blocked path coverage",
  );

  generateReadyFixtureChange(workspaceRoot, "fixture-blocked");
  const openQuestionResult = projectWorkspaceCli(workspaceRoot, [
    "generate",
    "fixture-blocked",
    "questions",
    "--reset",
    "--open",
    "data-compatibility",
    "--question",
    "是否必须保留现有待办事项的完成状态？",
    "--context",
    "preferred_human_language 为 Chinese；仓库证据不足以确认兼容性影响。",
  ]);
  context.assert(
    openQuestionResult.status === 0,
    "copied fixture writes localized open question",
    `stdout: ${openQuestionResult.stdout.trim()} stderr: ${openQuestionResult.stderr.trim()}`,
  );
  const blockedQuestionsPath = path.join(
    workspaceRoot,
    ".strict-spec-driven",
    "changes",
    "fixture-blocked",
    "questions.yaml",
  );
  const blockedQuestions = yamlModule.parseYamlDocument<{
    open: Array<{ id: string; question: string; context: string }>;
    resolved: Array<{ id: string; answer: string }>;
  }>(readFileSync(blockedQuestionsPath, "utf8"));
  context.assert(
    blockedQuestions.open[0]?.id === "data-compatibility"
      && blockedQuestions.open[0]?.question.includes("是否必须保留")
      && blockedQuestions.open[0]?.context.includes("preferred_human_language 为 Chinese"),
    "copied fixture stores localized human-facing text with a stable technical question id",
  );
  const blockedNext = projectWorkspaceCli(workspaceRoot, ["next", "fixture-blocked"]);
  const blockedNextJson = JSON.parse(blockedNext.stdout.trim());
  context.assert(
    blockedNext.status === 0
      && blockedNextJson.blockers.some((diagnostic: { source: string }) => diagnostic.source === "open_questions"),
    "copied fixture open question blocks implementation handoff",
  );
  const resolveBlocked = projectWorkspaceCli(workspaceRoot, [
    "generate",
    "fixture-blocked",
    "questions",
    "--resolve",
    "data-compatibility",
    "--answer",
    "必须保留现有完成状态。",
  ]);
  context.assert(
    resolveBlocked.status === 0,
    "copied fixture resolves localized open question",
    `stdout: ${resolveBlocked.stdout.trim()} stderr: ${resolveBlocked.stderr.trim()}`,
  );
  const resolvedQuestions = yamlModule.parseYamlDocument<{
    open: unknown[];
    resolved: Array<{ id: string; answer: string }>;
  }>(readFileSync(blockedQuestionsPath, "utf8"));
  context.assert(
    resolvedQuestions.open.length === 0
      && resolvedQuestions.resolved[0]?.id === "data-compatibility"
      && resolvedQuestions.resolved[0]?.answer === "必须保留现有完成状态。",
    "copied fixture question resolution moves the answer to resolved state",
  );
  const readyAfterResolution = projectWorkspaceCli(workspaceRoot, ["ready", "fixture-blocked"]);
  context.assert(
    readyAfterResolution.status === 0,
    "copied fixture readiness passes after localized question resolution",
    `stdout: ${readyAfterResolution.stdout.trim()} stderr: ${readyAfterResolution.stderr.trim()}`,
  );
} finally {
  questionGateFixture.cleanup();
  context.assert(
    !existsSync(questionGateFixture.workspaceRoot),
    "question-gate fixture cleanup removes copied workspace",
  );
}

context.section("[12] verify command");

const verifyModule = await loadDistModule<{
  verifyChange(rootDir: string, changeName: string): {
    valid: boolean;
    diagnostics: Array<{
      source: string;
      artifactPath: string;
      fieldPath: string;
      message: string;
      expected?: string;
      actual?: string;
      errorType?: string;
      reason?: string;
      line?: number;
      column?: number;
      snippet?: string;
      offendingCharacter?: string;
    }>;
    changeName: string;
    totalTasks: number;
    completeTasks: number;
    remainingPending: number;
    openQuestionCount: number;
  };
}>("verify.js");

// 12a: valid fully-complete change
const verifyValidDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-valid-"));
try {
  const vChangeDir = path.join(verifyValidDir, ".strict-spec-driven", "changes", "valid-change");
  mkdirSync(vChangeDir, { recursive: true });
  mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

  writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
    "schema: strict-spec-driven/change-proposal/v1",
    "schema_version: 1",
    "artifact_type: change_proposal",
    "schema_file: test",
    "change:",
    "  id: valid-change",
    "  status: proposed",
    "summary:",
    "  what:",
    "    - Test change",
    "  why:",
    "    - Testing",
    "scope:",
    "  in: []",
    "  out: []",
    "unchanged_behavior: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "design.yaml"), [
    "schema: strict-spec-driven/change-design/v1",
    "schema_version: 1",
    "artifact_type: change_design",
    "schema_file: test",
    "change: valid-change",
    "approach:",
    "  - Test approach",
    "decisions: {}",
    "alternatives: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: test",
    "change: valid-change",
    "sections:",
    "  Implementation:",
    "    impl-1:",
    "      text: Do the work",
    "      status: complete",
    "  Testing:",
    "    test-build:",
    "      text: Build",
    "      status: complete",
    "      command: bun run build",
    "    test-unit:",
    "      text: Unit tests",
    "      status: complete",
    "      command: bun test/run.ts",
    "  Verification:",
    "    verify-1:",
    "      text: Verify scope",
    "      status: complete",
    "testing_gates:",
    "  validation_task: test-build",
    "  unit_test_task: test-unit",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "questions.yaml"), [
    "schema: strict-spec-driven/question-list/v1",
    "schema_version: 1",
    "artifact_type: question_list",
    "schema_file: test",
    "change: valid-change",
    "open: []",
    "resolved: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "specs", "cli.yaml"), [
    "schema: strict-spec-driven/delta-spec/v1",
    "schema_version: 1",
    "artifact_type: delta_spec",
    "schema_file: test",
    "target_spec: cli-foundation",
    "mapping:",
    "  implementation: []",
    "  tests: []",
    "operations:",
    "  ADDED:",
    "    verify-req:",
    "      strength: MUST",
    "      statement: The system MUST verify.",
    "      scenarios: {}",
    "  MODIFIED: {}",
    "  REMOVED: {}",
  ].join("\n") + "\n", "utf8");

  // The delta targets cli-foundation, so that main spec must exist for the
  // change to resolve (and to be archivable) at verify time.
  writeMainSpecArtifact(verifyValidDir, "cli/foundation.yaml", "cli-foundation", "CLI Foundation", []);

  const validResult = verifyModule.verifyChange(verifyValidDir, "valid-change");
  context.assert(validResult.valid, "valid fully-complete change passes verification", `diagnostics: ${JSON.stringify(validResult.diagnostics)}`);
  context.assert(validResult.changeName === "valid-change", "verify result includes changeName");
  context.assert(validResult.totalTasks === 4, "verify result includes totalTasks", `got ${validResult.totalTasks}`);
  context.assert(validResult.completeTasks === 4, "verify result includes completeTasks", `got ${validResult.completeTasks}`);
  context.assert(validResult.remainingPending === 0, "verify result reports zero remainingPending");
  context.assert(validResult.openQuestionCount === 0, "verify result reports zero openQuestionCount");

  const validCli = cli(["verify", "valid-change"], { cwd: verifyValidDir });
  context.assert(validCli.status === 0, "verify CLI exits zero for valid change", `got ${validCli.status}`);
  const validCliJson = JSON.parse(validCli.stdout.trim());
  context.assert(validCliJson.valid === true, "verify CLI JSON output includes valid=true");

  // verify output is deterministic
  const validCli2 = cli(["verify", "valid-change"], { cwd: verifyValidDir });
  context.assert(validCli.stdout.trim() === validCli2.stdout.trim(), "verify CLI output is deterministic across runs");
} finally {
  rmSync(verifyValidDir, { recursive: true, force: true });
}

// 12b: incomplete tasks
const verifyIncompleteDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-incomplete-"));
try {
  const vChangeDir = path.join(verifyIncompleteDir, ".strict-spec-driven", "changes", "incomplete");
  mkdirSync(vChangeDir, { recursive: true });
  mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

  writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
    "schema: strict-spec-driven/change-proposal/v1",
    "schema_version: 1",
    "artifact_type: change_proposal",
    "schema_file: test",
    "change:",
    "  id: incomplete",
    "  status: proposed",
    "summary:",
    "  what:",
    "    - Test",
    "  why:",
    "    - Test",
    "scope:",
    "  in: []",
    "  out: []",
    "unchanged_behavior: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "design.yaml"), [
    "schema: strict-spec-driven/change-design/v1",
    "schema_version: 1",
    "artifact_type: change_design",
    "schema_file: test",
    "change: incomplete",
    "approach:",
    "  - Test",
    "decisions: {}",
    "alternatives: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: test",
    "change: incomplete",
    "sections:",
    "  Implementation:",
    "    impl-1:",
    "      text: Do the work",
    "      status: pending",
    "  Testing:",
    "    test-build:",
    "      text: Build",
    "      status: complete",
    "      command: bun run build",
    "    test-unit:",
    "      text: Unit tests",
    "      status: complete",
    "      command: bun test/run.ts",
    "  Verification:",
    "    verify-1:",
    "      text: Verify",
    "      status: complete",
    "testing_gates:",
    "  validation_task: test-build",
    "  unit_test_task: test-unit",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "questions.yaml"), [
    "schema: strict-spec-driven/question-list/v1",
    "schema_version: 1",
    "artifact_type: question_list",
    "schema_file: test",
    "change: incomplete",
    "open: []",
    "resolved: []",
  ].join("\n") + "\n", "utf8");

  const incompleteResult = verifyModule.verifyChange(verifyIncompleteDir, "incomplete");
  context.assert(!incompleteResult.valid, "incomplete tasks cause verification failure");
  context.assert(
    incompleteResult.diagnostics.some((d) => d.source === "task_completion"),
    "incomplete tasks produce task_completion diagnostic",
  );
  context.assert(incompleteResult.totalTasks === 4, "incomplete change reports totalTasks=4", `got ${incompleteResult.totalTasks}`);
  context.assert(incompleteResult.completeTasks === 3, "incomplete change reports completeTasks=3", `got ${incompleteResult.completeTasks}`);
  context.assert(incompleteResult.remainingPending === 1, "incomplete change reports remainingPending=1", `got ${incompleteResult.remainingPending}`);

  const incompleteCli = cli(["verify", "incomplete"], { cwd: verifyIncompleteDir });
  context.assert(incompleteCli.status !== 0, "verify CLI exits non-zero for incomplete tasks", `got ${incompleteCli.status}`);
} finally {
  rmSync(verifyIncompleteDir, { recursive: true, force: true });
}

// 12c: open questions
const verifyQuestionsDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-questions-"));
try {
  const vChangeDir = path.join(verifyQuestionsDir, ".strict-spec-driven", "changes", "open-qs");
  mkdirSync(vChangeDir, { recursive: true });
  mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

  writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
    "schema: strict-spec-driven/change-proposal/v1",
    "schema_version: 1",
    "artifact_type: change_proposal",
    "schema_file: test",
    "change:",
    "  id: open-qs",
    "  status: proposed",
    "summary:",
    "  what:",
    "    - Test",
    "  why:",
    "    - Test",
    "scope:",
    "  in: []",
    "  out: []",
    "unchanged_behavior: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "design.yaml"), [
    "schema: strict-spec-driven/change-design/v1",
    "schema_version: 1",
    "artifact_type: change_design",
    "schema_file: test",
    "change: open-qs",
    "approach:",
    "  - Test",
    "decisions: {}",
    "alternatives: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: test",
    "change: open-qs",
    "sections:",
    "  Implementation:",
    "    impl-1:",
    "      text: Do work",
    "      status: complete",
    "  Testing:",
    "    test-build:",
    "      text: Build",
    "      status: complete",
    "      command: bun run build",
    "    test-unit:",
    "      text: Unit tests",
    "      status: complete",
    "      command: bun test/run.ts",
    "  Verification:",
    "    verify-1:",
    "      text: Verify",
    "      status: complete",
    "testing_gates:",
    "  validation_task: test-build",
    "  unit_test_task: test-unit",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "questions.yaml"), [
    "schema: strict-spec-driven/question-list/v1",
    "schema_version: 1",
    "artifact_type: question_list",
    "schema_file: test",
    "change: open-qs",
    "open:",
    "        - id: q1",
    "          question: What?",
    "          context: testing",
    "          status: open",
    "resolved: []",
  ].join("\n") + "\n", "utf8");

  const qsResult = verifyModule.verifyChange(verifyQuestionsDir, "open-qs");
  context.assert(!qsResult.valid, "open questions cause verification failure");
  context.assert(
    qsResult.diagnostics.some((d) => d.source === "open_questions"),
    "open questions produce open_questions diagnostic",
  );
  context.assert(qsResult.openQuestionCount === 1, "verify reports openQuestionCount=1", `got ${qsResult.openQuestionCount}`);

  const qsCli = cli(["verify", "open-qs"], { cwd: verifyQuestionsDir });
  context.assert(qsCli.status !== 0, "verify CLI exits non-zero for open questions", `got ${qsCli.status}`);
} finally {
  rmSync(verifyQuestionsDir, { recursive: true, force: true });
}

// 12d: invalid testing gates
const verifyGatesDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-gates-"));
try {
  const vChangeDir = path.join(verifyGatesDir, ".strict-spec-driven", "changes", "bad-gates");
  mkdirSync(vChangeDir, { recursive: true });
  mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

  writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
    "schema: strict-spec-driven/change-proposal/v1",
    "schema_version: 1",
    "artifact_type: change_proposal",
    "schema_file: test",
    "change:",
    "  id: bad-gates",
    "  status: proposed",
    "summary:",
    "  what:",
    "    - Test",
    "  why:",
    "    - Test",
    "scope:",
    "  in: []",
    "  out: []",
    "unchanged_behavior: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "design.yaml"), [
    "schema: strict-spec-driven/change-design/v1",
    "schema_version: 1",
    "artifact_type: change_design",
    "schema_file: test",
    "change: bad-gates",
    "approach:",
    "  - Test",
    "decisions: {}",
    "alternatives: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: test",
    "change: bad-gates",
    "sections:",
    "  Implementation:",
    "    impl-1:",
    "      text: Do work",
    "      status: complete",
    "  Testing:",
    "    test-build:",
    "      text: Build",
    "      status: complete",
    "      command: bun run build",
    "    test-unit:",
    "      text: Unit tests",
    "      status: complete",
    "      command: bun test/run.ts",
    "  Verification:",
    "    verify-1:",
    "      text: Verify",
    "      status: complete",
    "testing_gates:",
    "  validation_task: nonexistent-task",
    "  unit_test_task: test-unit",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "questions.yaml"), [
    "schema: strict-spec-driven/question-list/v1",
    "schema_version: 1",
    "artifact_type: question_list",
    "schema_file: test",
    "change: bad-gates",
    "open: []",
    "resolved: []",
  ].join("\n") + "\n", "utf8");

  const gatesResult = verifyModule.verifyChange(verifyGatesDir, "bad-gates");
  context.assert(!gatesResult.valid, "invalid testing gates cause verification failure");
  context.assert(
    gatesResult.diagnostics.some((d) => d.source === "testing_gates"),
    "invalid testing gates produce testing_gates diagnostic",
  );
  context.assert(
    gatesResult.diagnostics.some((d) => d.message.includes("nonexistent-task")),
    "testing gates diagnostic names the missing task ID",
  );
} finally {
  rmSync(verifyGatesDir, { recursive: true, force: true });
}

// 12e: malformed delta spec
const verifyDeltaDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-delta-"));
try {
  const vChangeDir = path.join(verifyDeltaDir, ".strict-spec-driven", "changes", "bad-delta");
  mkdirSync(vChangeDir, { recursive: true });
  mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

  writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
    "schema: strict-spec-driven/change-proposal/v1",
    "schema_version: 1",
    "artifact_type: change_proposal",
    "schema_file: test",
    "change:",
    "  id: bad-delta",
    "  status: proposed",
    "summary:",
    "  what:",
    "    - Test",
    "  why:",
    "    - Test",
    "scope:",
    "  in: []",
    "  out: []",
    "unchanged_behavior: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "design.yaml"), [
    "schema: strict-spec-driven/change-design/v1",
    "schema_version: 1",
    "artifact_type: change_design",
    "schema_file: test",
    "change: bad-delta",
    "approach:",
    "  - Test",
    "decisions: {}",
    "alternatives: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: test",
    "change: bad-delta",
    "sections:",
    "  Implementation:",
    "    impl-1:",
    "      text: Do work",
    "      status: complete",
    "  Testing:",
    "    test-build:",
    "      text: Build",
    "      status: complete",
    "      command: bun run build",
    "    test-unit:",
    "      text: Unit tests",
    "      status: complete",
    "      command: bun test/run.ts",
    "  Verification:",
    "    verify-1:",
    "      text: Verify",
    "      status: complete",
    "testing_gates:",
    "  validation_task: test-build",
    "  unit_test_task: test-unit",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "questions.yaml"), [
    "schema: strict-spec-driven/question-list/v1",
    "schema_version: 1",
    "artifact_type: question_list",
    "schema_file: test",
    "change: bad-delta",
    "open: []",
    "resolved: []",
  ].join("\n") + "\n", "utf8");

  // malformed delta spec with wrong schema id
  writeFileSync(path.join(vChangeDir, "specs", "bad.yaml"), "invalid_field: true\n", "utf8");

  const deltaResult = verifyModule.verifyChange(verifyDeltaDir, "bad-delta");
  context.assert(!deltaResult.valid, "malformed delta spec causes verification failure");
  context.assert(
    deltaResult.diagnostics.some((d) => d.artifactPath.includes("specs")),
    "delta spec diagnostic references specs path",
  );
} finally {
  rmSync(verifyDeltaDir, { recursive: true, force: true });
}

// 12ea: malformed delta spec parse details
const verifyMalformedYamlDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-malformed-yaml-"));
try {
  const vChangeDir = path.join(verifyMalformedYamlDir, ".strict-spec-driven", "changes", "bad-yaml");
  mkdirSync(vChangeDir, { recursive: true });
  mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

  writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
    "schema: strict-spec-driven/change-proposal/v1",
    "schema_version: 1",
    "artifact_type: change_proposal",
    "schema_file: test",
    "change:",
    "  id: bad-yaml",
    "  status: proposed",
    "summary:",
    "  what:",
    "    - Test",
    "  why:",
    "    - Test",
    "scope:",
    "  in: []",
    "  out: []",
    "unchanged_behavior: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "design.yaml"), [
    "schema: strict-spec-driven/change-design/v1",
    "schema_version: 1",
    "artifact_type: change_design",
    "schema_file: test",
    "change: bad-yaml",
    "approach:",
    "  - Test",
    "decisions: {}",
    "alternatives: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: test",
    "change: bad-yaml",
    "sections:",
    "  Implementation:",
    "    impl-1:",
    "      text: Do work",
    "      status: complete",
    "  Testing:",
    "    test-build:",
    "      text: Build",
    "      status: complete",
    "      command: bun run build",
    "    test-unit:",
    "      text: Unit tests",
    "      status: complete",
    "      command: bun test/run.ts",
    "  Verification:",
    "    verify-1:",
    "      text: Verify",
    "      status: complete",
    "testing_gates:",
    "  validation_task: test-build",
    "  unit_test_task: test-unit",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "questions.yaml"), [
    "schema: strict-spec-driven/question-list/v1",
    "schema_version: 1",
    "artifact_type: question_list",
    "schema_file: test",
    "change: bad-yaml",
    "open: []",
    "resolved: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "specs", "bad.yaml"), "operations:\n\tMODIFIED:\n", "utf8");

  const malformedYamlResult = verifyModule.verifyChange(verifyMalformedYamlDir, "bad-yaml");
  const malformedYamlDiagnostic = malformedYamlResult.diagnostics.find(
    (diagnostic) => diagnostic.source === "yaml_parse" && diagnostic.artifactPath.endsWith("specs/bad.yaml"),
  );
  context.assert(!malformedYamlResult.valid, "malformed YAML parse error causes verification failure");
  context.assert(Boolean(malformedYamlDiagnostic), "verify reports malformed YAML as a structured diagnostic");
  context.assert(
    malformedYamlDiagnostic?.line === 2 && malformedYamlDiagnostic.column === 1,
    "verify malformed YAML diagnostic includes line and column",
    `line: ${malformedYamlDiagnostic?.line ?? "missing"} column: ${malformedYamlDiagnostic?.column ?? "missing"}`,
  );
  context.assert(
    malformedYamlDiagnostic?.offendingCharacter?.includes("tab") === true,
    "verify malformed YAML diagnostic identifies the offending special character",
    `offending character: ${malformedYamlDiagnostic?.offendingCharacter ?? "missing"}`,
  );
  context.assert(
    malformedYamlDiagnostic?.actual?.includes("offending character") === true,
    "verify malformed YAML diagnostic summary includes the parse cause",
    `actual: ${malformedYamlDiagnostic?.actual ?? "missing"}`,
  );
} finally {
  rmSync(verifyMalformedYamlDir, { recursive: true, force: true });
}

// 12f: exclusive target conflicts
const verifyConflictDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-conflict-"));
try {
  // change-a: MODIFIED req-1
  const changeADir = path.join(verifyConflictDir, ".strict-spec-driven", "changes", "change-a");
  mkdirSync(changeADir, { recursive: true });
  mkdirSync(path.join(changeADir, "specs"), { recursive: true });

  writeFileSync(path.join(changeADir, "proposal.yaml"), [
    "schema: strict-spec-driven/change-proposal/v1",
    "schema_version: 1",
    "artifact_type: change_proposal",
    "schema_file: test",
    "change:",
    "  id: change-a",
    "  status: proposed",
    "summary:",
    "  what:",
    "    - Test",
    "  why:",
    "    - Test",
    "scope:",
    "  in: []",
    "  out: []",
    "unchanged_behavior: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(changeADir, "design.yaml"), [
    "schema: strict-spec-driven/change-design/v1",
    "schema_version: 1",
    "artifact_type: change_design",
    "schema_file: test",
    "change: change-a",
    "approach:",
    "  - Test",
    "decisions: {}",
    "alternatives: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(changeADir, "tasks.yaml"), [
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: test",
    "change: change-a",
    "sections:",
    "  Implementation:",
    "    impl-1:",
    "      text: Do work",
    "      status: complete",
    "  Testing:",
    "    test-build:",
    "      text: Build",
    "      status: complete",
    "      command: bun run build",
    "    test-unit:",
    "      text: Unit tests",
    "      status: complete",
    "      command: bun test/run.ts",
    "  Verification:",
    "    verify-1:",
    "      text: Verify",
    "      status: complete",
    "testing_gates:",
    "  validation_task: test-build",
    "  unit_test_task: test-unit",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(changeADir, "questions.yaml"), [
    "schema: strict-spec-driven/question-list/v1",
    "schema_version: 1",
    "artifact_type: question_list",
    "schema_file: test",
    "change: change-a",
    "open: []",
    "resolved: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(changeADir, "specs", "delta.yaml"), [
    "schema: strict-spec-driven/delta-spec/v1",
    "schema_version: 1",
    "artifact_type: delta_spec",
    "schema_file: test",
    "target_spec: some-spec",
    "mapping:",
    "  implementation: []",
    "  tests: []",
    "operations:",
    "  ADDED: {}",
    "  MODIFIED:",
    "    req-1:",
    "      strength: MUST",
    "      statement: Modified version",
    "      scenarios: {}",
    "  REMOVED: {}",
  ].join("\n") + "\n", "utf8");

  // change-b: also MODIFIED req-1 (conflict)
  const changeBDir = path.join(verifyConflictDir, ".strict-spec-driven", "changes", "change-b");
  mkdirSync(changeBDir, { recursive: true });
  mkdirSync(path.join(changeBDir, "specs"), { recursive: true });

  writeFileSync(path.join(changeBDir, "proposal.yaml"), [
    "schema: strict-spec-driven/change-proposal/v1",
    "schema_version: 1",
    "artifact_type: change_proposal",
    "schema_file: test",
    "change:",
    "  id: change-b",
    "  status: proposed",
    "summary:",
    "  what:",
    "    - Test",
    "  why:",
    "    - Test",
    "scope:",
    "  in: []",
    "  out: []",
    "unchanged_behavior: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(changeBDir, "design.yaml"), [
    "schema: strict-spec-driven/change-design/v1",
    "schema_version: 1",
    "artifact_type: change_design",
    "schema_file: test",
    "change: change-b",
    "approach:",
    "  - Test",
    "decisions: {}",
    "alternatives: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(changeBDir, "tasks.yaml"), [
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: test",
    "change: change-b",
    "sections:",
    "  Implementation:",
    "    impl-1:",
    "      text: Do work",
    "      status: complete",
    "  Testing:",
    "    test-build:",
    "      text: Build",
    "      status: complete",
    "      command: bun run build",
    "    test-unit:",
    "      text: Unit tests",
    "      status: complete",
    "      command: bun test/run.ts",
    "  Verification:",
    "    verify-1:",
    "      text: Verify",
    "      status: complete",
    "testing_gates:",
    "  validation_task: test-build",
    "  unit_test_task: test-unit",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(changeBDir, "questions.yaml"), [
    "schema: strict-spec-driven/question-list/v1",
    "schema_version: 1",
    "artifact_type: question_list",
    "schema_file: test",
    "change: change-b",
    "open: []",
    "resolved: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(changeBDir, "specs", "delta.yaml"), [
    "schema: strict-spec-driven/delta-spec/v1",
    "schema_version: 1",
    "artifact_type: delta_spec",
    "schema_file: test",
    "target_spec: some-spec",
    "mapping:",
    "  implementation: []",
    "  tests: []",
    "operations:",
    "  ADDED: {}",
    "  MODIFIED:",
    "    req-1:",
    "      strength: MUST",
    "      statement: Other modified version",
    "      scenarios: {}",
    "  REMOVED: {}",
  ].join("\n") + "\n", "utf8");

  const conflictResultA = verifyModule.verifyChange(verifyConflictDir, "change-a");
  context.assert(!conflictResultA.valid, "exclusive target conflict causes verification failure");
  context.assert(
    conflictResultA.diagnostics.some((d) => d.source === "exclusive_active_target"),
    "exclusive target conflict produces exclusive_active_target diagnostic",
  );
  context.assert(
    conflictResultA.diagnostics.some((d) => d.message.includes("req-1")),
    "exclusive target diagnostic names conflicting requirement ID",
  );
  context.assert(
    conflictResultA.diagnostics.some((d) => d.message.includes("change-a") && d.message.includes("change-b")),
    "exclusive target diagnostic names both conflicting changes",
  );

  const conflictCliA = cli(["verify", "change-a"], { cwd: verifyConflictDir });
  context.assert(conflictCliA.status !== 0, "verify CLI exits non-zero for target conflict", `got ${conflictCliA.status}`);
} finally {
  rmSync(verifyConflictDir, { recursive: true, force: true });
}

// 12g: missing change
const verifyMissingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-missing-"));
try {
  mkdirSync(path.join(verifyMissingDir, ".strict-spec-driven", "changes"), { recursive: true });

  const missingModule = verifyModule.verifyChange(verifyMissingDir, "no-such-change");
  context.assert(false, "verify missing change should throw", `got result: ${JSON.stringify(missingModule)}`);
} catch (e) {
  context.assert(
    (e instanceof Error ? e.message : String(e)).includes("not found"),
    "verify missing change throws 'not found' error",
  );
} finally {
  rmSync(verifyMissingDir, { recursive: true, force: true });
}

// 12h: missing change via CLI
const verifyMissingCliDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-missingcli-"));
try {
  mkdirSync(path.join(verifyMissingCliDir, ".strict-spec-driven", "changes"), { recursive: true });
  const missingCli = cli(["verify", "no-such-change"], { cwd: verifyMissingCliDir });
  context.assert(missingCli.status !== 0, "verify CLI exits non-zero for missing change", `got ${missingCli.status}`);
  context.assert(
    missingCli.stderr.includes("not found"),
    "verify CLI stderr reports 'not found' for missing change",
  );
} finally {
  rmSync(verifyMissingCliDir, { recursive: true, force: true });
}

// 12i: verify CLI argument validation
const verifyNoArgDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-noarg-"));
try {
  const noArg = cli(["verify"], { cwd: verifyNoArgDir });
  context.assert(noArg.status !== 0, "verify without change name exits non-zero");
  context.assert(noArg.stderr.includes("Usage:"), "verify without change name prints usage");
} finally {
  rmSync(verifyNoArgDir, { recursive: true, force: true });
}

// 12j: verify from dist-only environment
const distOnlyVerifyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-dist-only-verify-"));
try {
  const vChangeDir = path.join(distOnlyVerifyDir, ".strict-spec-driven", "changes", "dist-verify-test");
  mkdirSync(vChangeDir, { recursive: true });
  mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

  writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
    "schema: strict-spec-driven/change-proposal/v1",
    "schema_version: 1",
    "artifact_type: change_proposal",
    "schema_file: test",
    "change:",
    "  id: dist-verify-test",
    "  status: proposed",
    "summary:",
    "  what:",
    "    - Test",
    "  why:",
    "    - Test",
    "scope:",
    "  in: []",
    "  out: []",
    "unchanged_behavior: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "design.yaml"), [
    "schema: strict-spec-driven/change-design/v1",
    "schema_version: 1",
    "artifact_type: change_design",
    "schema_file: test",
    "change: dist-verify-test",
    "approach:",
    "  - Test",
    "decisions: {}",
    "alternatives: []",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: test",
    "change: dist-verify-test",
    "sections:",
    "  Implementation:",
    "    impl-1:",
    "      text: Do work",
    "      status: complete",
    "  Testing:",
    "    test-build:",
    "      text: Build",
    "      status: complete",
    "      command: bun run build",
    "    test-unit:",
    "      text: Unit tests",
    "      status: complete",
    "      command: bun test/run.ts",
    "  Verification:",
    "    verify-1:",
    "      text: Verify",
    "      status: complete",
    "testing_gates:",
    "  validation_task: test-build",
    "  unit_test_task: test-unit",
  ].join("\n") + "\n", "utf8");

  writeFileSync(path.join(vChangeDir, "questions.yaml"), [
    "schema: strict-spec-driven/question-list/v1",
    "schema_version: 1",
    "artifact_type: question_list",
    "schema_file: test",
    "change: dist-verify-test",
    "open: []",
    "resolved: []",
  ].join("\n") + "\n", "utf8");

  const distVerifyCli = cli(["verify", "dist-verify-test"], { cwd: distOnlyVerifyDir });
  context.assert(distVerifyCli.status === 0, "verify succeeds from dist-only temp directory", `got ${distVerifyCli.status}`);
  const distVerifyJson = JSON.parse(distVerifyCli.stdout.trim());
  context.assert(distVerifyJson.valid === true, "verify from dist reports valid=true");
  context.assert(distVerifyJson.changeName === "dist-verify-test", "verify from dist reports correct changeName");
} finally {
  rmSync(distOnlyVerifyDir, { recursive: true, force: true });
}

context.section("[13] archive command");

function formatLocalDateStamp(date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function writeMainSpecArtifact(
  rootDir: string,
  relativePath: string,
  specId: string,
  title: string,
  requirements: Array<{ id: string; statement: string }>,
): void {
  const specPath = path.join(rootDir, ".strict-spec-driven", "specs", relativePath);
  mkdirSync(path.dirname(specPath), { recursive: true });
  writeFileSync(
    specPath,
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/main-spec/v1",
      schema_version: 1,
      artifact_type: "main_spec",
      schema_file: "test",
      spec: {
        id: specId,
        title,
      },
      mapping: {
        implementation: [],
        tests: [],
      },
      requirements: Object.fromEntries(requirements.map((requirement) => [requirement.id, {
        strength: "MUST",
        statement: requirement.statement,
        scenarios: {},
      }])),
    }),
    "utf8",
  );
}

function writeValidChangeArtifacts(
  rootDir: string,
  changeName: string,
  options: { implementationStatus?: "pending" | "complete"; openQuestion?: boolean } = {},
): void {
  const changeDir = path.join(rootDir, ".strict-spec-driven", "changes", changeName);
  mkdirSync(path.join(changeDir, "specs"), { recursive: true });

  writeFileSync(
    path.join(changeDir, "proposal.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/change-proposal/v1",
      schema_version: 1,
      artifact_type: "change_proposal",
      schema_file: "test",
      change: {
        id: changeName,
        status: "proposed",
      },
      summary: {
        what: ["Archive test change"],
        why: ["Archive test coverage"],
      },
      scope: {
        in: [],
        out: [],
      },
      unchanged_behavior: [],
    }),
    "utf8",
  );

  writeFileSync(
    path.join(changeDir, "design.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/change-design/v1",
      schema_version: 1,
      artifact_type: "change_design",
      schema_file: "test",
      change: changeName,
      approach: ["Archive test design"],
      decisions: {},
      alternatives: [],
    }),
    "utf8",
  );

  writeFileSync(
    path.join(changeDir, "tasks.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/task-list/v2",
      schema_version: 2,
      artifact_type: "task_list",
      schema_file: "test",
      change: changeName,
      sections: {
        Implementation: {
          "impl-1": {
            text: "Do work",
            status: options.implementationStatus ?? "complete",
          },
        },
        Testing: {
          "test-build": {
            text: "Build",
            status: "complete",
            command: "bun run build",
          },
          "test-unit": {
            text: "Unit tests",
            status: "complete",
            command: "bun test/run.ts",
          },
        },
        Verification: {
          "verify-1": {
            text: "Verify",
            status: "complete",
          },
        },
      },
      testing_gates: {
        validation_task: "test-build",
        unit_test_task: "test-unit",
      },
    }),
    "utf8",
  );

  writeFileSync(
    path.join(changeDir, "questions.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/question-list/v1",
      schema_version: 1,
      artifact_type: "question_list",
      schema_file: "test",
      change: changeName,
      open: options.openQuestion
        ? [
            {
              id: "q-1",
              question: "Open question",
              context: "Archive test",
              status: "open",
            },
          ]
        : [],
      resolved: [],
    }),
    "utf8",
  );
}

function writeDeltaSpecArtifact(
  rootDir: string,
  changeName: string,
  fileName: string,
  targetSpec: string,
  operations: {
    ADDED?: Record<string, { strength: string; statement: string; scenarios: Record<string, unknown[]> }>;
    MODIFIED?: Record<string, { strength: string; statement: string; scenarios: Record<string, unknown[]> }>;
    REMOVED?: Record<string, { reason: string }>;
  },
): void {
  const deltaPath = path.join(rootDir, ".strict-spec-driven", "changes", changeName, "specs", fileName);
  mkdirSync(path.dirname(deltaPath), { recursive: true });
  writeFileSync(
    deltaPath,
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/delta-spec/v1",
      schema_version: 1,
      artifact_type: "delta_spec",
      schema_file: "test",
      target_spec: targetSpec,
      mapping: {
        implementation: [],
        tests: [],
      },
      operations: {
        ADDED: operations.ADDED ?? {},
        MODIFIED: operations.MODIFIED ?? {},
        REMOVED: operations.REMOVED ?? {},
      },
    }),
    "utf8",
  );
}

function writeNewSpecDeltaArtifact(
  rootDir: string,
  changeName: string,
  fileName: string,
  targetSpec: string,
  spec: { title: string; path: string } | undefined,
  operations: {
    ADDED?: Record<string, { strength: string; statement: string; scenarios: Record<string, unknown[]> }>;
    MODIFIED?: Record<string, { strength: string; statement: string; scenarios: Record<string, unknown[]> }>;
    REMOVED?: Record<string, { reason: string }>;
  },
): void {
  const deltaPath = path.join(rootDir, ".strict-spec-driven", "changes", changeName, "specs", fileName);
  mkdirSync(path.dirname(deltaPath), { recursive: true });
  const artifact: Record<string, unknown> = {
    schema: "strict-spec-driven/delta-spec/v1",
    schema_version: 1,
    artifact_type: "delta_spec",
    schema_file: "test",
    target_spec: targetSpec,
  };
  if (spec) {
    artifact.spec = { title: spec.title, path: spec.path };
  }
  artifact.mapping = { implementation: [], tests: [] };
  artifact.operations = {
    ADDED: operations.ADDED ?? {},
    MODIFIED: operations.MODIFIED ?? {},
    REMOVED: operations.REMOVED ?? {},
  };
  writeFileSync(deltaPath, yamlModule.stringifyYamlDocument(artifact), "utf8");
}

function writeRoadmapIndexArtifact(
  rootDir: string,
  milestones: Array<{ id: string; title: string; path: string; status: string }>,
): void {
  const indexPath = path.join(rootDir, ".strict-spec-driven", "roadmap", "INDEX.yaml");
  mkdirSync(path.dirname(indexPath), { recursive: true });
  const milestonesMap: Record<string, { title: string; path: string; status: string }> = {};
  for (const milestone of milestones) {
    milestonesMap[milestone.id] = {
      title: milestone.title,
      path: milestone.path,
      status: milestone.status,
    };
  }

  writeFileSync(
    indexPath,
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/roadmap-index/v2",
      schema_version: 2,
      artifact_type: "roadmap_index",
      schema_file: "../schemas/roadmap-index.yaml",
      milestones: milestonesMap,
    }),
    "utf8",
  );
}

function writeRoadmapMilestoneArtifact(
  rootDir: string,
  fileName: string,
  options: {
    id: string;
    title: string;
    goal: string;
    status: string;
    plannedChanges: Array<{ id: string; status: string; summary: string; depends_on: string[] }>;
  },
): void {
  const milestonePath = path.join(rootDir, ".strict-spec-driven", "roadmap", "milestones", fileName);
  mkdirSync(path.dirname(milestonePath), { recursive: true });

  const milestoneKeyed: Record<string, { title: string }> = {
    [options.id]: { title: options.title },
  };
  const plannedChangesMap: Record<string, { status: string; summary: string; details: string; depends_on: string[] }> = {};
  for (const plannedChange of options.plannedChanges) {
    plannedChangesMap[plannedChange.id] = {
      status: plannedChange.status,
      summary: plannedChange.summary,
      details: `Test details for ${plannedChange.id}`,
      depends_on: plannedChange.depends_on,
    };
  }

  writeFileSync(
    milestonePath,
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/roadmap-milestone/v2",
      schema_version: 2,
      artifact_type: "roadmap_milestone",
      schema_file: "../schemas/roadmap-milestone.yaml",
      milestone: milestoneKeyed,
      goal: options.goal,
      scope: {
        in: ["Archive lifecycle behavior."],
        out: ["Unrelated behavior."],
      },
      done_criteria: ["The roadmap milestone stays aligned with archived change state."],
      intake_questions: [
        {
          id: "objective",
          question: "What observable outcome should this milestone deliver?",
          context: "Archive lifecycle tests need valid roadmap milestone artifacts.",
          impact: "Missing intake questions would make the milestone schema invalid before archive behavior is exercised.",
          recommendation: "Keep a minimal structured intake question on fixture milestones.",
        },
      ],
      planned_changes: plannedChangesMap,
      dependencies: [],
      risks: [],
      status: options.status,
      notes: [],
    }),
    "utf8",
  );
}

// 13a: happy path archive merge + move + index regeneration
const archiveHappyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-happy-"));
try {
  const changeName = "archive-happy";
  writeMainSpecArtifact(
    archiveHappyDir,
    "cli/foundation.yaml",
    "cli-foundation",
    "CLI Foundation",
    [
      { id: "req-base", statement: "Base requirement" },
      { id: "req-remove", statement: "Removed requirement" },
    ],
  );
  mkdirSync(path.join(archiveHappyDir, ".strict-spec-driven", "specs"), { recursive: true });
  writeFileSync(
    path.join(archiveHappyDir, ".strict-spec-driven", "specs", "INDEX.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/spec-index/v1",
      schema_version: 1,
      artifact_type: "spec_index",
      schema_file: "test",
      specs: [],
    }),
    "utf8",
  );
  writeValidChangeArtifacts(archiveHappyDir, changeName);
  writeDeltaSpecArtifact(archiveHappyDir, changeName, "cli.yaml", "cli-foundation", {
    ADDED: {
      "req-added": {
        strength: "MUST",
        statement: "Added requirement",
        scenarios: {},
      },
    },
    MODIFIED: {
      "req-base": {
        strength: "MUST",
        statement: "Updated requirement",
        scenarios: {},
      },
    },
    REMOVED: {
      "req-remove": { reason: "No longer needed" },
    },
  });

  const archiveResult = cli(["archive", changeName], { cwd: archiveHappyDir });
  context.assert(archiveResult.status === 0, "archive exits zero for a valid complete change", `got ${archiveResult.status}`);
  const archiveJson = JSON.parse(archiveResult.stdout.trim());
  context.assert(archiveJson.valid === true, "archive output marks valid=true");
  context.assert(archiveJson.roadmapSync === null, "archive reports roadmapSync as null when no roadmap exists");
  context.assert(archiveJson.mergeSummary.specsUpdated === 1, "archive merge summary reports one updated spec");
  context.assert(archiveJson.mergeSummary.added === 1, "archive merge summary reports ADDED count");
  context.assert(archiveJson.mergeSummary.modified === 1, "archive merge summary reports MODIFIED count");
  context.assert(archiveJson.mergeSummary.removed === 1, "archive merge summary reports REMOVED count");
  context.assert(
    archiveJson.mergeSummary.modifiedMissingTargetAsAdded === 0,
    "archive merge summary reports zero MODIFIED fallback additions",
  );
  context.assert(
    archiveJson.mergeSummary.removedMissingTargetSkipped === 0,
    "archive merge summary reports zero skipped REMOVED entries",
  );

  const expectedArchivePath = `.strict-spec-driven/changes/archive/${formatLocalDateStamp()}-${changeName}`;
  context.assert(
    archiveJson.archiveDestination === expectedArchivePath,
    "archive output includes deterministic archive destination path",
    `got ${archiveJson.archiveDestination}`,
  );
  context.assert(
    !existsSync(path.join(archiveHappyDir, ".strict-spec-driven", "changes", changeName)),
    "archive removes the active change directory",
  );
  context.assert(
    existsSync(path.join(archiveHappyDir, archiveJson.archiveDestination)),
    "archive moves the change into archive destination",
  );

  const mergedMainSpec = yamlModule.parseYamlFile<{ requirements: Record<string, { statement: string }> }>(
    path.join(archiveHappyDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml"),
  );
  const mergedIds = Object.keys(mergedMainSpec.requirements);
  context.assert(
    JSON.stringify(mergedIds) === JSON.stringify(["req-base", "req-added"]),
    "archive merge applies MODIFIED, ADDED, and REMOVED operations to main spec",
    `got ${JSON.stringify(mergedIds)}`,
  );
  context.assert(
    mergedMainSpec.requirements["req-base"]?.statement === "Updated requirement",
    "archive MODIFIED operation replaces requirement by stable identifier",
  );

  const regeneratedIndex = yamlModule.parseYamlFile<{ specs: Array<{ id: string; path: string }> }>(
    path.join(archiveHappyDir, ".strict-spec-driven", "specs", "INDEX.yaml"),
  );
  context.assert(
    regeneratedIndex.specs.some(
      (entry) =>
        entry.id === "cli-foundation" &&
        entry.path === ".strict-spec-driven/specs/cli/foundation.yaml",
    ),
    "archive regenerates specs index from merged main spec state",
  );
} finally {
  rmSync(archiveHappyDir, { recursive: true, force: true });
}

// 13a2: archive unions a delta-spec mapping into the existing main spec mapping
const archiveMappingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-mapping-"));
try {
  const changeName = "archive-mapping-merge";
  const foundationPath = path.join(archiveMappingDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml");
  mkdirSync(path.dirname(foundationPath), { recursive: true });
  writeFileSync(
    foundationPath,
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/main-spec/v1",
      schema_version: 1,
      artifact_type: "main_spec",
      schema_file: "test",
      spec: { id: "cli-foundation", title: "CLI Foundation" },
      mapping: { implementation: ["src/archive.ts"], tests: ["test/suites/change-lifecycle.ts"] },
      requirements: { "req-base": { strength: "MUST", statement: "Base requirement", scenarios: {} } },
    }),
    "utf8",
  );
  writeFileSync(
    path.join(archiveMappingDir, ".strict-spec-driven", "specs", "INDEX.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/spec-index/v1",
      schema_version: 1,
      artifact_type: "spec_index",
      schema_file: "test",
      specs: [],
    }),
    "utf8",
  );
  writeValidChangeArtifacts(archiveMappingDir, changeName);
  // The delta repeats the pre-existing implementation path (to exercise dedup),
  // adds a new implementation path, and adds a new test path.
  writeFileSync(
    path.join(archiveMappingDir, ".strict-spec-driven", "changes", changeName, "specs", "cli.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/delta-spec/v1",
      schema_version: 1,
      artifact_type: "delta_spec",
      schema_file: "test",
      target_spec: "cli-foundation",
      mapping: {
        implementation: ["src/archive.ts", "src/roadmap/sync.ts"],
        tests: ["test/suites/operations.ts"],
      },
      operations: {
        ADDED: {},
        MODIFIED: { "req-base": { strength: "MUST", statement: "Updated requirement", scenarios: {} } },
        REMOVED: {},
      },
    }),
    "utf8",
  );

  const archiveResult = cli(["archive", changeName], { cwd: archiveMappingDir });
  context.assert(
    archiveResult.status === 0,
    "archive exits zero when unioning a delta mapping",
    `got ${archiveResult.status}: ${archiveResult.stdout}`,
  );
  const mergedMainSpec = yamlModule.parseYamlFile<{ mapping: { implementation: string[]; tests: string[] } }>(foundationPath);
  context.assert(
    JSON.stringify(mergedMainSpec.mapping.implementation) === JSON.stringify(["src/archive.ts", "src/roadmap/sync.ts"]),
    "archive unions delta implementation mapping into the main spec, deduped and order-stable",
    `got ${JSON.stringify(mergedMainSpec.mapping.implementation)}`,
  );
  context.assert(
    JSON.stringify(mergedMainSpec.mapping.tests) === JSON.stringify(["test/suites/change-lifecycle.ts", "test/suites/operations.ts"]),
    "archive unions delta test mapping into the main spec, deduped and order-stable",
    `got ${JSON.stringify(mergedMainSpec.mapping.tests)}`,
  );
} finally {
  rmSync(archiveMappingDir, { recursive: true, force: true });
}

// 13a3: an empty delta mapping leaves the existing main spec mapping unchanged
const archiveMappingPreserveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-mapping-preserve-"));
try {
  const changeName = "archive-mapping-preserve";
  const foundationPath = path.join(archiveMappingPreserveDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml");
  mkdirSync(path.dirname(foundationPath), { recursive: true });
  writeFileSync(
    foundationPath,
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/main-spec/v1",
      schema_version: 1,
      artifact_type: "main_spec",
      schema_file: "test",
      spec: { id: "cli-foundation", title: "CLI Foundation" },
      mapping: { implementation: ["src/archive.ts"], tests: ["test/suites/change-lifecycle.ts"] },
      requirements: { "req-base": { strength: "MUST", statement: "Base requirement", scenarios: {} } },
    }),
    "utf8",
  );
  writeFileSync(
    path.join(archiveMappingPreserveDir, ".strict-spec-driven", "specs", "INDEX.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/spec-index/v1",
      schema_version: 1,
      artifact_type: "spec_index",
      schema_file: "test",
      specs: [],
    }),
    "utf8",
  );
  writeValidChangeArtifacts(archiveMappingPreserveDir, changeName);
  // writeDeltaSpecArtifact writes empty implementation/test mapping arrays.
  writeDeltaSpecArtifact(archiveMappingPreserveDir, changeName, "cli.yaml", "cli-foundation", {
    MODIFIED: { "req-base": { strength: "MUST", statement: "Updated requirement", scenarios: {} } },
  });

  const archiveResult = cli(["archive", changeName], { cwd: archiveMappingPreserveDir });
  context.assert(
    archiveResult.status === 0,
    "archive exits zero with an empty delta mapping",
    `got ${archiveResult.status}: ${archiveResult.stdout}`,
  );
  const mergedMainSpec = yamlModule.parseYamlFile<{ mapping: { implementation: string[]; tests: string[] } }>(foundationPath);
  context.assert(
    JSON.stringify(mergedMainSpec.mapping.implementation) === JSON.stringify(["src/archive.ts"])
      && JSON.stringify(mergedMainSpec.mapping.tests) === JSON.stringify(["test/suites/change-lifecycle.ts"]),
    "archive leaves the existing main spec mapping unchanged when the delta mapping is empty",
    `got ${JSON.stringify(mergedMainSpec.mapping)}`,
  );
} finally {
  rmSync(archiveMappingPreserveDir, { recursive: true, force: true });
}

// 13b: invalid preconditions block archive
const archiveBlockedDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-blocked-"));
try {
  const changeName = "archive-blocked";
  writeMainSpecArtifact(
    archiveBlockedDir,
    "cli/foundation.yaml",
    "cli-foundation",
    "CLI Foundation",
    [{ id: "req-base", statement: "Base requirement" }],
  );
  writeValidChangeArtifacts(archiveBlockedDir, changeName, { implementationStatus: "pending" });
  writeDeltaSpecArtifact(archiveBlockedDir, changeName, "cli.yaml", "cli-foundation", {
    ADDED: {},
    MODIFIED: {},
    REMOVED: {},
  });

  const blockedResult = cli(["archive", changeName], { cwd: archiveBlockedDir });
  context.assert(blockedResult.status !== 0, "archive exits non-zero when change fails pre-archive verification");
  context.assert(
    blockedResult.stderr.includes("failed verification"),
    "archive precondition failure reports verification blocker",
    `stderr: ${blockedResult.stderr.trim()}`,
  );
  context.assert(
    existsSync(path.join(archiveBlockedDir, ".strict-spec-driven", "changes", changeName)),
    "archive precondition failure keeps change in active directory",
  );
} finally {
  rmSync(archiveBlockedDir, { recursive: true, force: true });
}

// 13c: ADDED collisions with existing main-spec requirements block archive before writes
const archiveAddedCollisionDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-added-collision-"));
try {
  const changeName = "archive-added-collision";
  writeMainSpecArtifact(
    archiveAddedCollisionDir,
    "cli/foundation.yaml",
    "cli-foundation",
    "CLI Foundation",
    [{ id: "req-existing", statement: "Existing requirement" }],
  );
  writeValidChangeArtifacts(archiveAddedCollisionDir, changeName);
  writeDeltaSpecArtifact(archiveAddedCollisionDir, changeName, "cli.yaml", "cli-foundation", {
    ADDED: {
      "req-existing": {
        strength: "MUST",
        statement: "Conflicting added requirement",
        scenarios: {},
      },
    },
    MODIFIED: {},
    REMOVED: {},
  });

  const verifyCollision = verifyModule.verifyChange(archiveAddedCollisionDir, changeName);
  context.assert(!verifyCollision.valid, "verify rejects ADDED collisions with target main specs");
  context.assert(
    verifyCollision.diagnostics.some(
      (diagnostic) =>
        diagnostic.source === "added_requirement_collision" &&
        diagnostic.artifactPath.endsWith("specs/cli.yaml") &&
        diagnostic.message.includes("req-existing") &&
        diagnostic.message.includes("cli-foundation"),
    ),
    "verify ADDED collision diagnostic names the delta path, requirement ID, and target spec",
  );

  const beforeArchiveSpec = readFileSync(
    path.join(archiveAddedCollisionDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml"),
    "utf8",
  );
  const collisionArchive = cli(["archive", changeName], { cwd: archiveAddedCollisionDir });
  context.assert(collisionArchive.status !== 0, "archive exits non-zero for ADDED collision");
  context.assert(
    collisionArchive.stderr.includes("added_requirement_collision") &&
      collisionArchive.stderr.includes("req-existing") &&
      collisionArchive.stderr.includes("cli-foundation"),
    "archive ADDED collision failure reports the diagnostic source, requirement ID, and target spec",
    `stderr: ${collisionArchive.stderr.trim()}`,
  );
  context.assert(
    existsSync(path.join(archiveAddedCollisionDir, ".strict-spec-driven", "changes", changeName)),
    "archive ADDED collision keeps change in active directory",
  );
  context.assert(
    readFileSync(path.join(archiveAddedCollisionDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml"), "utf8") === beforeArchiveSpec,
    "archive ADDED collision does not rewrite the target main spec",
  );
} finally {
  rmSync(archiveAddedCollisionDir, { recursive: true, force: true });
}

// 13c-bis: a seedless delta targeting a missing main spec is flagged at verify
// time with concrete remediation, and archive stays blocking and non-destructive
const archiveUnresolvableDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-unresolvable-"));
try {
  const changeName = "archive-unresolvable-target";
  writeValidChangeArtifacts(archiveUnresolvableDir, changeName);
  writeDeltaSpecArtifact(archiveUnresolvableDir, changeName, "cli-interface.yaml", "cli-interface", {
    ADDED: {
      "req-new": {
        strength: "MUST",
        statement: "A new requirement",
        scenarios: {},
      },
    },
  });

  const verifyUnresolvable = verifyModule.verifyChange(archiveUnresolvableDir, changeName);
  context.assert(
    !verifyUnresolvable.valid,
    "verify rejects a seedless delta targeting a missing main spec",
  );
  const unresolvableDiagnostic = verifyUnresolvable.diagnostics.find(
    (diagnostic) => diagnostic.source === "unresolvable_delta_target",
  );
  context.assert(
    unresolvableDiagnostic !== undefined,
    "verify emits an unresolvable_delta_target diagnostic",
  );
  context.assert(
    unresolvableDiagnostic?.artifactPath.endsWith("specs/cli-interface.yaml") === true &&
      unresolvableDiagnostic?.fieldPath === "$.target_spec",
    "unresolvable_delta_target diagnostic names the delta file path and target_spec field",
  );
  const remediation = unresolvableDiagnostic?.message ?? "";
  context.assert(
    remediation.includes("cli-interface") &&
      remediation.includes(
        "generate archive-unresolvable-target delta-spec --target-spec cli-interface --title",
      ) &&
      remediation.includes("--new-spec-path .strict-spec-driven/specs/cli-interface.yaml") &&
      remediation.includes(".strict-spec-driven/specs/INDEX.yaml"),
    "verify remediation names the target id, remedy A generate command with change name and convention path, and remedy B INDEX.yaml",
    `message: ${remediation}`,
  );

  const beforeArchiveExists = existsSync(
    path.join(archiveUnresolvableDir, ".strict-spec-driven", "changes", changeName),
  );
  const unresolvableArchive = cli(["archive", changeName], { cwd: archiveUnresolvableDir });
  context.assert(
    unresolvableArchive.status !== 0,
    "archive exits non-zero for an unresolvable delta target",
  );
  context.assert(
    unresolvableArchive.stderr.includes("unresolvable_delta_target") &&
      unresolvableArchive.stderr.includes("cli-interface") &&
      unresolvableArchive.stderr.includes(".strict-spec-driven/specs/INDEX.yaml"),
    "archive failure carries the concrete unresolvable-target remediation",
    `stderr: ${unresolvableArchive.stderr.trim()}`,
  );
  context.assert(
    beforeArchiveExists &&
      existsSync(path.join(archiveUnresolvableDir, ".strict-spec-driven", "changes", changeName)),
    "archive keeps the unresolvable-target change in the active changes directory",
  );
} finally {
  rmSync(archiveUnresolvableDir, { recursive: true, force: true });
}

// 13c-ter: a sibling delta that creates the target with a valid seed block
// resolves a seedless delta, so no unresolvable-target diagnostic is emitted
const archiveSiblingResolveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-sibling-resolve-"));
try {
  const changeName = "archive-sibling-resolve";
  writeValidChangeArtifacts(archiveSiblingResolveDir, changeName);
  // Seedless delta relying on its sibling to introduce the target spec.
  writeDeltaSpecArtifact(archiveSiblingResolveDir, changeName, "brand-new-iface.yaml", "brand-new-iface", {
    ADDED: {
      "req-added": {
        strength: "MUST",
        statement: "An added requirement on the sibling-created spec",
        scenarios: {},
      },
    },
  });
  // Sibling new-spec delta that creates the same target with a valid seed block.
  writeFileSync(
    path.join(
      archiveSiblingResolveDir,
      ".strict-spec-driven",
      "changes",
      changeName,
      "specs",
      "brand-new-iface-seed.yaml",
    ),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/delta-spec/v1",
      schema_version: 1,
      artifact_type: "delta_spec",
      schema_file: "test",
      target_spec: "brand-new-iface",
      spec: {
        title: "Brand New Interface",
        path: ".strict-spec-driven/specs/brand-new-iface.yaml",
      },
      mapping: { implementation: [], tests: [] },
      operations: {
        ADDED: {
          "req-seed": {
            strength: "MUST",
            statement: "The seed requirement for the new spec",
            scenarios: {},
          },
        },
        MODIFIED: {},
        REMOVED: {},
      },
    }),
    "utf8",
  );

  const verifySibling = verifyModule.verifyChange(archiveSiblingResolveDir, changeName);
  context.assert(
    !verifySibling.diagnostics.some((diagnostic) => diagnostic.source === "unresolvable_delta_target"),
    "a sibling new-spec delta resolves the target so no unresolvable-target diagnostic is emitted",
    `diagnostics: ${JSON.stringify(verifySibling.diagnostics.map((d) => d.source))}`,
  );
} finally {
  rmSync(archiveSiblingResolveDir, { recursive: true, force: true });
}

// 13d: MODIFIED missing target falls back to ADDED
const archiveModifiedFallbackDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-modfallback-"));
try {
  const changeName = "archive-mod-fallback";
  writeMainSpecArtifact(
    archiveModifiedFallbackDir,
    "cli/foundation.yaml",
    "cli-foundation",
    "CLI Foundation",
    [{ id: "req-existing", statement: "Existing requirement" }],
  );
  writeValidChangeArtifacts(archiveModifiedFallbackDir, changeName);
  writeDeltaSpecArtifact(archiveModifiedFallbackDir, changeName, "cli.yaml", "cli-foundation", {
    ADDED: {},
    MODIFIED: {
      "req-missing": {
        strength: "MUST",
        statement: "Fallback added requirement",
        scenarios: {},
      },
    },
    REMOVED: {},
  });

  const fallbackResult = cli(["archive", changeName], { cwd: archiveModifiedFallbackDir });
  context.assert(fallbackResult.status === 0, "archive succeeds when MODIFIED target is missing");
  const fallbackJson = JSON.parse(fallbackResult.stdout.trim());
  context.assert(
    fallbackJson.mergeSummary.modifiedMissingTargetAsAdded === 1,
    "archive records MODIFIED missing-target fallback in summary",
  );
  context.assert(fallbackJson.mergeSummary.modified === 0, "archive reports zero direct MODIFIED replacements for fallback case");
  context.assert(
    Array.isArray(fallbackJson.mergedSpecs[0]?.modifiedMissingTargetAsAdded) &&
      fallbackJson.mergedSpecs[0].modifiedMissingTargetAsAdded.includes("req-missing"),
    "archive merged-spec report includes missing MODIFIED target identifier",
  );

  const mergedFallbackSpec = yamlModule.parseYamlFile<{ requirements: Record<string, unknown> }>(
    path.join(archiveModifiedFallbackDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml"),
  );
  context.assert(
    "req-missing" in mergedFallbackSpec.requirements,
    "archive treats missing MODIFIED target replacement as ADDED requirement",
  );
} finally {
  rmSync(archiveModifiedFallbackDir, { recursive: true, force: true });
}

// 13e: REMOVED missing target is skipped
const archiveRemovedSkipDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-remskip-"));
try {
  const changeName = "archive-remove-skip";
  writeMainSpecArtifact(
    archiveRemovedSkipDir,
    "cli/foundation.yaml",
    "cli-foundation",
    "CLI Foundation",
    [{ id: "req-existing", statement: "Existing requirement" }],
  );
  writeValidChangeArtifacts(archiveRemovedSkipDir, changeName);
  writeDeltaSpecArtifact(archiveRemovedSkipDir, changeName, "cli.yaml", "cli-foundation", {
    ADDED: {},
    MODIFIED: {},
    REMOVED: {
      "req-ghost": { reason: "No longer exists" },
    },
  });

  const removedSkipResult = cli(["archive", changeName], { cwd: archiveRemovedSkipDir });
  context.assert(removedSkipResult.status === 0, "archive succeeds when REMOVED target is missing");
  const removedSkipJson = JSON.parse(removedSkipResult.stdout.trim());
  context.assert(removedSkipJson.mergeSummary.removed === 0, "archive reports zero direct removals for missing target");
  context.assert(
    removedSkipJson.mergeSummary.removedMissingTargetSkipped === 1,
    "archive records skipped REMOVED missing-target count",
  );
  context.assert(
    Array.isArray(removedSkipJson.mergedSpecs[0]?.removedMissingTargetSkipped) &&
      removedSkipJson.mergedSpecs[0].removedMissingTargetSkipped.includes("req-ghost"),
    "archive merged-spec report includes skipped REMOVED target identifier",
  );

  const mergedRemovedSkipSpec = yamlModule.parseYamlFile<{ requirements: Record<string, unknown> }>(
    path.join(archiveRemovedSkipDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml"),
  );
  context.assert(
    JSON.stringify(Object.keys(mergedRemovedSkipSpec.requirements)) ===
      JSON.stringify(["req-existing"]),
    "archive keeps existing requirements unchanged when REMOVED target is missing",
  );
} finally {
  rmSync(archiveRemovedSkipDir, { recursive: true, force: true });
}

// 13f: archive destination collision handling
const archiveCollisionDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-collision-"));
try {
  const changeName = "archive-collision";
  const archiveDate = formatLocalDateStamp();
  const existingArchivePath = path.join(
    archiveCollisionDir,
    ".strict-spec-driven",
    "changes",
    "archive",
    `${archiveDate}-${changeName}`,
  );
  mkdirSync(existingArchivePath, { recursive: true });

  writeMainSpecArtifact(
    archiveCollisionDir,
    "cli/foundation.yaml",
    "cli-foundation",
    "CLI Foundation",
    [{ id: "req-existing", statement: "Existing requirement" }],
  );
  writeValidChangeArtifacts(archiveCollisionDir, changeName);
  writeDeltaSpecArtifact(archiveCollisionDir, changeName, "cli.yaml", "cli-foundation", {
    ADDED: {},
    MODIFIED: {},
    REMOVED: {},
  });

  const collisionResult = cli(["archive", changeName], { cwd: archiveCollisionDir });
  context.assert(collisionResult.status === 0, "archive succeeds when default archive destination already exists");
  const collisionJson = JSON.parse(collisionResult.stdout.trim());
  context.assert(
    collisionJson.archiveDestination.endsWith(`${archiveDate}-${changeName}-2`),
    "archive appends numeric suffix when archive destination collides",
    `got ${collisionJson.archiveDestination}`,
  );
  context.assert(
    existsSync(path.join(archiveCollisionDir, collisionJson.archiveDestination)),
    "archive creates suffixed archive directory when collision occurs",
  );
} finally {
  rmSync(archiveCollisionDir, { recursive: true, force: true });
}

// 13g: archive syncs roadmap milestone state after a linked change is archived
const archiveRoadmapDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-roadmap-"));
try {
  const changeName = "archive-roadmap";
  writeMainSpecArtifact(
    archiveRoadmapDir,
    "cli/foundation.yaml",
    "cli-foundation",
    "CLI Foundation",
    [{ id: "req-existing", statement: "Existing requirement" }],
  );
  writeValidChangeArtifacts(archiveRoadmapDir, changeName);
  writeDeltaSpecArtifact(archiveRoadmapDir, changeName, "cli.yaml", "cli-foundation", {
    ADDED: {},
    MODIFIED: {},
    REMOVED: {},
  });
  writeRoadmapMilestoneArtifact(archiveRoadmapDir, "0001-archive-roadmap.yaml", {
    id: "0001-archive-roadmap",
    title: "Archive Roadmap Sync",
    goal: "Mark the milestone complete when its final change is archived.",
    status: "active",
    plannedChanges: [],
  });
  mkdirSync(path.join(archiveRoadmapDir, ".strict-spec-driven", "roadmap", "planned-changes"), { recursive: true });
  writeFileSync(
    path.join(archiveRoadmapDir, ".strict-spec-driven", "roadmap", "planned-changes", "0001-archive-roadmap-archive-roadmap.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/planned-change/v1",
      schema_version: 1,
      artifact_type: "planned_change",
      schema_file: "../../templates/strict-spec-driven/schemas/planned-change.yaml",
      planned_change: {
        id: changeName,
        milestone: "0001-archive-roadmap",
      },
      status: "planned",
      summary: "Archive the linked change.",
      details: "Test details for archive-roadmap.",
      depends_on: [],
    }),
    "utf8",
  );
  writeRoadmapIndexArtifact(archiveRoadmapDir, [
    {
      id: "0001-archive-roadmap",
      title: "Archive Roadmap Sync",
      path: "roadmap/milestones/0001-archive-roadmap.yaml",
      status: "active",
    },
  ]);

  const archiveRoadmapResult = cli(["archive", changeName], { cwd: archiveRoadmapDir });
  context.assert(archiveRoadmapResult.status === 0, "archive exits zero when linked roadmap milestone is reconciled");
  const archiveRoadmapJson = JSON.parse(archiveRoadmapResult.stdout.trim());
  context.assert(
    archiveRoadmapJson.roadmapSync?.valid === true,
    "archive reports successful roadmap sync when roadmap artifacts are present",
  );
  context.assert(
    archiveRoadmapJson.roadmapSync.updatedFiles.includes(".strict-spec-driven/roadmap/INDEX.yaml")
      && archiveRoadmapJson.roadmapSync.updatedFiles.includes(".strict-spec-driven/roadmap/milestones/0001-archive-roadmap.yaml")
      && archiveRoadmapJson.roadmapSync.updatedFiles.includes(".strict-spec-driven/roadmap/planned-changes/0001-archive-roadmap-archive-roadmap.yaml"),
    "archive reports the roadmap files updated during archive-triggered roadmap sync",
    `updatedFiles: ${JSON.stringify(archiveRoadmapJson.roadmapSync?.updatedFiles)}`,
  );

  const syncedMilestone = yamlModule.parseYamlFile<{
    status: string;
  }>(path.join(archiveRoadmapDir, ".strict-spec-driven", "roadmap", "milestones", "0001-archive-roadmap.yaml"));
  context.assert(syncedMilestone.status === "complete", "archive marks the linked roadmap milestone complete once all planned changes are archived");
  const syncedPlannedChange = yamlModule.parseYamlFile<{
    status: string;
  }>(path.join(archiveRoadmapDir, ".strict-spec-driven", "roadmap", "planned-changes", "0001-archive-roadmap-archive-roadmap.yaml"));
  context.assert(
    syncedPlannedChange.status === "complete",
    "archive marks the linked roadmap planned change complete after archive",
  );

  const syncedIndex = yamlModule.parseYamlFile<{
    milestones: Record<string, { status: string }>;
  }>(path.join(archiveRoadmapDir, ".strict-spec-driven", "roadmap", "INDEX.yaml"));
  context.assert(
    syncedIndex.milestones["0001-archive-roadmap"]?.status === "complete",
    "archive rewrites the roadmap index milestone status after syncing roadmap state",
  );
} finally {
  rmSync(archiveRoadmapDir, { recursive: true, force: true });
}

// 13t: delta-tech archive merge (modify existing standard + create new standard)
function writeMainTechArtifact(
  rootDir: string,
  relativePath: string,
  standardId: string,
  title: string,
  category: string,
  rules: Array<{ id: string; strength: string; statement: string }>,
  mapping: { implementation: string[]; enforcement: string[] } = { implementation: [], enforcement: [] },
): void {
  const techPath = path.join(rootDir, ".strict-spec-driven", "tech", relativePath);
  mkdirSync(path.dirname(techPath), { recursive: true });
  writeFileSync(
    techPath,
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/main-tech/v1",
      schema_version: 1,
      artifact_type: "main_tech",
      schema_file: "test",
      standard: { id: standardId, title, category },
      mapping: { implementation: [...mapping.implementation], enforcement: [...mapping.enforcement] },
      rules: Object.fromEntries(rules.map((rule) => [rule.id, {
        strength: rule.strength,
        statement: rule.statement,
        rationale: `Rationale for ${rule.id}`,
        enforcement: { method: "review" },
      }])),
    }),
    "utf8",
  );
}

function writeDeltaTechArtifact(
  rootDir: string,
  changeName: string,
  fileName: string,
  targetStandard: string,
  options: {
    standard?: { title: string; category: string };
    mapping?: { implementation: string[]; enforcement: string[] };
    ADDED?: Record<string, { strength: string; statement: string }>;
    MODIFIED?: Record<string, { strength: string; statement: string }>;
    REMOVED?: Record<string, { reason: string }>;
  },
): void {
  const deltaPath = path.join(rootDir, ".strict-spec-driven", "changes", changeName, "tech", fileName);
  mkdirSync(path.dirname(deltaPath), { recursive: true });
  const toRule = (value: { strength: string; statement: string }, id: string) => ({
    strength: value.strength,
    statement: value.statement,
    rationale: `Rationale for ${id}`,
    enforcement: { method: "review" },
  });
  const artifact: Record<string, unknown> = {
    schema: "strict-spec-driven/delta-tech/v1",
    schema_version: 1,
    artifact_type: "delta_tech",
    schema_file: "test",
    target_standard: targetStandard,
    mapping: options.mapping ?? { implementation: [], enforcement: [] },
    operations: {
      ADDED: Object.fromEntries(Object.entries(options.ADDED ?? {}).map(([id, value]) => [id, toRule(value, id)])),
      MODIFIED: Object.fromEntries(Object.entries(options.MODIFIED ?? {}).map(([id, value]) => [id, toRule(value, id)])),
      REMOVED: options.REMOVED ?? {},
    },
  };
  if (options.standard) {
    artifact.standard = options.standard;
  }
  writeFileSync(deltaPath, yamlModule.stringifyYamlDocument(artifact), "utf8");
}

const archiveTechModifyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-tech-modify-"));
try {
  const changeName = "archive-tech-modify";
  writeMainTechArtifact(
    archiveTechModifyDir,
    "coding-baseline.yaml",
    "coding-baseline",
    "Coding Baseline",
    "coding",
    [
      { id: "rule-base", strength: "MUST", statement: "Base rule" },
      { id: "rule-remove", strength: "SHOULD", statement: "Removable rule" },
    ],
    { implementation: ["src/existing.ts"], enforcement: ["eslint.config.js"] },
  );
  writeValidChangeArtifacts(archiveTechModifyDir, changeName);
  writeDeltaTechArtifact(archiveTechModifyDir, changeName, "coding.yaml", "coding-baseline", {
    mapping: { implementation: ["src/added.ts"], enforcement: [] },
    ADDED: { "rule-added": { strength: "MUST", statement: "Added rule" } },
    MODIFIED: { "rule-base": { strength: "MUST", statement: "Updated base rule" } },
    REMOVED: { "rule-remove": { reason: "No longer needed" } },
  });

  const archiveResult = cli(["archive", changeName], { cwd: archiveTechModifyDir });
  context.assert(archiveResult.status === 0, "archive exits zero for a change with delta tech", `got ${archiveResult.status}: ${archiveResult.stderr}`);
  const archiveJson = JSON.parse(archiveResult.stdout.trim());
  context.assert(archiveJson.techMergeSummary.standardsUpdated === 1, "tech merge summary reports one updated standard");
  context.assert(archiveJson.techMergeSummary.standardsCreated === 0, "tech merge summary reports zero created standards");
  context.assert(archiveJson.techMergeSummary.added === 1, "tech merge summary reports ADDED rule count");
  context.assert(archiveJson.techMergeSummary.modified === 1, "tech merge summary reports MODIFIED rule count");
  context.assert(archiveJson.techMergeSummary.removed === 1, "tech merge summary reports REMOVED rule count");

  const mergedTech = yamlModule.parseYamlDocument<{
    rules: Record<string, { statement: string }>;
    mapping: { implementation: string[]; enforcement: string[] };
  }>(
    readFileSync(path.join(archiveTechModifyDir, ".strict-spec-driven", "tech", "coding-baseline.yaml"), "utf8"),
  );
  context.assert(mergedTech.rules["rule-added"] !== undefined, "delta tech ADDED rule merges into standard");
  context.assert(mergedTech.rules["rule-base"]?.statement === "Updated base rule", "delta tech MODIFIED rule replaces standard rule");
  context.assert(mergedTech.rules["rule-remove"] === undefined, "delta tech REMOVED rule deletes standard rule");
  context.assert(
    mergedTech.mapping.implementation.includes("src/existing.ts")
      && mergedTech.mapping.implementation.includes("src/added.ts"),
    "delta tech mapping merge unions new paths into the existing standard mapping without wiping it",
  );
  context.assert(
    mergedTech.mapping.enforcement.includes("eslint.config.js"),
    "delta tech mapping merge preserves existing enforcement paths the delta did not touch",
  );

  const techIndex = yamlModule.parseYamlDocument<{ standards: Array<{ id: string }> }>(
    readFileSync(path.join(archiveTechModifyDir, ".strict-spec-driven", "tech", "INDEX.yaml"), "utf8"),
  );
  context.assert(
    techIndex.standards.some((standard) => standard.id === "coding-baseline"),
    "archive regenerates tech index from merged standard state",
  );
} finally {
  rmSync(archiveTechModifyDir, { recursive: true, force: true });
}

const archiveTechCreateDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-tech-create-"));
try {
  const changeName = "archive-tech-create";
  writeValidChangeArtifacts(archiveTechCreateDir, changeName);
  writeDeltaTechArtifact(archiveTechCreateDir, changeName, "new.yaml", "new-standard", {
    standard: { title: "New Standard", category: "architecture" },
    mapping: { implementation: [], enforcement: [] },
    ADDED: { "rule-one": { strength: "MUST", statement: "First rule of new standard" } },
  });

  const archiveResult = cli(["archive", changeName], { cwd: archiveTechCreateDir });
  context.assert(archiveResult.status === 0, "archive exits zero when creating a standard via delta tech", `got ${archiveResult.status}: ${archiveResult.stderr}`);
  const archiveJson = JSON.parse(archiveResult.stdout.trim());
  context.assert(archiveJson.techMergeSummary.standardsCreated === 1, "tech merge summary reports one created standard");
  context.assert(archiveJson.techMergeSummary.added === 1, "tech merge summary reports created standard rule count");

  const createdPath = path.join(archiveTechCreateDir, ".strict-spec-driven", "tech", "new-standard.yaml");
  context.assert(existsSync(createdPath), "archive creates a new main tech file from delta tech");
  const createdTech = yamlModule.parseYamlDocument<{ artifact_type: string; standard: { id: string; category: string }; rules: Record<string, unknown> }>(
    readFileSync(createdPath, "utf8"),
  );
  context.assert(createdTech.artifact_type === "main_tech", "created standard has main_tech artifact_type");
  context.assert(createdTech.standard.id === "new-standard", "created standard id comes from target_standard");
  context.assert(createdTech.standard.category === "architecture", "created standard category comes from delta standard block");
  context.assert(createdTech.rules["rule-one"] !== undefined, "created standard includes delta ADDED rules");
} finally {
  rmSync(archiveTechCreateDir, { recursive: true, force: true });
}

// 13u: verify rejects new-standard delta missing standard block
const verifyTechNewDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-tech-new-"));
try {
  const changeName = "verify-tech-new";
  writeValidChangeArtifacts(verifyTechNewDir, changeName);
  writeDeltaTechArtifact(verifyTechNewDir, changeName, "new.yaml", "missing-standard", {
    mapping: { implementation: [], enforcement: [] },
    ADDED: { "rule-one": { strength: "MUST", statement: "Rule without standard block" } },
  });

  const result = verifyModule.verifyChange(verifyTechNewDir, changeName);
  context.assert(!result.valid, "verify rejects a new-standard delta tech without standard metadata");
  context.assert(
    result.diagnostics.some((d) => d.source === "new_standard_metadata"),
    "verify reports new_standard_metadata diagnostic for missing standard block",
  );
} finally {
  rmSync(verifyTechNewDir, { recursive: true, force: true });
}

// 13v: verify rejects ADDED rule colliding with an existing standard rule
const verifyTechCollisionDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-tech-collision-"));
try {
  const changeName = "verify-tech-collision";
  writeMainTechArtifact(
    verifyTechCollisionDir,
    "coding-baseline.yaml",
    "coding-baseline",
    "Coding Baseline",
    "coding",
    [{ id: "rule-exists", strength: "MUST", statement: "Existing rule" }],
  );
  writeValidChangeArtifacts(verifyTechCollisionDir, changeName);
  writeDeltaTechArtifact(verifyTechCollisionDir, changeName, "coding.yaml", "coding-baseline", {
    mapping: { implementation: [], enforcement: [] },
    ADDED: { "rule-exists": { strength: "MUST", statement: "Colliding rule" } },
  });

  const result = verifyModule.verifyChange(verifyTechCollisionDir, changeName);
  context.assert(!result.valid, "verify rejects a delta tech ADDED rule that already exists");
  context.assert(
    result.diagnostics.some((d) => d.source === "added_rule_collision"),
    "verify reports added_rule_collision diagnostic",
  );
} finally {
  rmSync(verifyTechCollisionDir, { recursive: true, force: true });
}

// 13w: archive creates a new main spec from a delta spec block
const archiveNewSpecDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-new-spec-"));
try {
  const changeName = "archive-new-spec";
  mkdirSync(path.join(archiveNewSpecDir, ".strict-spec-driven", "specs"), { recursive: true });
  writeFileSync(
    path.join(archiveNewSpecDir, ".strict-spec-driven", "specs", "INDEX.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/spec-index/v1",
      schema_version: 1,
      artifact_type: "spec_index",
      schema_file: "test",
      specs: [],
    }),
    "utf8",
  );
  writeValidChangeArtifacts(archiveNewSpecDir, changeName);
  writeNewSpecDeltaArtifact(
    archiveNewSpecDir,
    changeName,
    "new.yaml",
    "brand-new-spec",
    { title: "Brand New Spec", path: ".strict-spec-driven/specs/new/brand-new-spec.yaml" },
    {
      ADDED: {
        "req-one": { strength: "MUST", statement: "First requirement of new spec", scenarios: {} },
      },
    },
  );

  const archiveResult = cli(["archive", changeName], { cwd: archiveNewSpecDir });
  context.assert(archiveResult.status === 0, "archive exits zero when creating a main spec via delta spec block", `got ${archiveResult.status}: ${archiveResult.stderr}`);
  const archiveJson = JSON.parse(archiveResult.stdout.trim());
  context.assert(archiveJson.mergeSummary.specsCreated === 1, "archive merge summary reports one created spec");
  context.assert(archiveJson.mergeSummary.added === 1, "archive merge summary reports created spec ADDED count");

  const createdPath = path.join(archiveNewSpecDir, ".strict-spec-driven", "specs", "new", "brand-new-spec.yaml");
  context.assert(existsSync(createdPath), "archive creates a new main spec file from delta spec block");
  const createdSpec = yamlModule.parseYamlDocument<{ artifact_type: string; spec: { id: string; title: string }; requirements: Record<string, unknown> }>(
    readFileSync(createdPath, "utf8"),
  );
  context.assert(createdSpec.artifact_type === "main_spec", "created spec has main_spec artifact_type");
  context.assert(createdSpec.spec.id === "brand-new-spec", "created spec id comes from target_spec");
  context.assert(createdSpec.spec.title === "Brand New Spec", "created spec title comes from delta spec block");
  context.assert(createdSpec.requirements["req-one"] !== undefined, "created spec includes delta ADDED requirements");

  const regeneratedIndex = yamlModule.parseYamlDocument<{ specs: Array<{ id: string }> }>(
    readFileSync(path.join(archiveNewSpecDir, ".strict-spec-driven", "specs", "INDEX.yaml"), "utf8"),
  );
  context.assert(
    regeneratedIndex.specs.some((entry) => entry.id === "brand-new-spec"),
    "archive regenerates specs index including the created spec",
  );
} finally {
  rmSync(archiveNewSpecDir, { recursive: true, force: true });
}

// 13x: missing target without a spec block still fails archive with the existing error
const archiveMissingNoBlockDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-missing-no-block-"));
try {
  const changeName = "archive-missing-no-block";
  mkdirSync(path.join(archiveMissingNoBlockDir, ".strict-spec-driven", "specs"), { recursive: true });
  writeFileSync(
    path.join(archiveMissingNoBlockDir, ".strict-spec-driven", "specs", "INDEX.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/spec-index/v1",
      schema_version: 1,
      artifact_type: "spec_index",
      schema_file: "test",
      specs: [],
    }),
    "utf8",
  );
  writeValidChangeArtifacts(archiveMissingNoBlockDir, changeName);
  writeNewSpecDeltaArtifact(
    archiveMissingNoBlockDir,
    changeName,
    "missing.yaml",
    "absent-spec",
    undefined,
    {
      ADDED: {
        "req-one": { strength: "MUST", statement: "Requirement targeting a missing spec", scenarios: {} },
      },
    },
  );

  const result = cli(["archive", changeName], { cwd: archiveMissingNoBlockDir });
  context.assert(result.status !== 0, "archive exits non-zero when target spec is missing and no spec block is present");
  context.assert(
    result.stderr.includes("unresolvable_delta_target") &&
      result.stderr.includes("absent-spec") &&
      result.stderr.includes(".strict-spec-driven/specs/INDEX.yaml"),
    "archive missing-target failure carries the concrete unresolvable-target remediation",
    `stderr: ${result.stderr.trim()}`,
  );
} finally {
  rmSync(archiveMissingNoBlockDir, { recursive: true, force: true });
}

// 13y: verify rejects invalid new-spec deltas (operations, collision, empty ADDED)
const verifyNewSpecDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-new-spec-"));
try {
  writeMainSpecArtifact(
    verifyNewSpecDir,
    "cli/foundation.yaml",
    "cli-foundation",
    "CLI Foundation",
    [{ id: "req-base", statement: "Base requirement" }],
  );

  // non-empty MODIFIED on a new-spec delta
  const modChange = "verify-new-spec-mod";
  writeValidChangeArtifacts(verifyNewSpecDir, modChange);
  writeNewSpecDeltaArtifact(
    verifyNewSpecDir,
    modChange,
    "new.yaml",
    "fresh-spec",
    { title: "Fresh Spec", path: ".strict-spec-driven/specs/fresh/fresh-spec.yaml" },
    {
      ADDED: { "req-one": { strength: "MUST", statement: "Added requirement", scenarios: {} } },
      MODIFIED: { "req-x": { strength: "MUST", statement: "Should not be here", scenarios: {} } },
    },
  );
  const modResult = verifyModule.verifyChange(verifyNewSpecDir, modChange);
  context.assert(!modResult.valid, "verify rejects a new-spec delta with non-empty MODIFIED");
  context.assert(
    modResult.diagnostics.some((d) => d.source === "new_spec_operations" && d.message.includes("MODIFIED and REMOVED")),
    "verify reports new_spec_operations for non-empty MODIFIED on a new-spec delta",
  );

  // id collision with an existing main spec
  const collideChange = "verify-new-spec-collide";
  writeValidChangeArtifacts(verifyNewSpecDir, collideChange);
  writeNewSpecDeltaArtifact(
    verifyNewSpecDir,
    collideChange,
    "new.yaml",
    "cli-foundation",
    { title: "Duplicate", path: ".strict-spec-driven/specs/dup/cli-foundation.yaml" },
    { ADDED: { "req-one": { strength: "MUST", statement: "Added requirement", scenarios: {} } } },
  );
  const collideResult = verifyModule.verifyChange(verifyNewSpecDir, collideChange);
  context.assert(!collideResult.valid, "verify rejects a new-spec delta whose id collides with an existing main spec");
  context.assert(
    collideResult.diagnostics.some((d) => d.source === "new_spec_collision"),
    "verify reports new_spec_collision for an id that already exists",
  );

  // empty ADDED on a new-spec delta
  const emptyChange = "verify-new-spec-empty";
  writeValidChangeArtifacts(verifyNewSpecDir, emptyChange);
  writeNewSpecDeltaArtifact(
    verifyNewSpecDir,
    emptyChange,
    "new.yaml",
    "empty-spec",
    { title: "Empty Spec", path: ".strict-spec-driven/specs/empty/empty-spec.yaml" },
    {},
  );
  const emptyResult = verifyModule.verifyChange(verifyNewSpecDir, emptyChange);
  context.assert(!emptyResult.valid, "verify rejects a new-spec delta with no ADDED requirements");
  context.assert(
    emptyResult.diagnostics.some((d) => d.source === "new_spec_operations" && d.message.includes("at least one ADDED")),
    "verify reports new_spec_operations for an empty-ADDED new-spec delta",
  );

  // invalid target path (INDEX.yaml) on a new-spec delta
  const pathChange = "verify-new-spec-path";
  writeValidChangeArtifacts(verifyNewSpecDir, pathChange);
  writeNewSpecDeltaArtifact(
    verifyNewSpecDir,
    pathChange,
    "new.yaml",
    "indexish-spec",
    { title: "Indexish", path: ".strict-spec-driven/specs/INDEX.yaml" },
    { ADDED: { "req-one": { strength: "MUST", statement: "Added requirement", scenarios: {} } } },
  );
  const pathResult = verifyModule.verifyChange(verifyNewSpecDir, pathChange);
  context.assert(!pathResult.valid, "verify rejects a new-spec delta whose path is INDEX.yaml");
  context.assert(
    pathResult.diagnostics.some((d) => d.source === "new_spec_path"),
    "verify reports new_spec_path for an invalid target path",
  );
} finally {
  rmSync(verifyNewSpecDir, { recursive: true, force: true });
}

context.section("[14] list/modify/cancel commands");

function writeArchivedChangeArtifacts(rootDir: string, archiveDirName: string): string {
  const archiveDir = path.join(rootDir, ".strict-spec-driven", "changes", "archive", archiveDirName);
  const archivedChangeName = archiveDirName.replace(/^\d{4}-\d{2}-\d{2}-/, "");

  mkdirSync(path.join(archiveDir, "specs", "cli"), { recursive: true });

  writeFileSync(
    path.join(archiveDir, "proposal.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/change-proposal/v1",
      schema_version: 1,
      artifact_type: "change_proposal",
      schema_file: "test",
      change: {
        id: archivedChangeName,
        status: "proposed",
      },
      summary: {
        what: ["Archived change"],
        why: ["Test coverage"],
      },
      scope: {
        in: [],
        out: [],
      },
      unchanged_behavior: [],
    }),
    "utf8",
  );

  writeFileSync(
    path.join(archiveDir, "design.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/change-design/v1",
      schema_version: 1,
      artifact_type: "change_design",
      schema_file: "test",
      change: archivedChangeName,
      approach: ["Archived design"],
      decisions: {},
      alternatives: [],
    }),
    "utf8",
  );

  writeFileSync(
    path.join(archiveDir, "tasks.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/task-list/v2",
      schema_version: 2,
      artifact_type: "task_list",
      schema_file: "test",
      change: archivedChangeName,
      sections: {
        Implementation: {
          "impl-1": {
            text: "Archived implementation",
            status: "complete",
          },
        },
      },
    }),
    "utf8",
  );

  writeFileSync(
    path.join(archiveDir, "questions.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/question-list/v1",
      schema_version: 1,
      artifact_type: "question_list",
      schema_file: "test",
      change: archivedChangeName,
      open: [],
      resolved: [],
    }),
    "utf8",
  );

  writeFileSync(
    path.join(archiveDir, "specs", "cli", "foundation.yaml"),
    yamlModule.stringifyYamlDocument({
      schema: "strict-spec-driven/delta-spec/v1",
      schema_version: 1,
      artifact_type: "delta_spec",
      schema_file: "test",
      target_spec: "cli-foundation",
      mapping: {
        implementation: [],
        tests: [],
      },
      operations: {
        ADDED: {},
        MODIFIED: {},
        REMOVED: {},
      },
    }),
    "utf8",
  );

  return archiveDir;
}

// 14a: list reports active statuses and archived directories
const listHappyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-list-happy-"));
try {
  writeValidChangeArtifacts(listHappyDir, "active-progress", { implementationStatus: "pending" });
  writeValidChangeArtifacts(listHappyDir, "active-blocked", { openQuestion: true });
  const archivedAlpha = `${formatLocalDateStamp()}-archived-alpha`;
  const archivedBeta = `${formatLocalDateStamp()}-archived-beta`;
  writeArchivedChangeArtifacts(listHappyDir, archivedAlpha);
  writeArchivedChangeArtifacts(listHappyDir, archivedBeta);

  const listResult = cli(["list"], { cwd: listHappyDir });
  context.assert(listResult.status === 0, "list exits zero when active/archived changes exist", `got ${listResult.status}`);
  context.assert(listResult.stdout.includes("Active:"), "list output includes Active section");
  context.assert(
    listResult.stdout.includes("active-progress    in-progress (3/4)"),
    "list output includes active change status derived from tasks",
    `stdout: ${listResult.stdout.trim()}`,
  );
  context.assert(
    listResult.stdout.includes("active-blocked    blocked"),
    "list output includes blocked status derived from open questions",
    `stdout: ${listResult.stdout.trim()}`,
  );
  context.assert(listResult.stdout.includes("Archived:"), "list output includes Archived section");
  context.assert(
    listResult.stdout.includes(archivedAlpha) && listResult.stdout.includes(archivedBeta),
    "list output includes archived directory names",
    `stdout: ${listResult.stdout.trim()}`,
  );
} finally {
  rmSync(listHappyDir, { recursive: true, force: true });
}

// 14b: list handles empty strict changes state
const listEmptyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-list-empty-"));
try {
  mkdirSync(path.join(listEmptyDir, ".strict-spec-driven", "changes"), { recursive: true });
  const listEmptyResult = cli(["list"], { cwd: listEmptyDir });
  context.assert(listEmptyResult.status === 0, "list exits zero when no changes exist", `got ${listEmptyResult.status}`);
  context.assert(
    listEmptyResult.stdout.includes("No changes."),
    "list empty state reports no changes",
    `stdout: ${listEmptyResult.stdout.trim()}`,
  );
} finally {
  rmSync(listEmptyDir, { recursive: true, force: true });
}

// 14c: modify with no argument lists active changes with status summaries
const modifyListDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-modify-list-"));
try {
  writeValidChangeArtifacts(modifyListDir, "modify-active", { implementationStatus: "pending" });
  const modifyListResult = cli(["modify"], { cwd: modifyListDir });
  context.assert(modifyListResult.status === 0, "modify without target exits zero", `got ${modifyListResult.status}`);
  context.assert(
    modifyListResult.stdout.includes("Active changes:"),
    "modify without target prints Active changes heading",
    `stdout: ${modifyListResult.stdout.trim()}`,
  );
  context.assert(
    modifyListResult.stdout.includes("modify-active    in-progress (3/4)"),
    "modify without target includes active change status",
    `stdout: ${modifyListResult.stdout.trim()}`,
  );
} finally {
  rmSync(modifyListDir, { recursive: true, force: true });
}

// 14d: modify reports strict artifact paths for active targets
const modifyActiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-modify-active-"));
try {
  const changeName = "modify-artifacts";
  writeValidChangeArtifacts(modifyActiveDir, changeName);
  writeDeltaSpecArtifact(modifyActiveDir, changeName, "cli/list-modify.yaml", "cli-foundation", {
    ADDED: {},
    MODIFIED: {},
    REMOVED: {},
  });

  const modifyActiveResult = cli(["modify", changeName], { cwd: modifyActiveDir });
  context.assert(modifyActiveResult.status === 0, "modify active target exits zero", `got ${modifyActiveResult.status}`);
  context.assert(
    modifyActiveResult.stdout.includes(`.strict-spec-driven/changes/${changeName}/proposal.yaml`),
    "modify active target reports proposal artifact path",
    `stdout: ${modifyActiveResult.stdout.trim()}`,
  );
  context.assert(
    modifyActiveResult.stdout.includes(`.strict-spec-driven/changes/${changeName}/design.yaml`) &&
      modifyActiveResult.stdout.includes(`.strict-spec-driven/changes/${changeName}/tasks.yaml`) &&
      modifyActiveResult.stdout.includes(`.strict-spec-driven/changes/${changeName}/questions.yaml`),
    "modify active target reports planning artifact paths",
    `stdout: ${modifyActiveResult.stdout.trim()}`,
  );
  context.assert(
    modifyActiveResult.stdout.includes(`.strict-spec-driven/changes/${changeName}/specs/cli/list-modify.yaml`),
    "modify active target reports delta spec paths",
    `stdout: ${modifyActiveResult.stdout.trim()}`,
  );
} finally {
  rmSync(modifyActiveDir, { recursive: true, force: true });
}

// 14e: modify supports archived targets by exact archive directory name
const modifyArchiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-modify-archive-"));
try {
  const archiveDirName = `${formatLocalDateStamp()}-modify-target`;
  writeArchivedChangeArtifacts(modifyArchiveDir, archiveDirName);

  const modifyArchivedResult = cli(["modify", archiveDirName], { cwd: modifyArchiveDir });
  context.assert(modifyArchivedResult.status === 0, "modify archived target exits zero for exact archive directory name");
  context.assert(
    modifyArchivedResult.stdout.includes(`.strict-spec-driven/changes/archive/${archiveDirName}/proposal.yaml`),
    "modify archived target reports archived planning artifact paths",
    `stdout: ${modifyArchivedResult.stdout.trim()}`,
  );
  context.assert(
    modifyArchivedResult.stdout.includes(`.strict-spec-driven/changes/archive/${archiveDirName}/specs/cli/foundation.yaml`),
    "modify archived target reports archived delta spec paths",
    `stdout: ${modifyArchivedResult.stdout.trim()}`,
  );
} finally {
  rmSync(modifyArchiveDir, { recursive: true, force: true });
}

// 14f: modify rejects bare archived target names
const modifyAmbiguousDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-modify-ambiguous-"));
try {
  const archiveDirName = `${formatLocalDateStamp()}-modify-target`;
  writeArchivedChangeArtifacts(modifyAmbiguousDir, archiveDirName);

  const modifyAmbiguousResult = cli(["modify", "modify-target"], { cwd: modifyAmbiguousDir });
  context.assert(modifyAmbiguousResult.status !== 0, "modify rejects archived bare-name target", `got ${modifyAmbiguousResult.status}`);
  context.assert(
    modifyAmbiguousResult.stderr.includes("exact archive directory names"),
    "modify archived bare-name rejection explains exact archive target requirement",
    `stderr: ${modifyAmbiguousResult.stderr.trim()}`,
  );
} finally {
  rmSync(modifyAmbiguousDir, { recursive: true, force: true });
}

// 14g: modify rejects missing targets
const modifyMissingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-modify-missing-"));
try {
  mkdirSync(path.join(modifyMissingDir, ".strict-spec-driven", "changes"), { recursive: true });
  const modifyMissingResult = cli(["modify", "does-not-exist"], { cwd: modifyMissingDir });
  context.assert(modifyMissingResult.status !== 0, "modify missing target exits non-zero", `got ${modifyMissingResult.status}`);
  context.assert(
    modifyMissingResult.stderr.includes("not found"),
    "modify missing target reports not found",
    `stderr: ${modifyMissingResult.stderr.trim()}`,
  );
} finally {
  rmSync(modifyMissingDir, { recursive: true, force: true });
}

// 14h: cancel removes active changes
const cancelActiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-cancel-active-"));
try {
  const changeName = "cancel-me";
  writeValidChangeArtifacts(cancelActiveDir, changeName);

  const cancelActiveResult = cli(["cancel", changeName], { cwd: cancelActiveDir });
  context.assert(cancelActiveResult.status === 0, "cancel active change exits zero", `got ${cancelActiveResult.status}`);
  context.assert(
    !existsSync(path.join(cancelActiveDir, ".strict-spec-driven", "changes", changeName)),
    "cancel active change removes active directory",
  );
  context.assert(
    cancelActiveResult.stdout.includes(`Cancelled: .strict-spec-driven/changes/${changeName}`),
    "cancel active change confirms cancellation path",
    `stdout: ${cancelActiveResult.stdout.trim()}`,
  );
} finally {
  rmSync(cancelActiveDir, { recursive: true, force: true });
}

// 14i: cancel rejects archived targets and preserves archive history
const cancelArchiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-cancel-archive-"));
try {
  const archiveDirName = `${formatLocalDateStamp()}-cancel-target`;
  const archivedPath = writeArchivedChangeArtifacts(cancelArchiveDir, archiveDirName);

  const cancelArchivedResult = cli(["cancel", archiveDirName], { cwd: cancelArchiveDir });
  context.assert(cancelArchivedResult.status !== 0, "cancel archived target exits non-zero", `got ${cancelArchivedResult.status}`);
  context.assert(
    existsSync(archivedPath),
    "cancel archived target preserves archived directory",
  );
  context.assert(
    cancelArchivedResult.stderr.includes("limited to active changes"),
    "cancel archived target rejection explains active-only boundary",
    `stderr: ${cancelArchivedResult.stderr.trim()}`,
  );
} finally {
  rmSync(cancelArchiveDir, { recursive: true, force: true });
}

// 14j: cancel rejects missing targets
const cancelMissingDir = mkdtempSync(path.join(os.tmpdir(), "strict-cancel-missing-"));
try {
  mkdirSync(path.join(cancelMissingDir, ".strict-spec-driven", "changes"), { recursive: true });
  const cancelMissingResult = cli(["cancel", "missing-change"], { cwd: cancelMissingDir });
  context.assert(cancelMissingResult.status !== 0, "cancel missing target exits non-zero", `got ${cancelMissingResult.status}`);
  context.assert(
    cancelMissingResult.stderr.includes("not found"),
    "cancel missing target reports not found",
    `stderr: ${cancelMissingResult.stderr.trim()}`,
  );
} finally {
  rmSync(cancelMissingDir, { recursive: true, force: true });
}

context.section("[15] verify-spec-mappings command");

// 15a: verify-spec-mappings succeeds with complete mapping coverage and no unmapped evidence
const verifyMappingsValidDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-mappings-valid-"));
try {
  mkdirSync(path.join(verifyMappingsValidDir, ".strict-spec-driven", "specs", "cli"), { recursive: true });
  mkdirSync(path.join(verifyMappingsValidDir, "src"), { recursive: true });
  mkdirSync(path.join(verifyMappingsValidDir, "test"), { recursive: true });
  writeFileSync(path.join(verifyMappingsValidDir, "src", "strict-spec-cli.ts"), "export {};\n", "utf8");
  writeFileSync(path.join(verifyMappingsValidDir, "test", "run.ts"), "export {};\n", "utf8");
  writeFileSync(path.join(verifyMappingsValidDir, "package.json"), "{\n  \"name\": \"tmp\"\n}\n", "utf8");
  writeFileSync(path.join(verifyMappingsValidDir, "tsconfig.json"), "{\n  \"compilerOptions\": {}\n}\n", "utf8");
  writeFileSync(
    path.join(verifyMappingsValidDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml"),
    [
      "mapping:",
      "  implementation:",
      "    - src/strict-spec-cli.ts",
      "    - package.json",
      "    - tsconfig.json",
      "  tests:",
      "    - test/run.ts",
    ].join("\n"),
    "utf8",
  );

  const validMappingsResult = cli(["verify-spec-mappings"], { cwd: verifyMappingsValidDir });
  context.assert(validMappingsResult.status === 0, "verify-spec-mappings exits zero when mapping coverage is complete");
  const validMappingsJson = JSON.parse(validMappingsResult.stdout.trim());
  context.assert(validMappingsJson.valid === true, "verify-spec-mappings valid output includes valid=true");
  context.assert(Array.isArray(validMappingsJson.diagnostics) && validMappingsJson.diagnostics.length === 0, "verify-spec-mappings emits no diagnostics when valid");
  context.assert(
    validMappingsJson.summary.unmappedImplementationCount === 0 && validMappingsJson.summary.unmappedTestCount === 0,
    "verify-spec-mappings summary reports zero unmapped evidence on success",
  );
} finally {
  rmSync(verifyMappingsValidDir, { recursive: true, force: true });
}

// 15b: verify-spec-mappings reports missing legacy specs inputs
const verifyMappingsMissingSpecsDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-mappings-missing-specs-"));
try {
  const missingSpecsResult = cli(["verify-spec-mappings"], { cwd: verifyMappingsMissingSpecsDir });
  context.assert(missingSpecsResult.status !== 0, "verify-spec-mappings exits non-zero when .strict-spec-driven/specs is missing");
  const missingSpecsJson = JSON.parse(missingSpecsResult.stdout.trim());
  context.assert(missingSpecsJson.valid === false, "verify-spec-mappings missing-input output includes valid=false");
  context.assert(
    missingSpecsJson.diagnostics.some(
      (diagnostic: ValidationDiagnostic) =>
        diagnostic.source === "mapping_input" &&
        diagnostic.message.includes(".strict-spec-driven/specs"),
    ),
    "verify-spec-mappings reports mapping_input diagnostic when specs directory is missing",
  );
} finally {
  rmSync(verifyMappingsMissingSpecsDir, { recursive: true, force: true });
}

// 15c: verify-spec-mappings reports mapping coverage gaps and unmapped evidence
const verifyMappingsInvalidDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-mappings-invalid-"));
try {
  mkdirSync(path.join(verifyMappingsInvalidDir, ".strict-spec-driven", "specs", "cli"), { recursive: true });
  mkdirSync(path.join(verifyMappingsInvalidDir, "src"), { recursive: true });
  mkdirSync(path.join(verifyMappingsInvalidDir, "test"), { recursive: true });
  writeFileSync(path.join(verifyMappingsInvalidDir, "src", "mapped.ts"), "export {};\n", "utf8");
  writeFileSync(path.join(verifyMappingsInvalidDir, "src", "unmapped.ts"), "export {};\n", "utf8");
  writeFileSync(path.join(verifyMappingsInvalidDir, "test", "run.ts"), "export {};\n", "utf8");
  writeFileSync(path.join(verifyMappingsInvalidDir, "package.json"), "{\n  \"name\": \"tmp\"\n}\n", "utf8");
  writeFileSync(path.join(verifyMappingsInvalidDir, "tsconfig.json"), "{\n  \"compilerOptions\": {}\n}\n", "utf8");
  writeFileSync(
    path.join(verifyMappingsInvalidDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml"),
    [
      "mapping:",
      "  implementation:",
      "    - src/mapped.ts",
      "  tests: []",
    ].join("\n"),
    "utf8",
  );

  const invalidMappingsResult = cli(["verify-spec-mappings"], { cwd: verifyMappingsInvalidDir });
  context.assert(invalidMappingsResult.status !== 0, "verify-spec-mappings exits non-zero for coverage or unmapped diagnostics");
  const invalidMappingsJson = JSON.parse(invalidMappingsResult.stdout.trim());
  context.assert(invalidMappingsJson.valid === false, "verify-spec-mappings invalid output includes valid=false");
  context.assert(
    invalidMappingsJson.diagnostics.some(
      (diagnostic: ValidationDiagnostic) =>
        diagnostic.source === "mapping_coverage" &&
        diagnostic.fieldPath === "$.mapping.tests",
    ),
    "verify-spec-mappings reports mapping_coverage diagnostic for empty tests mapping",
  );
  context.assert(
    invalidMappingsJson.diagnostics.some(
      (diagnostic: ValidationDiagnostic) =>
        diagnostic.source === "unmapped_evidence" &&
        diagnostic.artifactPath === "src/unmapped.ts",
    ),
    "verify-spec-mappings reports unmapped implementation evidence diagnostics",
  );
} finally {
  rmSync(verifyMappingsInvalidDir, { recursive: true, force: true });
}

// 15d: verify-spec-mappings output is deterministic for the same repository state
const verifyMappingsDeterministicDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-mappings-deterministic-"));
try {
  mkdirSync(path.join(verifyMappingsDeterministicDir, ".strict-spec-driven", "specs", "contracts"), { recursive: true });
  mkdirSync(path.join(verifyMappingsDeterministicDir, "src"), { recursive: true });
  mkdirSync(path.join(verifyMappingsDeterministicDir, "test"), { recursive: true });
  writeFileSync(path.join(verifyMappingsDeterministicDir, "src", "validation.ts"), "export {};\n", "utf8");
  writeFileSync(path.join(verifyMappingsDeterministicDir, "test", "run.ts"), "export {};\n", "utf8");
  writeFileSync(path.join(verifyMappingsDeterministicDir, "package.json"), "{\n  \"name\": \"tmp\"\n}\n", "utf8");
  writeFileSync(path.join(verifyMappingsDeterministicDir, "tsconfig.json"), "{\n  \"compilerOptions\": {}\n}\n", "utf8");
  writeFileSync(
    path.join(verifyMappingsDeterministicDir, ".strict-spec-driven", "specs", "contracts", "yaml-artifacts.yaml"),
    [
      "mapping:",
      "  implementation:",
      "    - src/validation.ts",
      "    - package.json",
      "    - tsconfig.json",
      "  tests:",
      "    - test/run.ts",
    ].join("\n"),
    "utf8",
  );

  const first = cli(["verify-spec-mappings"], { cwd: verifyMappingsDeterministicDir });
  const second = cli(["verify-spec-mappings"], { cwd: verifyMappingsDeterministicDir });
  context.assert(first.status === second.status, "verify-spec-mappings deterministic run has stable exit status");
  context.assert(first.stdout.trim() === second.stdout.trim(), "verify-spec-mappings deterministic run has stable JSON output");
} finally {
  rmSync(verifyMappingsDeterministicDir, { recursive: true, force: true });
}

// 15e: verify-spec-mappings argument validation
const verifyMappingsArgValidationDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-mappings-arg-"));
try {
  const argValidation = cli(["verify-spec-mappings", "extra-arg"], { cwd: verifyMappingsArgValidationDir });
  context.assert(argValidation.status !== 0, "verify-spec-mappings rejects unexpected arguments");
  context.assert(argValidation.stderr.includes("Usage:"), "verify-spec-mappings prints usage on invalid arguments");
} finally {
  rmSync(verifyMappingsArgValidationDir, { recursive: true, force: true });
}

// 15f: copied project workspace exercises modify, cancel, and verify-spec-mappings
function runCopiedProjectLifecycleScenario(): {
  proposeStatus: number;
  proposeStdout: string;
  listStatus: number;
  listStdout: string;
  modifyStatus: number;
  modifyStdout: string;
  cancelStatus: number;
  cancelStdout: string;
  archiveLookupStatus: number;
  archiveLookupStdout: string;
  mappingsStatus: number;
  mappingsStdout: string;
} {
  const copiedProjectLifecycleWorkspace = createCopiedProjectWorkspace("todo-app");
  const { workspaceRoot } = copiedProjectLifecycleWorkspace;
  try {
    const changeName = "copied-workspace-lifecycle-change";
    const copiedProjectPropose = projectWorkspaceCli(workspaceRoot, ["propose", changeName]);
    const copiedProjectProposeStdout = copiedProjectPropose.stdout.trim();
    context.assert(
      copiedProjectPropose.status === 0,
      "copied project workspace propose creates an active strict change for lifecycle commands",
      `stdout: ${copiedProjectProposeStdout} stderr: ${copiedProjectPropose.stderr.trim()}`,
    );

    const copiedProjectList = projectWorkspaceCli(workspaceRoot, ["list"]);
    const copiedProjectListStdout = copiedProjectList.stdout.trim();
    context.assert(
      copiedProjectList.status === 0,
      "copied project workspace list exits zero after propose",
      `stdout: ${copiedProjectListStdout} stderr: ${copiedProjectList.stderr.trim()}`,
    );
    context.assert(
      copiedProjectListStdout.includes(changeName),
      "copied project workspace list reports the newly proposed change as an active entry",
      `stdout: ${copiedProjectListStdout}`,
    );

    const copiedProjectModify = projectWorkspaceCli(workspaceRoot, ["modify", changeName]);
    const copiedProjectModifyStdout = copiedProjectModify.stdout.trim();
    context.assert(
      copiedProjectModify.status === 0,
      "copied project workspace modify exits zero for a proposed strict change",
      `stdout: ${copiedProjectModifyStdout} stderr: ${copiedProjectModify.stderr.trim()}`,
    );
    context.assert(
      copiedProjectModifyStdout.includes(`.strict-spec-driven/changes/${changeName}/proposal.yaml`),
      "copied project workspace modify reports planning artifacts for the proposed change",
      `stdout: ${copiedProjectModifyStdout}`,
    );
    context.assert(
      copiedProjectModifyStdout.includes(`.strict-spec-driven/changes/${changeName}/specs/ (empty)`),
      "copied project workspace modify reports an empty delta-spec directory for the proposed change",
      `stdout: ${copiedProjectModifyStdout}`,
    );

    const copiedProjectCancel = projectWorkspaceCli(workspaceRoot, ["cancel", changeName]);
    const copiedProjectCancelStdout = copiedProjectCancel.stdout.trim();
    context.assert(
      copiedProjectCancel.status === 0,
      "copied project workspace cancel exits zero for the proposed strict change",
      `stdout: ${copiedProjectCancelStdout} stderr: ${copiedProjectCancel.stderr.trim()}`,
    );
    context.assert(
      !existsSync(path.join(workspaceRoot, ".strict-spec-driven", "changes", changeName)),
      "copied project workspace cancel removes the strict change directory from the temp workspace",
    );
    context.assert(
      existsSync(path.join(workspaceRoot, ".spec-driven", "changes", "add-due-dates", "proposal.md")),
      "copied project workspace cancel preserves the committed bootstrap change artifacts",
    );

    const archiveDirName = "2026-01-01-archived-fixture-change";
    const archiveDirPath = path.join(
      workspaceRoot,
      ".strict-spec-driven",
      "changes",
      "archive",
      archiveDirName,
    );
    mkdirSync(archiveDirPath, { recursive: true });
    writeFileSync(path.join(archiveDirPath, "proposal.yaml"), "schema: proposal\n", "utf8");

    const copiedProjectArchiveLookup = projectWorkspaceCli(workspaceRoot, ["modify", archiveDirName]);
    const copiedProjectArchiveLookupStdout = copiedProjectArchiveLookup.stdout.trim();
    context.assert(
      copiedProjectArchiveLookup.status === 0,
      "copied project workspace modify exits zero for an exact archive directory name",
      `stdout: ${copiedProjectArchiveLookupStdout} stderr: ${copiedProjectArchiveLookup.stderr.trim()}`,
    );
    context.assert(
      copiedProjectArchiveLookupStdout.includes(`.strict-spec-driven/changes/archive/${archiveDirName}/proposal.yaml`),
      "copied project workspace modify reports artifact paths for an archived change directory",
      `stdout: ${copiedProjectArchiveLookupStdout}`,
    );

    const copiedProjectMappings = projectWorkspaceCli(workspaceRoot, ["verify-spec-mappings"]);
    const copiedProjectMappingsStdout = copiedProjectMappings.stdout.trim();
    context.assert(
      copiedProjectMappings.status !== 0,
      "copied project workspace verify-spec-mappings surfaces unmapped fixture implementation evidence",
      `stdout: ${copiedProjectMappingsStdout} stderr: ${copiedProjectMappings.stderr.trim()}`,
    );
    const copiedProjectMappingsJson = JSON.parse(copiedProjectMappingsStdout) as {
      valid: boolean;
      diagnostics: ValidationDiagnostic[];
      summary: { unmappedImplementationCount: number; unmappedTestCount: number };
    };
    context.assert(copiedProjectMappingsJson.valid === false, "copied project workspace verify-spec-mappings reports valid=false");
    context.assert(
      copiedProjectMappingsJson.diagnostics.some(
        (diagnostic) => diagnostic.source === "mapping_input",
      ),
      "copied project workspace verify-spec-mappings reports mapping_input diagnostic when .strict-spec-driven/specs/ is absent",
    );
    context.assert(
      copiedProjectMappingsJson.summary.unmappedImplementationCount === 0
        && copiedProjectMappingsJson.summary.unmappedTestCount === 0,
      "copied project workspace verify-spec-mappings skips evidence collection when specs dir is absent",
    );
    context.assert(
      existsSync(path.join(projectFixturePath("todo-app"), ".spec-driven", "changes", "add-due-dates", "proposal.md")),
      "committed fixture baseline remains unchanged after copied project lifecycle commands",
    );

    return {
      proposeStatus: copiedProjectPropose.status,
      proposeStdout: copiedProjectProposeStdout,
      listStatus: copiedProjectList.status,
      listStdout: copiedProjectListStdout,
      modifyStatus: copiedProjectModify.status,
      modifyStdout: copiedProjectModifyStdout,
      cancelStatus: copiedProjectCancel.status,
      cancelStdout: copiedProjectCancelStdout,
      archiveLookupStatus: copiedProjectArchiveLookup.status,
      archiveLookupStdout: copiedProjectArchiveLookupStdout,
      mappingsStatus: copiedProjectMappings.status,
      mappingsStdout: copiedProjectMappingsStdout,
    };
  } finally {
    copiedProjectLifecycleWorkspace.cleanup();
    context.assert(
      !existsSync(workspaceRoot),
      "copied project lifecycle workspace cleanup removes the temp workspace",
    );
  }
}

const copiedProjectLifecycleFirstRun = runCopiedProjectLifecycleScenario();
const copiedProjectLifecycleSecondRun = runCopiedProjectLifecycleScenario();
context.assert(
  copiedProjectLifecycleFirstRun.proposeStatus === copiedProjectLifecycleSecondRun.proposeStatus
    && copiedProjectLifecycleFirstRun.proposeStdout === copiedProjectLifecycleSecondRun.proposeStdout,
  "copied project workspace propose output stays stable across repeated lifecycle flows",
);
context.assert(
  copiedProjectLifecycleFirstRun.listStatus === copiedProjectLifecycleSecondRun.listStatus
    && copiedProjectLifecycleFirstRun.listStdout === copiedProjectLifecycleSecondRun.listStdout,
  "copied project workspace list output stays stable across repeated lifecycle flows",
);
context.assert(
  copiedProjectLifecycleFirstRun.modifyStatus === copiedProjectLifecycleSecondRun.modifyStatus
    && copiedProjectLifecycleFirstRun.modifyStdout === copiedProjectLifecycleSecondRun.modifyStdout,
  "copied project workspace modify output stays stable across repeated lifecycle flows",
);
context.assert(
  copiedProjectLifecycleFirstRun.cancelStatus === copiedProjectLifecycleSecondRun.cancelStatus
    && copiedProjectLifecycleFirstRun.cancelStdout === copiedProjectLifecycleSecondRun.cancelStdout,
  "copied project workspace cancel output stays stable across repeated lifecycle flows",
);
context.assert(
  copiedProjectLifecycleFirstRun.archiveLookupStatus === copiedProjectLifecycleSecondRun.archiveLookupStatus
    && copiedProjectLifecycleFirstRun.archiveLookupStdout === copiedProjectLifecycleSecondRun.archiveLookupStdout,
  "copied project workspace archive lookup output stays stable across repeated lifecycle flows",
);
context.assert(
  copiedProjectLifecycleFirstRun.mappingsStatus === copiedProjectLifecycleSecondRun.mappingsStatus
    && copiedProjectLifecycleFirstRun.mappingsStdout === copiedProjectLifecycleSecondRun.mappingsStdout,
  "copied project workspace verify-spec-mappings output stays stable across repeated lifecycle flows",
);

context.section("[16] removed review command");

const removedReviewResult = cli(["review", "missing-change"]);
context.assert(
  removedReviewResult.status !== 0,
  "review CLI command is not registered",
  `stdout: ${removedReviewResult.stdout.trim()} stderr: ${removedReviewResult.stderr.trim()}`,
);
context.assert(
  removedReviewResult.stderr.includes("Usage: strict-spec-cli"),
  "removed review command reports top-level usage",
  `stderr: ${removedReviewResult.stderr.trim()}`,
);

}
