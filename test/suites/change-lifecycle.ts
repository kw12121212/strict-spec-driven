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

const CANONICAL_REQUIREMENT_IDS = [
  "requirement-problem",
  "requirement-outcome",
  "requirement-trigger",
  "requirement-non-goals",
  "requirement-interpretation",
] as const;

/**
 * Renders the answered requirement interrogation for a hand-written questions fixture. ready blocks
 * until each canonical question carries a human or roadmap answer, so a fixture that expects a ready
 * change must supply them.
 */
function answeredRequirementQuestionLines(): string[] {
  return CANONICAL_REQUIREMENT_IDS.flatMap((questionId) => [
    `  - id: ${questionId}`,
    `    question: Fixture question for ${questionId}?`,
    `    context: Fixture context explaining why ${questionId} is asked and what answers it.`,
    "    kind: requirement",
    "    answered_by: human",
    `    answer: Fixture requester answer for ${questionId}.`,
    "    status: resolved",
  ]);
}

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
      "schema_file: templates/strict-spec-driven/schemas/task-list.yaml",
      "change: my-change",
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
      "testing_gates:",
      "  validation_task: test-a",
      "  unit_test_task: test-a",
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
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: templates/strict-spec-driven/schemas/task-list.yaml",
    "change: det-test",
    "sections:",
    "  Implementation:",
    "    build:",
    "      text: Build step",
    "      status: pending",
    "  Testing:",
    "    test:",
    "      text: Test step",
    "      status: pending",
    "      command: bun test/run.ts",
    "testing_gates:",
    "  validation_task: test",
    "  unit_test_task: test",
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
      parsed.sectionName === "Implementation" && parsed.taskId === "build" && !("taskText" in parsed),
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

  const missingDeltaDiagnostic = readyJson.diagnostics.find((diagnostic: { artifactPath: string; fieldPath: string }) =>
    diagnostic.artifactPath.endsWith(`/${changeName}/specs/`) && diagnostic.fieldPath === "$"
  ) as { message: string } | undefined;
  context.assert(
    missingDeltaDiagnostic !== undefined
      && missingDeltaDiagnostic.message.includes("(A)")
      && missingDeltaDiagnostic.message.includes(`strict-spec-cli generate ${changeName} delta-spec --target-spec <spec-id>`)
      && missingDeltaDiagnostic.message.includes(".strict-spec-driven/specs/INDEX.yaml"),
    "missing-delta-spec diagnostic states remedy A with a runnable delta-spec command and the source of valid target ids",
    missingDeltaDiagnostic?.message,
  );
  context.assert(
    missingDeltaDiagnostic !== undefined
      && missingDeltaDiagnostic.message.includes("(B)")
      && missingDeltaDiagnostic.message.includes(`strict-spec-cli generate ${changeName} design --decision no-delta-spec`),
    "missing-delta-spec diagnostic states remedy B with a runnable design command that records an empty-spec decision",
    missingDeltaDiagnostic?.message,
  );
  context.assert(
    readyJson.suggestions.some((suggestion: { command: string }) =>
      suggestion.command.startsWith(`strict-spec-cli generate ${changeName} delta-spec`))
      && readyJson.suggestions.some((suggestion: { command: string }) =>
        suggestion.command.startsWith(`strict-spec-cli generate ${changeName} design --decision`)),
    "ready suggests both the delta-spec and the empty-spec-decision remedy commands",
    JSON.stringify(readyJson.suggestions),
  );

  const workflowStateModule = await loadDistModule<{
    EMPTY_SPEC_DECISION_IDS: Set<string>;
    formatMissingDeltaSpecMessage(changeName: string): string;
  }>("workflow-state.js");
  const acceptedEmptySpecIds = [...workflowStateModule.EMPTY_SPEC_DECISION_IDS];
  context.assert(
    acceptedEmptySpecIds.length > 0
      && acceptedEmptySpecIds.every((acceptedId) => missingDeltaDiagnostic?.message.includes(acceptedId) === true),
    "missing-delta-spec diagnostic names every decision id the readiness check accepts",
    acceptedEmptySpecIds.join(", "),
  );
  // Proves the message is derived rather than restated: any id present in the message but absent
  // from the accepted set would be guidance pointing at a command whose result still fails ready.
  const advertisedEmptySpecIds = (/accepted as an explicit empty-spec decision are: ([^.]+)\./
    .exec(workflowStateModule.formatMissingDeltaSpecMessage(changeName))?.[1] ?? "")
    .split(", ")
    .filter((candidate) => candidate.length > 0);
  context.assert(
    advertisedEmptySpecIds.length === acceptedEmptySpecIds.length
      && advertisedEmptySpecIds.every((advertised) => workflowStateModule.EMPTY_SPEC_DECISION_IDS.has(advertised)),
    "missing-delta-spec diagnostic advertises exactly the accepted decision ids, never an id the check rejects",
    `advertised: ${advertisedEmptySpecIds.join(", ")}`,
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

  // The fixture above deliberately has a completed task; every write merges, so it survives.
  const scriptedTasksGenerate = cli([
    "generate", changeName, "tasks",
    "--implementation", "--task", "do-the-work", "--text", "Implement the scoped behavior.",
    "--testing", "--task", "run-tests", "--text", "Run the tests.", "--command", "bun test/run.ts",
    "--verification", "--task", "verify-scope", "--text", "Verify the change scope.",
    "--validation-task", "run-tests", "--unit-test-task", "run-tests",
  ], { cwd: workflowGuidanceDir });
  context.assert(scriptedTasksGenerate.status === 0, "generate tasks populates the task list from scripted generation", scriptedTasksGenerate.stderr.trim());
  const scriptedTasksJson = JSON.parse(scriptedTasksGenerate.stdout.trim());
  context.assert(
    scriptedTasksJson.valid === true && scriptedTasksJson.ready === true && scriptedTasksJson.diagnostics.length === 0,
    "generate tasks reports a complete scripted task list as valid and ready",
  );
  const scriptedTasks = yamlModule.parseYamlDocument<{
    sections: { Implementation: Record<string, unknown>; Testing: Record<string, unknown> };
    testing_gates: { validation_task: string };
  }>(readFileSync(path.join(changeDir, "tasks.yaml"), "utf8"));
  context.assert(
    "do-the-work" in scriptedTasks.sections.Implementation
      && "run-tests" in scriptedTasks.sections.Testing
      && scriptedTasks.testing_gates.validation_task === "run-tests",
    "scripted task generation writes the requested tasks and testing gates",
  );

  // Task order is the order apply walks, so placement is asserted through key order.
  type TaskEntry = { text: string; status: string; command?: string };
  type TaskSections = { Implementation: Record<string, TaskEntry>; Testing: Record<string, TaskEntry> };
  const readTaskSections = (): TaskSections =>
    yamlModule.parseYamlDocument<{ sections: TaskSections }>(
      readFileSync(path.join(changeDir, "tasks.yaml"), "utf8"),
    ).sections;
  const implementationOrder = (): string[] => Object.keys(readTaskSections().Implementation);

  const beforeAppend = implementationOrder();
  const positionedInsert = cli([
    "generate", changeName, "tasks",
    "--implementation", "--task", "discovered-prerequisite",
    "--text", "Work discovered mid-change that must run first.",
    "--before", "impl-1",
  ], { cwd: workflowGuidanceDir });
  context.assert(positionedInsert.status === 0, "generate tasks accepts --before for a new task", positionedInsert.stderr.trim());
  const insertedOrder = implementationOrder();
  context.assert(
    insertedOrder.indexOf("discovered-prerequisite") === insertedOrder.indexOf("impl-1") - 1,
    "--before inserts a new task immediately ahead of its anchor instead of appending it",
    insertedOrder.join(","),
  );
  context.assert(
    insertedOrder.length === beforeAppend.length + 1
      && beforeAppend.every((id) => insertedOrder.includes(id)),
    "positioned insertion adds exactly one task and drops none",
    insertedOrder.join(","),
  );

  const applyAfterInsert = cli(["apply", changeName], { cwd: workflowGuidanceDir });
  context.assert(
    applyAfterInsert.status === 0 && JSON.parse(applyAfterInsert.stdout.trim()).taskId === "discovered-prerequisite",
    "apply completes the newly positioned task first because it now leads the section",
    applyAfterInsert.stdout.trim(),
  );

  // The task completed just above carries status complete, so moving it proves state survives a move.
  const movedTask = cli([
    "generate", changeName, "tasks",
    "--implementation", "--task", "discovered-prerequisite", "--after", "do-the-work",
  ], { cwd: workflowGuidanceDir });
  context.assert(movedTask.status === 0, "generate tasks moves an existing task with --after", movedTask.stderr.trim());
  const movedSections = readTaskSections();
  const movedOrder = Object.keys(movedSections.Implementation);
  context.assert(
    movedOrder.indexOf("discovered-prerequisite") === movedOrder.indexOf("do-the-work") + 1,
    "--after relocates an existing task immediately behind its anchor",
    movedOrder.join(","),
  );
  context.assert(
    movedSections.Implementation["discovered-prerequisite"]?.status === "complete"
      && movedSections.Implementation["discovered-prerequisite"]?.text === "Work discovered mid-change that must run first.",
    "moving a recorded task preserves its status and unsupplied text",
    JSON.stringify(movedSections.Implementation["discovered-prerequisite"]),
  );
  context.assert(
    movedSections.Testing["run-tests"]?.command === "bun test/run.ts",
    "moving a task in one section leaves other sections' commands untouched",
  );

  // Status never constrains placement: pending impl-1 moves ahead of the completed task.
  const aheadOfCompleted = cli([
    "generate", changeName, "tasks",
    "--implementation", "--task", "impl-1", "--before", "discovered-prerequisite",
  ], { cwd: workflowGuidanceDir });
  const aheadSections = readTaskSections();
  const aheadOrder = Object.keys(aheadSections.Implementation);
  context.assert(
    aheadOfCompleted.status === 0
      && JSON.parse(aheadOfCompleted.stdout.trim()).diagnostics.length === 0
      && aheadOrder.indexOf("impl-1") === aheadOrder.indexOf("discovered-prerequisite") - 1
      && aheadSections.Implementation["impl-1"]?.status === "pending"
      && aheadSections.Implementation["discovered-prerequisite"]?.status === "complete",
    "task status does not constrain placement: a pending task may be placed ahead of a completed one",
    aheadOfCompleted.stdout.trim(),
  );

  const orderBeforeRejections = implementationOrder();
  const placementRejections: Array<{ args: string[]; label: string; expected: string }> = [
    {
      args: ["--implementation", "--task", "do-the-work", "--before", "no-such-task"],
      label: "an anchor that is not recorded in the section is refused",
      expected: "does not exist in section",
    },
    {
      args: ["--implementation", "--task", "do-the-work", "--before", "run-tests"],
      label: "an anchor in a different section is refused and names both sections",
      expected: "not 'Implementation'",
    },
    {
      args: ["--implementation", "--task", "do-the-work", "--after", "do-the-work"],
      label: "an anchor naming the task itself is refused",
      expected: "cannot be placed relative to itself",
    },
    {
      args: [
        "--implementation", "--task", "do-the-work",
        "--before", "discovered-prerequisite", "--after", "discovered-prerequisite",
      ],
      label: "supplying both positional arguments for one task is refused",
      expected: "cannot both be supplied",
    },
    {
      args: [
        "--implementation", "--task", "earlier-task", "--text", "Anchors forward.",
        "--before", "later-task",
        "--implementation", "--task", "later-task", "--text", "Created afterwards.",
      ],
      label: "an anchor created by a later task group in the same invocation is refused",
      expected: "later --task group",
    },
  ];
  for (const rejection of placementRejections) {
    const result = cli(["generate", changeName, "tasks", ...rejection.args], { cwd: workflowGuidanceDir });
    context.assert(
      result.status !== 0 && result.stderr.includes(rejection.expected),
      `generate tasks rejects placement when ${rejection.label}`,
      `status=${result.status} stderr=${result.stderr.trim()}`,
    );
  }
  context.assert(
    implementationOrder().join(",") === orderBeforeRejections.join(","),
    "a rejected placement leaves the recorded task order unchanged",
    implementationOrder().join(","),
  );

  const forwardResolves = cli([
    "generate", changeName, "tasks",
    "--implementation", "--task", "first-created", "--text", "Created first.", "--before", "impl-1",
    "--implementation", "--task", "anchored-to-earlier", "--text", "Anchors backwards.",
    "--after", "first-created",
  ], { cwd: workflowGuidanceDir });
  const resolvedOrder = implementationOrder();
  // The second group lands between first-created and impl-1, so the two are no longer adjacent.
  context.assert(
    forwardResolves.status === 0
      && resolvedOrder.indexOf("anchored-to-earlier") === resolvedOrder.indexOf("first-created") + 1
      && resolvedOrder.indexOf("first-created") < resolvedOrder.indexOf("impl-1"),
    "an anchor created by an earlier task group in the same invocation resolves",
    `status=${forwardResolves.status} order=${resolvedOrder.join(",")} ${forwardResolves.stderr.trim()}`,
  );
  const cleanupExtras = cli([
    "generate", changeName, "tasks", "--remove", "first-created", "--remove", "anchored-to-earlier",
  ], { cwd: workflowGuidanceDir });
  context.assert(cleanupExtras.status === 0, "removing the sequencing fixtures succeeds", cleanupExtras.stderr.trim());

  const orderBeforeDefault = implementationOrder();
  const defaultAppend = cli([
    "generate", changeName, "tasks",
    "--implementation", "--task", "appended-task", "--text", "No anchor supplied.",
  ], { cwd: workflowGuidanceDir });
  const defaultOrder = implementationOrder();
  context.assert(
    defaultAppend.status === 0 && defaultOrder[defaultOrder.length - 1] === "appended-task",
    "omitting both positional arguments still appends a new task to the end of its section",
    defaultOrder.join(","),
  );
  const defaultRestate = cli([
    "generate", changeName, "tasks",
    "--implementation", "--task", "do-the-work", "--text", "Restated without an anchor.",
  ], { cwd: workflowGuidanceDir });
  context.assert(
    defaultRestate.status === 0
      && implementationOrder().indexOf("do-the-work") === orderBeforeDefault.indexOf("do-the-work"),
    "restating an existing task without a positional argument leaves its position unchanged",
    implementationOrder().join(","),
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
    "resolved:",
    ...answeredRequirementQuestionLines(),
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

  // Every id the diagnostic advertises is exercised, so guidance can never name an id that leaves
  // ready still blocked. The loop is driven by the accepted set rather than by a literal list.
  for (const [index, emptySpecDecisionId] of acceptedEmptySpecIds.entries()) {
  const readyNoDeltaChangeName = `workflow-ready-no-delta-${index}`;
  const readyNoDeltaChangeDir = path.join(workflowGuidanceDir, ".strict-spec-driven", "changes", readyNoDeltaChangeName);
  mkdirSync(path.join(readyNoDeltaChangeDir, "specs"), { recursive: true });
  writeFileSync(path.join(readyNoDeltaChangeDir, "proposal.yaml"), [
    "schema: strict-spec-driven/change-proposal/v1",
    "schema_version: 1",
    "artifact_type: change_proposal",
    "schema_file: test",
    "change:",
    `  id: ${readyNoDeltaChangeName}`,
    "  status: proposed",
    "summary:",
    "  what:",
    "    - Document a technical-only workflow maintenance change",
    "  why:",
    "    - Testing explicit empty-spec readiness",
    "scope:",
    "  in:",
    "    - Include only internal workflow maintenance",
    "  out:",
    "    - Do not change observable spec behavior",
    "unchanged_behavior:",
    "  - Existing delta-spec readiness checks remain unchanged when specs are present",
  ].join("\n") + "\n", "utf8");
  writeFileSync(path.join(readyNoDeltaChangeDir, "design.yaml"), [
    "schema: strict-spec-driven/change-design/v1",
    "schema_version: 1",
    "artifact_type: change_design",
    "schema_file: test",
    `change: ${readyNoDeltaChangeName}`,
    "approach:",
    "  - Test no-delta-spec readiness evidence",
    "decisions:",
    `  ${emptySpecDecisionId}:`,
    "    decision: Leave specs empty because the change has no strict spec impact.",
    "    rationale: A stable decision id gives ready deterministic evidence without requiring prose interpretation.",
    "alternatives: []",
  ].join("\n") + "\n", "utf8");
  writeFileSync(path.join(readyNoDeltaChangeDir, "tasks.yaml"), [
    "schema: strict-spec-driven/task-list/v2",
    "schema_version: 2",
    "artifact_type: task_list",
    "schema_file: test",
    `change: ${readyNoDeltaChangeName}`,
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
  writeFileSync(path.join(readyNoDeltaChangeDir, "questions.yaml"), [
    "schema: strict-spec-driven/question-list/v1",
    "schema_version: 1",
    "artifact_type: question_list",
    "schema_file: test",
    `change: ${readyNoDeltaChangeName}`,
    "open: []",
    "resolved:",
    ...answeredRequirementQuestionLines(),
  ].join("\n") + "\n", "utf8");
  const readyNoDelta = cli(["ready", readyNoDeltaChangeName], { cwd: workflowGuidanceDir });
  context.assert(
    readyNoDelta.status === 0,
    `ready exits zero for the advertised empty-spec decision id '${emptySpecDecisionId}'`,
    readyNoDelta.stdout.trim(),
  );
  const readyNoDeltaJson = JSON.parse(readyNoDelta.stdout.trim());
  context.assert(
    readyNoDeltaJson.ready === true
      && !readyNoDeltaJson.diagnostics.some((diagnostic: { artifactPath: string; message: string }) =>
        diagnostic.artifactPath.endsWith("/specs/") && diagnostic.message.includes("no delta spec files")
      ),
    `ready accepts '${emptySpecDecisionId}' as an explicit empty-spec decision without missing-delta-spec diagnostics`,
  );
  }
} finally {
  rmSync(workflowGuidanceDir, { recursive: true, force: true });
}

context.section("[11b] change-intake question gate fixture regression");


/**
 * propose seeds the requirement interrogation as open questions, so every change is blocked until a
 * human answers them. Fixtures that want a ready change must answer them like a requester would.
 */
function resolveSeededRequirementQuestions(workspaceRoot: string, changeName: string): void {
  for (const questionId of CANONICAL_REQUIREMENT_IDS) {
    const result = projectWorkspaceCli(workspaceRoot, [
      "generate",
      changeName,
      "questions",
      "--resolve",
      questionId,
      "--answer",
      `Fixture requester answer for ${questionId}.`,
      "--answered-by",
      "human",
    ]);
    context.assert(
      result.status === 0,
      `${changeName} fixture resolves seeded requirement question '${questionId}'`,
      `stdout: ${result.stdout.trim()} stderr: ${result.stderr.trim()}`,
    );
  }
}

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
  // The task list is authored like every other artifact now, so the fixture must supply all three
  // sections and both testing gates for the change to reach ready.
  context.assert(
    projectWorkspaceCli(workspaceRoot, [
      "generate", changeName, "tasks",
      "--implementation", "--task", "record-fixture-evidence",
      "--text", "Record the fixture evidence this change documents.", "--status", "complete",
      "--testing", "--task", "run-fixture-tests",
      "--text", "Run the fixture test suite.", "--status", "complete", "--command", "npm test",
      "--verification", "--task", "verify-fixture-scope",
      "--text", "Verify the fixture change matches its proposal scope.", "--status", "complete",
      "--validation-task", "run-fixture-tests", "--unit-test-task", "run-fixture-tests",
    ]).status === 0,
    `${changeName} fixture tasks generation exits zero`,
  );
  context.assert(
    projectWorkspaceCli(workspaceRoot, ["generate", changeName, "questions", "--resolved", "fixture-technical", "--question", "Which fixture path?", "--context", "Fixture context.", "--answer", "The copied fixture path."]).status === 0,
    `${changeName} fixture empty questions generation exits zero`,
  );
  resolveSeededRequirementQuestions(workspaceRoot, changeName);
  context.assert(
    projectWorkspaceCli(workspaceRoot, [
      "generate",
      changeName,
      "delta-spec",
      "--target-spec",
      "todo-management",
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
  const resolvedCompatibility = resolvedQuestions.resolved.find((entry) => entry.id === "data-compatibility");
  context.assert(
    resolvedQuestions.open.length === 0
      && resolvedCompatibility?.answer === "必须保留现有完成状态。",
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
    "archive exits zero when a residual delta mapping is present",
    `got ${archiveResult.status}: ${archiveResult.stdout}`,
  );
  const mergedMainSpec = yamlModule.parseYamlFile<{ mapping: { implementation: string[]; tests: string[] } }>(foundationPath);
  context.assert(
    JSON.stringify(mergedMainSpec.mapping.implementation) === JSON.stringify(["src/archive.ts"]),
    "archive merges no delta implementation mapping into the main spec",
    `got ${JSON.stringify(mergedMainSpec.mapping.implementation)}`,
  );
  context.assert(
    JSON.stringify(mergedMainSpec.mapping.tests) === JSON.stringify(["test/suites/change-lifecycle.ts"]),
    "archive merges no delta test mapping into the main spec",
    `got ${JSON.stringify(mergedMainSpec.mapping.tests)}`,
  );
} finally {
  rmSync(archiveMappingDir, { recursive: true, force: true });
}

// 13a3: archive leaves an existing main spec mapping unchanged when the delta declares none
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
      && !mergedTech.mapping.implementation.includes("src/added.ts"),
    "archive merges no delta implementation mapping into the standard and leaves its residual mapping intact",
    `got ${JSON.stringify(mergedTech.mapping.implementation)}`,
  );
  context.assert(
    mergedTech.mapping.enforcement.includes("eslint.config.js"),
    "archive leaves residual standard enforcement paths untouched",
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

// 13t2: archive prunes a main spec or standard its delta empties, and keeps partial removals
const archivePruneDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-prune-"));
try {
  const changeName = "archive-prune";
  writeMainSpecArtifact(archivePruneDir, "retired/behavior.yaml", "retired-behavior", "Retired Behavior", [
    { id: "req-gone-one", statement: "First retired requirement" },
    { id: "req-gone-two", statement: "Second retired requirement" },
  ]);
  writeMainSpecArtifact(archivePruneDir, "cli/foundation.yaml", "cli-foundation", "CLI Foundation", [
    { id: "req-kept", statement: "Surviving requirement" },
    { id: "req-dropped", statement: "Dropped requirement" },
  ]);
  writeMainTechArtifact(archivePruneDir, "retired/standard.yaml", "retired-standard", "Retired Standard", "coding", [
    { id: "rule-gone", strength: "MUST", statement: "Retired rule" },
  ]);
  writeMainTechArtifact(archivePruneDir, "coding-baseline.yaml", "coding-baseline", "Coding Baseline", "coding", [
    { id: "rule-kept", strength: "MUST", statement: "Surviving rule" },
    { id: "rule-dropped", strength: "SHOULD", statement: "Dropped rule" },
  ]);
  writeValidChangeArtifacts(archivePruneDir, changeName);
  writeDeltaSpecArtifact(archivePruneDir, changeName, "retired.yaml", "retired-behavior", {
    REMOVED: {
      "req-gone-one": { reason: "Capability removed" },
      "req-gone-two": { reason: "Capability removed" },
    },
  });
  writeDeltaSpecArtifact(archivePruneDir, changeName, "cli.yaml", "cli-foundation", {
    REMOVED: { "req-dropped": { reason: "Capability removed" } },
  });
  writeDeltaTechArtifact(archivePruneDir, changeName, "retired.yaml", "retired-standard", {
    REMOVED: { "rule-gone": { reason: "Capability removed" } },
  });
  writeDeltaTechArtifact(archivePruneDir, changeName, "coding.yaml", "coding-baseline", {
    REMOVED: { "rule-dropped": { reason: "Capability removed" } },
  });

  const pruneResult = cli(["archive", changeName], { cwd: archivePruneDir });
  context.assert(pruneResult.status === 0, "archive exits zero when a delta empties a main spec and a standard", `got ${pruneResult.status}: ${pruneResult.stderr}`);
  const pruneJson = JSON.parse(pruneResult.stdout.trim()) as {
    mergeSummary: { specsPruned: number; specsUpdated: number; removed: number };
    mergedSpecs: Array<{ targetSpec: string; specPath: string; pruned: boolean }>;
    techMergeSummary: { standardsPruned: number; standardsUpdated: number };
    mergedStandards: Array<{ targetStandard: string; standardPath: string; pruned: boolean }>;
  };
  const strictRoot = path.join(archivePruneDir, ".strict-spec-driven");

  const prunedSpec = pruneJson.mergedSpecs.find((report) => report.targetSpec === "retired-behavior");
  context.assert(
    prunedSpec?.pruned === true && prunedSpec.specPath === ".strict-spec-driven/specs/retired/behavior.yaml",
    "archive output names the pruned main spec path",
    JSON.stringify(prunedSpec),
  );
  context.assert(
    pruneJson.mergeSummary.specsPruned === 1 && pruneJson.mergeSummary.specsUpdated === 1 && pruneJson.mergeSummary.removed === 3,
    "archive merge summary counts the pruned spec apart from the updated one",
    JSON.stringify(pruneJson.mergeSummary),
  );
  context.assert(
    !existsSync(path.join(strictRoot, "specs", "retired", "behavior.yaml"))
      && !existsSync(path.join(strictRoot, "specs", "retired")),
    "archive deletes the emptied main spec and the directory it leaves empty",
  );
  const prunedSpecIndex = yamlModule.parseYamlFile<{ specs: Array<{ id: string }> }>(path.join(strictRoot, "specs", "INDEX.yaml"));
  context.assert(
    !prunedSpecIndex.specs.some((spec) => spec.id === "retired-behavior")
      && prunedSpecIndex.specs.some((spec) => spec.id === "cli-foundation"),
    "archive regenerates the spec index without the pruned spec and with the surviving one",
    JSON.stringify(prunedSpecIndex.specs),
  );

  const keptSpec = pruneJson.mergedSpecs.find((report) => report.targetSpec === "cli-foundation");
  const keptSpecArtifact = yamlModule.parseYamlFile<{ requirements: Record<string, unknown> }>(path.join(strictRoot, "specs", "cli", "foundation.yaml"));
  context.assert(
    keptSpec?.pruned === false && JSON.stringify(Object.keys(keptSpecArtifact.requirements)) === JSON.stringify(["req-kept"]),
    "archive keeps a partially removed main spec with its surviving requirements",
    JSON.stringify(keptSpec),
  );

  const prunedStandard = pruneJson.mergedStandards.find((report) => report.targetStandard === "retired-standard");
  context.assert(
    prunedStandard?.pruned === true && prunedStandard.standardPath === ".strict-spec-driven/tech/retired/standard.yaml",
    "archive output names the pruned standard path",
    JSON.stringify(prunedStandard),
  );
  context.assert(
    pruneJson.techMergeSummary.standardsPruned === 1 && pruneJson.techMergeSummary.standardsUpdated === 1,
    "archive tech merge summary counts the pruned standard apart from the updated one",
    JSON.stringify(pruneJson.techMergeSummary),
  );
  context.assert(
    !existsSync(path.join(strictRoot, "tech", "retired", "standard.yaml"))
      && !existsSync(path.join(strictRoot, "tech", "retired")),
    "archive deletes the emptied standard and the directory it leaves empty",
  );
  const prunedTechIndex = yamlModule.parseYamlFile<{ standards: Array<{ id: string }> }>(path.join(strictRoot, "tech", "INDEX.yaml"));
  context.assert(
    !prunedTechIndex.standards.some((standard) => standard.id === "retired-standard")
      && prunedTechIndex.standards.some((standard) => standard.id === "coding-baseline"),
    "archive regenerates the tech index without the pruned standard and with the surviving one",
    JSON.stringify(prunedTechIndex.standards),
  );

  const keptStandard = pruneJson.mergedStandards.find((report) => report.targetStandard === "coding-baseline");
  const keptTechArtifact = yamlModule.parseYamlFile<{ rules: Record<string, unknown> }>(path.join(strictRoot, "tech", "coding-baseline.yaml"));
  context.assert(
    keptStandard?.pruned === false && JSON.stringify(Object.keys(keptTechArtifact.rules)) === JSON.stringify(["rule-kept"]),
    "archive keeps a partially removed standard with its surviving rules",
    JSON.stringify(keptStandard),
  );
  context.assert(existsSync(path.join(strictRoot, "specs")) && existsSync(path.join(strictRoot, "tech")), "archive pruning never removes the specs or tech root");
} finally {
  rmSync(archivePruneDir, { recursive: true, force: true });
}

// 13t3: a retried archive prunes the artifacts an earlier refused attempt had already emptied.
// Pruning runs only after every merge succeeds, so a refused attempt leaves the emptied spec and
// standard on disk; on the retry their REMOVED targets are absent and skipped, and they still prune.
const archivePruneRetryDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-prune-retry-"));
try {
  const changeName = "archive-prune-retry";
  writeMainSpecArtifact(archivePruneRetryDir, "retired/behavior.yaml", "retired-behavior", "Retired Behavior", []);
  writeMainTechArtifact(archivePruneRetryDir, "retired/standard.yaml", "retired-standard", "Retired Standard", "coding", []);
  writeValidChangeArtifacts(archivePruneRetryDir, changeName);
  writeDeltaSpecArtifact(archivePruneRetryDir, changeName, "retired.yaml", "retired-behavior", {
    REMOVED: { "req-gone": { reason: "Removed by the refused attempt" } },
  });
  writeDeltaTechArtifact(archivePruneRetryDir, changeName, "retired.yaml", "retired-standard", {
    REMOVED: { "rule-gone": { reason: "Removed by the refused attempt" } },
  });

  const retryResult = cli(["archive", changeName], { cwd: archivePruneRetryDir });
  context.assert(retryResult.status === 0, "a retried archive over already-emptied artifacts exits zero", `got ${retryResult.status}: ${retryResult.stderr}`);
  const retryJson = JSON.parse(retryResult.stdout.trim()) as {
    mergeSummary: { specsPruned: number; removedMissingTargetSkipped: number };
    techMergeSummary: { standardsPruned: number; removedMissingTargetSkipped: number };
  };
  const retryRoot = path.join(archivePruneRetryDir, ".strict-spec-driven");
  context.assert(
    retryJson.mergeSummary.specsPruned === 1
      && retryJson.mergeSummary.removedMissingTargetSkipped === 1
      && !existsSync(path.join(retryRoot, "specs", "retired")),
    "a retried archive skips the absent REMOVED target and still prunes the emptied main spec",
    JSON.stringify(retryJson.mergeSummary),
  );
  context.assert(
    retryJson.techMergeSummary.standardsPruned === 1
      && retryJson.techMergeSummary.removedMissingTargetSkipped === 1
      && !existsSync(path.join(retryRoot, "tech", "retired")),
    "a retried archive skips the absent REMOVED rule and still prunes the emptied standard",
    JSON.stringify(retryJson.techMergeSummary),
  );
} finally {
  rmSync(archivePruneRetryDir, { recursive: true, force: true });
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

context.section("[15] copied project workspace lifecycle commands");

// 15a: copied project workspace exercises propose, list, modify, cancel, and archive lookup
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

context.section("[16] generate argument documentation coverage");

type GenerationModule = { getDeclaredGenerateArguments: () => string[] };
type CommandMetadataModule = {
  COMMAND_METADATA_ENTRIES: Record<string, { flags: Array<{ name: string; description: string; repeatable?: boolean; repeatSemantics?: string }> }>;
};

const generationModule = await loadDistModule<GenerationModule>("cli/cmd-generation.js");
const metadataModule = await loadDistModule<CommandMetadataModule>("cli/command-metadata-entries.js");

const acceptedGenerateArguments = generationModule.getDeclaredGenerateArguments();
const documentedGenerateArguments = new Set(
  metadataModule.COMMAND_METADATA_ENTRIES.generate.flags.map((flag) => flag.name.replace(/^--/, "")),
);
const undocumentedGenerateArguments = acceptedGenerateArguments.filter((name) => !documentedGenerateArguments.has(name));
context.assert(
  undocumentedGenerateArguments.length === 0,
  "every named argument the generate command accepts is documented in its command-metadata entry",
  `undocumented argument(s): ${undocumentedGenerateArguments.map((name) => `--${name}`).join(", ")}`,
);

for (const required of ["alternative", "reason", "risk"]) {
  context.assert(
    documentedGenerateArguments.has(required),
    `generate documents the design --${required} argument`,
  );
}
const alternativeFlag = metadataModule.COMMAND_METADATA_ENTRIES.generate.flags.find((flag) => flag.name === "--alternative");
context.assert(
  typeof alternativeFlag?.repeatSemantics === "string" && alternativeFlag.repeatSemantics.includes("--reason"),
  "the documented --alternative argument states its pairing requirement with --reason",
);

const generateHelp = cli(["generate", "--help"]);
context.assert(
  generateHelp.stdout.includes("--alternative") && generateHelp.stdout.includes("--risk"),
  "generate help output surfaces the design alternative and risk arguments",
);
context.assert(
  generateHelp.stdout.includes("design --approach <text>") && generateHelp.stdout.includes("[--alternative <text> --reason <text>]"),
  "the generate usage line for design lists the alternative and reason arguments",
);

context.section("[18] requirement interrogation gate");

const interrogationFixture = createCopiedProjectWorkspace("todo-app");
try {
  const { workspaceRoot } = interrogationFixture;
  context.assert(
    projectWorkspaceCli(workspaceRoot, ["migrate"]).status === 0,
    "requirement interrogation fixture migrate succeeds",
  );
  context.assert(
    projectWorkspaceCli(workspaceRoot, ["cancel", "add-due-dates"]).status === 0,
    "requirement interrogation fixture removes the seeded active change",
  );

  const changeName = "interrogation-change";
  context.assert(
    projectWorkspaceCli(workspaceRoot, ["propose", changeName]).status === 0,
    "requirement interrogation fixture propose exits zero",
  );
  const questionsPath = path.join(workspaceRoot, ".strict-spec-driven", "changes", changeName, "questions.yaml");
  type SeededQuestions = {
    open: Array<{ id: string; question: string; context: string; kind?: string; answered_by?: string }>;
    resolved: Array<{ id: string; answer: string; kind?: string; answered_by?: string }>;
  };

  // propose writes no artifact, so the gate cannot be skipped by simply never authoring one: an
  // absent questions.yaml blocks ready by name before any requirement question can be evaluated.
  context.assert(
    !existsSync(questionsPath),
    "propose writes no questions artifact",
  );
  const unauthoredReady = projectWorkspaceCli(workspaceRoot, ["ready", changeName]);
  const unauthoredReadyJson = JSON.parse(unauthoredReady.stdout.trim());
  context.assert(
    unauthoredReady.status !== 0
      && unauthoredReadyJson.diagnostics.some(
        (diagnostic: { source: string; artifactPath: string }) =>
          diagnostic.source === "missing_artifact" && diagnostic.artifactPath.endsWith("/questions.yaml"),
      ),
    "an unauthored questions artifact blocks ready, so the interrogation gate cannot be bypassed",
    `stdout: ${unauthoredReady.stdout.trim()}`,
  );

  // Authoring the artifact is what seeds the interrogation set, alongside whatever the caller asked
  // to record. The five entries are workflow-required state, not content the caller supplied.
  context.assert(
    projectWorkspaceCli(workspaceRoot, [
      "generate",
      changeName,
      "questions",
      "--open",
      "technical-detail",
      "--question",
      "Which storage path is used?",
      "--context",
      "Technical follow-up recorded alongside the seeded interrogation.",
    ]).status === 0,
    "authoring the questions artifact exits zero",
  );
  const seeded = yamlModule.parseYamlDocument<SeededQuestions>(readFileSync(questionsPath, "utf8"));

  for (const questionId of CANONICAL_REQUIREMENT_IDS) {
    const entry = seeded.open.find((candidate) => candidate.id === questionId);
    context.assert(
      entry !== undefined && entry.kind === "requirement",
      `authoring questions seeds canonical requirement question '${questionId}' as open with kind requirement`,
    );
    context.assert(
      entry !== undefined
        && entry.context.length > entry.question.length
        && entry.context.includes("Worked example")
        && entry.context.includes("sufficient answer"),
      `seeded requirement question '${questionId}' explains itself rather than restating the question`,
    );
  }
  context.assert(
    seeded.open.length === CANONICAL_REQUIREMENT_IDS.length + 1,
    "authoring questions seeds exactly the five canonical requirement questions beside the supplied entry",
    `open ids: ${seeded.open.map((entry) => entry.id).join(", ")}`,
  );

  const freshReady = projectWorkspaceCli(workspaceRoot, ["ready", changeName]);
  context.assert(
    freshReady.status !== 0,
    "a change is not ready while its seeded requirement questions are open",
    `stdout: ${freshReady.stdout.trim()}`,
  );
  const freshReadyJson = JSON.parse(freshReady.stdout.trim());
  const requirementDiagnostics = freshReadyJson.diagnostics.filter(
    (diagnostic: { source: string }) => diagnostic.source === "requirement_intake",
  );
  context.assert(
    requirementDiagnostics.length === CANONICAL_REQUIREMENT_IDS.length,
    "ready reports one requirement_intake diagnostic per unanswered canonical question",
    `diagnostics: ${JSON.stringify(freshReadyJson.diagnostics.map((d: { source: string }) => d.source))}`,
  );
  context.assert(
    requirementDiagnostics.some(
      (diagnostic: { message: string }) =>
        diagnostic.message.includes("what is concretely going wrong today")
        && diagnostic.message.includes("--answered-by human"),
    ),
    "each requirement_intake diagnostic states what the question asks for and the resolving command",
    `messages: ${requirementDiagnostics.map((d: { message: string }) => d.message).join(" | ")}`,
  );

  // Adding a technical question must never disturb the interrogation entries alongside it.
  context.assert(
    projectWorkspaceCli(workspaceRoot, [
      "generate",
      changeName,
      "questions",
      "--open",
      "technical-detail",
      "--question",
      "Which storage path is used?",
      "--context",
      "Technical follow-up recorded alongside the seeded interrogation.",
    ]).status === 0,
    "questions accepts a technical entry alongside the seeded interrogation",
  );
  const afterTechnicalEntry = yamlModule.parseYamlDocument<SeededQuestions>(readFileSync(questionsPath, "utf8"));
  context.assert(
    CANONICAL_REQUIREMENT_IDS.every((questionId) => afterTechnicalEntry.open.some((entry) => entry.id === questionId)),
    "adding a technical question preserves every requirement-kind entry",
    `open ids: ${afterTechnicalEntry.open.map((entry) => entry.id).join(", ")}`,
  );
  context.assert(
    afterTechnicalEntry.open.some((entry) => entry.id === "technical-detail"),
    "the supplied technical entry is recorded",
  );

  context.assert(
    projectWorkspaceCli(workspaceRoot, [
      "generate",
      changeName,
      "questions",
      "--resolve",
      "requirement-problem",
      "--answer",
      "The weekly report is assembled by hand every Monday.",
      "--answered-by",
      "human",
    ]).status === 0,
    "resolving a seeded requirement question with attribution exits zero",
  );
  const afterResolve = yamlModule.parseYamlDocument<SeededQuestions>(readFileSync(questionsPath, "utf8"));
  const resolvedProblem = afterResolve.resolved.find((entry) => entry.id === "requirement-problem");
  context.assert(
    resolvedProblem?.kind === "requirement" && resolvedProblem?.answered_by === "human",
    "resolving carries the requirement kind forward and records the answer attribution",
    `entry: ${JSON.stringify(resolvedProblem)}`,
  );

  const rejectedKind = projectWorkspaceCli(workspaceRoot, [
    "generate",
    changeName,
    "questions",
    "--open",
    "bad-kind",
    "--question",
    "Q",
    "--context",
    "C",
    "--kind",
    "invented",
  ]);
  context.assert(
    rejectedKind.status !== 0 && rejectedKind.stderr.includes("requirement, technical"),
    "the questions generator rejects an out-of-set --kind value naming the permitted values",
    `stderr: ${rejectedKind.stderr.trim()}`,
  );
  const rejectedAttribution = projectWorkspaceCli(workspaceRoot, [
    "generate",
    changeName,
    "questions",
    "--resolve",
    "requirement-outcome",
    "--answer",
    "A",
    "--answered-by",
    "guesswork",
  ]);
  context.assert(
    rejectedAttribution.status !== 0 && rejectedAttribution.stderr.includes("human, roadmap, assumption"),
    "the questions generator rejects an out-of-set --answered-by value naming the permitted values",
    `stderr: ${rejectedAttribution.stderr.trim()}`,
  );

  for (const questionId of CANONICAL_REQUIREMENT_IDS) {
    if (questionId === "requirement-problem") continue;
    projectWorkspaceCli(workspaceRoot, [
      "generate",
      changeName,
      "questions",
      "--resolve",
      questionId,
      "--answer",
      `Requester answer for ${questionId}.`,
      "--answered-by",
      questionId === "requirement-trigger" ? "roadmap" : "human",
    ]);
  }
  const allAnswered = yamlModule.parseYamlDocument<SeededQuestions>(readFileSync(questionsPath, "utf8"));
  context.assert(
    CANONICAL_REQUIREMENT_IDS.every((questionId) => allAnswered.resolved.some((entry) => entry.id === questionId)),
    "every canonical requirement question can be resolved with human or roadmap attribution",
  );
  const readyAfterAnswers = JSON.parse(projectWorkspaceCli(workspaceRoot, ["ready", changeName]).stdout.trim());
  context.assert(
    !readyAfterAnswers.diagnostics.some((diagnostic: { source: string }) => diagnostic.source === "requirement_intake"),
    "ready reports no requirement_intake diagnostics once every canonical question is answered by a human or the roadmap",
    `diagnostics: ${JSON.stringify(readyAfterAnswers.diagnostics)}`,
  );

  // An assumption-answered requirement blocks exactly like an unanswered one.
  const assumptionQuestions = yamlModule.parseYamlDocument<SeededQuestions>(readFileSync(questionsPath, "utf8"));
  const assumedEntry = assumptionQuestions.resolved.find((entry) => entry.id === "requirement-outcome");
  if (assumedEntry) assumedEntry.answered_by = "assumption";
  writeFileSync(questionsPath, yamlModule.stringifyYamlDocument(assumptionQuestions), "utf8");
  const readyWithAssumption = projectWorkspaceCli(workspaceRoot, ["ready", changeName]);
  const assumptionJson = JSON.parse(readyWithAssumption.stdout.trim());
  context.assert(
    readyWithAssumption.status !== 0
      && assumptionJson.diagnostics.some(
        (diagnostic: { source: string; message: string }) =>
          diagnostic.source === "requirement_intake" && diagnostic.message.includes("agent assumption"),
      ),
    "ready blocks a requirement answered by assumption and names it as an agent assumption",
    `stdout: ${readyWithAssumption.stdout.trim()}`,
  );
  const assumptionDiagnostic = assumptionJson.diagnostics.find(
    (diagnostic: { source: string; message: string }) =>
      diagnostic.source === "requirement_intake" && diagnostic.message.includes("agent assumption"),
  ) as { message: string } | undefined;
  context.assert(
    assumptionDiagnostic !== undefined
      && assumptionDiagnostic.message.includes(`strict-spec-cli generate ${changeName} questions --resolved requirement-outcome`)
      && assumptionDiagnostic.message.includes("--answered-by human")
      && assumptionDiagnostic.message.includes("--answered-by roadmap"),
    "the assumption diagnostic names the resolving command and both accepted attributions rather than only the expected values",
    assumptionDiagnostic?.message,
  );

  // So does an answer with no attribution at all.
  const unattributed = yamlModule.parseYamlDocument<SeededQuestions>(readFileSync(questionsPath, "utf8"));
  const unattributedEntry = unattributed.resolved.find((entry) => entry.id === "requirement-outcome");
  if (unattributedEntry) delete unattributedEntry.answered_by;
  writeFileSync(questionsPath, yamlModule.stringifyYamlDocument(unattributed), "utf8");
  const readyUnattributed = projectWorkspaceCli(workspaceRoot, ["ready", changeName]);
  context.assert(
    readyUnattributed.status !== 0
      && JSON.parse(readyUnattributed.stdout.trim()).diagnostics.some(
        (diagnostic: { source: string; message: string }) =>
          diagnostic.source === "requirement_intake" && diagnostic.message.includes("missing an answered_by attribution"),
      ),
    "ready blocks a requirement answer that carries no attribution",
    `stdout: ${readyUnattributed.stdout.trim()}`,
  );

  // And so does removing the canonical question outright.
  const removed = yamlModule.parseYamlDocument<SeededQuestions>(readFileSync(questionsPath, "utf8"));
  removed.resolved = removed.resolved.filter((entry) => entry.id !== "requirement-outcome");
  writeFileSync(questionsPath, yamlModule.stringifyYamlDocument(removed), "utf8");
  const readyMissing = projectWorkspaceCli(workspaceRoot, ["ready", changeName]);
  context.assert(
    readyMissing.status !== 0
      && JSON.parse(readyMissing.stdout.trim()).diagnostics.some(
        (diagnostic: { source: string; message: string }) =>
          diagnostic.source === "requirement_intake" && diagnostic.message.includes("requirement-outcome"),
      ),
    "ready blocks when a canonical requirement question is absent from questions.yaml",
    `stdout: ${readyMissing.stdout.trim()}`,
  );
} finally {
  interrogationFixture.cleanup();
}

const questionListSchemaModule = await loadDistModule<ValidationModule>("validation.js");
const questionListSchema = questionListSchemaModule.loadBundledSchemaBySchemaId(
  "strict-spec-driven/question-list/v1",
);

function questionListArtifact(open: unknown[], resolved: unknown[]): unknown {
  return {
    schema: "strict-spec-driven/question-list/v1",
    schema_version: 1,
    artifact_type: "question_list",
    schema_file: "templates/strict-spec-driven/schemas/question-list.yaml",
    change: "schema-coverage",
    open,
    resolved,
  };
}

function questionListIsValid(open: unknown[], resolved: unknown[]): boolean {
  return questionListSchemaModule.validateWithSchema(
    questionListSchema,
    questionListArtifact(open, resolved),
    "questions.yaml",
  ).valid;
}

context.assert(
  questionListIsValid([], [{
    id: "requirement-problem",
    question: "What is going wrong?",
    context: "Explained context.",
    kind: "requirement",
    answered_by: "human",
    answer: "The report is assembled by hand.",
    status: "resolved",
  }]),
  "the question-list schema accepts a requirement entry carrying kind and answered_by",
);
context.assert(
  questionListIsValid([{ id: "legacy", question: "Q", context: "C", status: "open" }], []),
  "the question-list schema keeps entries without kind or answered_by valid",
);
context.assert(
  !questionListIsValid([{ id: "bad", question: "Q", context: "C", kind: "invented", status: "open" }], []),
  "the question-list schema rejects an out-of-set kind value",
);
context.assert(
  !questionListIsValid([], [{
    id: "bad",
    question: "Q",
    context: "C",
    answered_by: "guesswork",
    answer: "A",
    status: "resolved",
  }]),
  "the question-list schema rejects an out-of-set answered_by value",
);

context.section("[17] removed review command");

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

context.section("[17b] removed mapping audit commands");

for (const removedCommand of ["verify-spec-mappings", "verify-tech-mappings"]) {
  const removedMappingCommand = cli([removedCommand]);
  context.assert(
    removedMappingCommand.status !== 0,
    `${removedCommand} CLI command is not registered`,
    `stdout: ${removedMappingCommand.stdout.trim()} stderr: ${removedMappingCommand.stderr.trim()}`,
  );
  context.assert(
    removedMappingCommand.stderr.includes("Usage: strict-spec-cli")
      && removedMappingCommand.stdout.trim() === "",
    `removed ${removedCommand} reports top-level usage instead of a silent success`,
    `stderr: ${removedMappingCommand.stderr.trim()}`,
  );
  const removedFromHelp = cli(["--help"]);
  context.assert(
    !removedFromHelp.stdout.includes(removedCommand),
    `${removedCommand} is absent from root help`,
  );
}

context.section("[X] workflow config artifact-aware mutations");

const configEditFixture = createCopiedProjectWorkspace("todo-app");
try {
  const { workspaceRoot } = configEditFixture;
  const initResult = projectWorkspaceCli(workspaceRoot, ["init"]);
  context.assert(initResult.status === 0, "config-edit fixture initializes strict workflow state", initResult.stderr.trim());
  const configPath = path.join(workspaceRoot, ".strict-spec-driven", "config.yaml");
  const beforeConfig = readFileSync(configPath, "utf8");

  const editResult = projectWorkspaceCli(workspaceRoot, [
    "config-edit",
    "--preferred-human-language", "Chinese",
    "--context", "Copied workspace config mutation coverage.",
    "--rule", "workflow-test:Keep copied-project tests isolated.",
    "--regression-command", "bun run build && bun test/run.ts",
    "--coverage-threshold", "75",
    "--coverage-include", "src/**",
    "--coverage-exclude", "src/generated/**",
    "--maintenance-check", "generated-doc-check",
  ]);
  context.assert(editResult.status === 0, "config-edit accepts named scalar and list intent", editResult.stderr.trim());
  const editPayload = JSON.parse(editResult.stdout) as {
    valid: boolean;
    committed: boolean;
    artifactPath: string;
    changes: Array<{ artifactKind?: string; schemaKey?: string }>;
  };
  context.assert(
    editPayload.valid
      && editPayload.committed
      && editPayload.artifactPath === ".strict-spec-driven/config.yaml"
      && editPayload.changes[0]?.artifactKind === "workflow-config"
      && editPayload.changes[0]?.schemaKey === "strict-spec-driven/schemas/config.yaml",
    "config-edit reports the confined target and workflow-config recovery assets",
    editResult.stdout.trim(),
  );

  const edited = yamlModule.parseYamlDocument<Record<string, any>>(readFileSync(configPath, "utf8"));
  context.assert(edited.schema === "strict-spec-driven/config/v1", "config-edit preserves unnamed schema identity");
  context.assert(edited.preferred_human_language === "Chinese", "config-edit updates a named scalar");
  context.assert(
    edited.rules["workflow-test"].includes("Keep copied-project tests isolated."),
    "config-edit appends a categorized rule",
  );
  context.assert(
    edited.review_evidence.project_regression.coverage.scope.include.includes("src/**")
      && edited.review_evidence.project_regression.coverage.scope.exclude.includes("src/generated/**"),
    "config-edit appends nested coverage lists",
  );
  context.assert(
    edited.maintenance.checks.some((check: { type?: string }) => check.type === "generated-doc-check"),
    "config-edit upserts a maintenance check by type",
  );

  const repeatResult = projectWorkspaceCli(workspaceRoot, [
    "config-edit",
    "--rule", "workflow-test:Keep copied-project tests isolated.",
    "--coverage-include", "src/**",
    "--maintenance-check", "generated-doc-check",
  ]);
  context.assert(repeatResult.status === 0, "equivalent config-edit intent is idempotent", repeatResult.stderr.trim());
  const repeated = yamlModule.parseYamlDocument<Record<string, any>>(readFileSync(configPath, "utf8"));
  context.assert(
    repeated.rules["workflow-test"].filter((entry: string) => entry === "Keep copied-project tests isolated.").length === 1
      && repeated.review_evidence.project_regression.coverage.scope.include.filter((entry: string) => entry === "src/**").length === 1
      && repeated.maintenance.checks.filter((entry: { type?: string }) => entry.type === "generated-doc-check").length === 1,
    "config-edit de-duplicates lists and keyed maintenance checks",
  );

  const removeResult = projectWorkspaceCli(workspaceRoot, [
    "config-edit",
    "--remove-rule", "workflow-test:Keep copied-project tests isolated.",
    "--remove-coverage-exclude", "src/generated/**",
    "--remove-maintenance-check", "generated-doc-check",
    "--remove-context",
  ]);
  context.assert(removeResult.status === 0, "config-edit removes only named entries", removeResult.stderr.trim());
  const removed = yamlModule.parseYamlDocument<Record<string, any>>(readFileSync(configPath, "utf8"));
  context.assert(removed.context === undefined, "config-edit removes the named context scalar");
  context.assert(removed.rules["workflow-test"] === undefined, "config-edit removes an empty rule category after its last entry");
  context.assert(removed.maintenance === undefined, "config-edit removes an empty maintenance container");
  context.assert(
    removed.review_evidence.project_regression.coverage.scope.include.includes("src/**")
      && removed.review_evidence.project_regression.coverage.scope.exclude === undefined,
    "config-edit preserves unremoved coverage content",
  );

  const stableBeforeInvalid = readFileSync(configPath, "utf8");
  const invalidThreshold = projectWorkspaceCli(workspaceRoot, ["config-edit", "--coverage-threshold", "101"]);
  context.assert(
    invalidThreshold.status !== 0 && invalidThreshold.stderr.includes("0 through 100"),
    "config-edit rejects an invalid coverage threshold deterministically",
    invalidThreshold.stderr.trim(),
  );
  context.assert(readFileSync(configPath, "utf8") === stableBeforeInvalid, "rejected config-edit leaves prior bytes unchanged");

  const invalidRemoval = projectWorkspaceCli(workspaceRoot, ["config-edit", "--remove-coverage-include", "src/**"]);
  context.assert(invalidRemoval.status !== 0, "config-edit rejects a candidate that violates the coverage schema");
  context.assert(readFileSync(configPath, "utf8") === stableBeforeInvalid, "schema-invalid config removal rolls back completely");

  const deleteResult = projectWorkspaceCli(workspaceRoot, ["config-edit", "--delete"]);
  context.assert(
    deleteResult.status !== 0 && deleteResult.stderr.includes("unsupported argument --delete"),
    "config-edit exposes no whole-config deletion operation",
    deleteResult.stderr.trim(),
  );
  context.assert(existsSync(configPath), "rejected config deletion leaves the workflow config present");
  context.assert(beforeConfig !== readFileSync(configPath, "utf8"), "accepted config edits changed the initialized artifact");
} finally {
  configEditFixture.cleanup();
}

context.section("[Y] mutation results identify their recovery assets");

const surfaceIdentifierFixture = createCopiedProjectWorkspace("todo-app");
try {
  const { workspaceRoot } = surfaceIdentifierFixture;
  context.assert(
    projectWorkspaceCli(workspaceRoot, ["propose", "identifier-probe"]).status === 0,
    "identifier probe change scaffolds",
  );

  const successResult = projectWorkspaceCli(workspaceRoot, [
    "generate",
    "identifier-probe",
    "proposal",
    "--what",
    "Probe the mutation result identifiers",
    "--why",
    "A successful write must name the schema and example that describe the artifact",
  ]);
  const successPayload = JSON.parse(successResult.stdout) as {
    valid: boolean;
    artifactKind?: string;
    schemaKey?: string;
    schemaFilePath?: string;
    exampleKey?: string;
  };
  context.assert(
    successResult.status === 0
      && successPayload.valid
      && successPayload.artifactKind === "change-planning-state"
      && successPayload.schemaKey === "strict-spec-driven/schemas/change-proposal.yaml"
      && successPayload.exampleKey === "examples/strict-spec-driven/change-proposal.yaml"
      && typeof successPayload.schemaFilePath === "string",
    "a successful mutation result identifies the artifact kind, schema key, cached schema path, and example key",
    `stdout: ${successResult.stdout.trim()}`,
  );

  // An invalid category is rejected before any write, which is exactly when the caller most needs
  // the schema and example that describe the artifact it failed to produce.
  const failureResult = projectWorkspaceCli(workspaceRoot, [
    "generate",
    "identifier-probe",
    "delta-tech",
    "--target-standard",
    "probe-standard",
    "--title",
    "Probe Standard",
    "--category",
    "not-a-valid-category",
    "--operation",
    "ADDED",
    "--rule",
    "probe-rule",
    "--strength",
    "MUST",
    "--statement",
    "Probe statement.",
    "--rationale",
    "Probe rationale.",
    "--method",
    "test",
  ]);
  context.assert(
    failureResult.status !== 0
      && failureResult.stderr.includes("Artifact kind change-delta-state")
      && failureResult.stderr.includes("strict-spec-driven/schemas/delta-tech.yaml")
      && failureResult.stderr.includes("schema-show delta-tech")
      && failureResult.stderr.includes("sample-show delta-tech"),
    "a rejected mutation names the artifact kind, schema, and the asset commands that print the contract",
    `stderr: ${failureResult.stderr.trim()}`,
  );
  context.assert(
    !existsSync(path.join(workspaceRoot, ".strict-spec-driven", "changes", "identifier-probe", "tech", "probe-standard.yaml")),
    "a rejected mutation leaves no artifact behind",
  );

  // Startup synchronization recreates a merely-absent cache, so the unusable case is a regular
  // file occupying the cache root path.
  const blockedCacheRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "strict-blocked-mutation-cache-")), "cache-root");
  writeFileSync(blockedCacheRoot, "not a cache directory\n", "utf8");
  const withoutCacheFailure = cli([
    "generate",
    "identifier-probe",
    "delta-tech",
    "--target-standard",
    "probe-standard",
    "--title",
    "Probe Standard",
    "--category",
    "not-a-valid-category",
    "--operation",
    "ADDED",
    "--rule",
    "probe-rule",
    "--strength",
    "MUST",
    "--statement",
    "Probe statement.",
    "--rationale",
    "Probe rationale.",
    "--method",
    "test",
  ], {
    cwd: workspaceRoot,
    env: { STRICT_SPEC_SCHEMA_CACHE_DIR: blockedCacheRoot },
  });
  rmSync(path.dirname(blockedCacheRoot), { recursive: true, force: true });
  context.assert(
    withoutCacheFailure.status !== 0
      && withoutCacheFailure.stderr.includes("strict-spec-driven/schemas/delta-tech.yaml")
      && !withoutCacheFailure.stderr.includes("cached at"),
    "an unavailable schema cache still names the bundled schema key and omits a cached path",
    `stderr: ${withoutCacheFailure.stderr.trim()}`,
  );
} finally {
  surfaceIdentifierFixture.cleanup();
}

}
