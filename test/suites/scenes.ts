import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { cli, loadDistModule, TestContext, type CommandResult, type YamlModule } from "../support/harness.js";

function makeWorkspace(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-scenes-"));
  mkdirSync(path.join(root, ".strict-spec-driven"), { recursive: true });
  writeFileSync(
    path.join(root, ".strict-spec-driven", "config.yaml"),
    [
      "schema: strict-spec-driven/config/v1",
      "schema_version: 1",
      "artifact_type: workflow_config",
      "preferred_human_language: English",
      "context: scene suite workspace",
      "",
    ].join("\n"),
    "utf8",
  );
  return root;
}

/** Writes a main spec the coverage resolver can resolve references against. */
function writeMainSpec(root: string, specId: string, requirementIds: readonly string[]): void {
  const specsDir = path.join(root, ".strict-spec-driven", "specs");
  mkdirSync(specsDir, { recursive: true });
  const requirements = requirementIds.flatMap((requirementId) => [
    `  ${requirementId}:`,
    "    strength: MUST",
    `    statement: The system MUST satisfy ${requirementId}.`,
    "    scenarios:",
    "      only-scenario:",
    "        - GIVEN: a precondition",
    "        - WHEN: an action happens",
    "        - THEN: an outcome is observable",
  ]);
  writeFileSync(
    path.join(specsDir, `${specId}.yaml`),
    [
      "schema: strict-spec-driven/main-spec/v1",
      "schema_version: 1",
      "artifact_type: main_spec",
      "schema_file: templates/strict-spec-driven/schemas/main-spec.yaml",
      "spec:",
      `  id: ${specId}`,
      `  title: ${specId}`,
      "requirements:",
      ...requirements,
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(specsDir, "INDEX.yaml"),
    [
      "schema: strict-spec-driven/spec-index/v1",
      "schema_version: 1",
      "artifact_type: spec_index",
      "schema_file: templates/strict-spec-driven/schemas/spec-index.yaml",
      "specs:",
      `  - id: ${specId}`,
      `    title: ${specId}`,
      `    path: .strict-spec-driven/specs/${specId}.yaml`,
      "",
    ].join("\n"),
    "utf8",
  );
}

/** A complete scene creation: the contract requires actors, preconditions, and both flow kinds. */
function createSceneArgs(sceneId: string, area: string, extra: string[] = []): string[] {
  return [
    "scene-edit", sceneId,
    "--title", `Scene ${sceneId}`,
    "--area", area,
    "--actor", "Operator", "--role", "Drives the flow",
    "--precondition", "The workspace exists",
    "--step", "begin", "--action", "The operator begins", "--no-coverage-reason", "Not specified yet",
    "--exception-flow", "failure", "--trigger", "The flow fails",
    "--exception-step", "failure:recover", "--action", "The operator recovers", "--no-coverage-reason", "Not specified yet",
    ...extra,
  ];
}

function parseJson(result: CommandResult): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

export async function runScenesSuite(context: TestContext): Promise<void> {
  const yaml = await loadDistModule<YamlModule>("yaml.js");
  const readYaml = <T>(filePath: string): T => yaml.parseYamlDocument<T>(readFileSync(filePath, "utf8"));

  context.section("Scene authoring command");

  {
    const root = makeWorkspace();
    try {
      const created = cli(createSceneArgs("checkout", "commerce"), { cwd: root });
      context.assert(created.status === 0, "creating a scene exits zero", created.stderr);

      const scenePath = path.join(root, ".strict-spec-driven", "scenes", "commerce", "checkout.yaml");
      context.assert(existsSync(scenePath), "the scene is written at its canonical nested path");

      const indexPath = path.join(root, ".strict-spec-driven", "scenes", "INDEX.yaml");
      context.assert(existsSync(indexPath), "the first scene write creates the scene index");
      const index = readYaml<{ areas: Record<string, Record<string, { title: string; status: string; path: string }>> }>(indexPath);
      const entry = index.areas?.commerce?.checkout;
      context.assert(entry !== undefined, "the index groups the scene under its area");
      context.assert(
        entry?.path === ".strict-spec-driven/scenes/commerce/checkout.yaml",
        "the index entry records the scene's canonical path",
        entry?.path,
      );
      context.assert(entry?.status === "draft", "creation defaults the scene status to draft", entry?.status);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      // A step declaring neither coverage nor a waiver is the hole the contract exists to close,
      // and the rejection must leave nothing behind for the transaction to be worth anything.
      const rejected = cli([
        "scene-edit", "broken",
        "--title", "Broken", "--area", "commerce",
        "--actor", "Operator", "--role", "Drives the flow",
        "--precondition", "The workspace exists",
        "--step", "begin", "--action", "The operator begins",
        "--exception-flow", "failure", "--trigger", "The flow fails",
        "--exception-step", "failure:recover", "--action", "Recovers", "--no-coverage-reason", "n",
      ], { cwd: root });
      context.assert(rejected.status !== 0, "a step with neither coverage nor a waiver is refused");
      context.assert(
        !existsSync(path.join(root, ".strict-spec-driven", "scenes", "commerce", "broken.yaml")),
        "the refused write leaves no scene file behind",
      );
      context.assert(
        !existsSync(path.join(root, ".strict-spec-driven", "scenes", "INDEX.yaml")),
        "the refused write leaves no orphaned scene index behind",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      cli(createSceneArgs("checkout", "commerce", [
        "--step", "pay", "--action", "The operator pays", "--covered-by", "commerce-spec:payment-is-taken",
        "--actor", "Gateway", "--role", "Authorizes",
        "--precondition", "A card is on file",
      ]), { cwd: root });

      const scenePath = path.join(root, ".strict-spec-driven", "scenes", "commerce", "checkout.yaml");
      const edited = cli(["scene-edit", "checkout", "--step", "pay", "--action", "The operator pays by card"], { cwd: root });
      context.assert(edited.status === 0, "a text-only step edit exits zero", edited.stderr);

      type Scene = {
        actors: Array<{ name: string }>;
        preconditions: string[];
        main_flow: Record<string, { action: string; covered_by?: Array<{ spec_id: string; requirement_id: string }> }>;
      };
      const scene = readYaml<Scene>(scenePath);
      context.assert(scene.main_flow.pay?.action === "The operator pays by card", "the named step action is replaced");
      context.assert(
        scene.main_flow.pay?.covered_by?.[0]?.requirement_id === "payment-is-taken",
        "a text-only step edit preserves the step's covering references",
      );
      context.assert(
        Object.keys(scene.main_flow).join(",") === "begin,pay",
        "a text-only step edit preserves step order",
        Object.keys(scene.main_flow).join(","),
      );
      context.assert(scene.actors.length === 2, "a step edit leaves the recorded actors untouched");

      const removed = cli(["scene-edit", "checkout", "--remove-actor", "Gateway"], { cwd: root });
      context.assert(removed.status === 0, "removing a named actor exits zero", removed.stderr);
      const afterRemoval = readYaml<Scene>(scenePath);
      context.assert(
        afterRemoval.actors.length === 1 && afterRemoval.actors[0]?.name === "Operator",
        "named actor removal drops only the identified actor",
      );
      context.assert(afterRemoval.preconditions.length === 2, "named actor removal leaves the preconditions untouched");
      context.assert(
        Object.keys(afterRemoval.main_flow).join(",") === "begin,pay",
        "named actor removal leaves every flow step untouched",
      );

      const stepRemoved = cli(["scene-edit", "checkout", "--remove-step", "pay"], { cwd: root });
      context.assert(stepRemoved.status === 0, "removing a named main-flow step exits zero", stepRemoved.stderr);
      context.assert(
        Object.keys(readYaml<Scene>(scenePath).main_flow).join(",") === "begin",
        "named step removal drops exactly one step",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      cli(createSceneArgs("checkout", "commerce"), { cwd: root });
      const moved = cli(["scene-edit", "checkout", "--area", "support"], { cwd: root });
      context.assert(moved.status !== 0, "an edit may not move a scene to another area");
      context.assert(
        existsSync(path.join(root, ".strict-spec-driven", "scenes", "commerce", "checkout.yaml")),
        "the refused area change leaves the scene at its recorded path",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      cli(createSceneArgs("first", "alpha"), { cwd: root });
      cli(createSceneArgs("second", "beta"), { cwd: root });

      const refused = cli(["scene-edit", "second", "--delete", "--title", "Renamed"], { cwd: root });
      context.assert(refused.status !== 0, "--delete is refused alongside an editing flag");
      context.assert(
        existsSync(path.join(root, ".strict-spec-driven", "scenes", "beta", "second.yaml")),
        "the refused delete leaves the scene in place",
      );

      const deleted = cli(["scene-edit", "second", "--delete"], { cwd: root });
      context.assert(deleted.status === 0, "deleting a scene exits zero", deleted.stderr);
      context.assert(
        !existsSync(path.join(root, ".strict-spec-driven", "scenes", "beta", "second.yaml")),
        "deleting a scene removes its file",
      );
      context.assert(
        !existsSync(path.join(root, ".strict-spec-driven", "scenes", "beta")),
        "deleting the last scene of an area removes the emptied area directory",
      );
      const index = readYaml<{ areas: Record<string, unknown> }>(
        path.join(root, ".strict-spec-driven", "scenes", "INDEX.yaml"),
      );
      context.assert(
        Object.keys(index.areas).join(",") === "alpha",
        "deleting a scene removes its index entry and keeps its siblings",
        Object.keys(index.areas).join(","),
      );

      const lastDeleted = cli(["scene-edit", "first", "--delete"], { cwd: root });
      context.assert(lastDeleted.status === 0, "deleting the last scene exits zero", lastDeleted.stderr);
      context.assert(
        !existsSync(path.join(root, ".strict-spec-driven", "scenes", "INDEX.yaml")),
        "deleting the last recorded scene removes the scene index rather than leaving it empty",
      );
      context.assert(
        !existsSync(path.join(root, ".strict-spec-driven", "scenes")),
        "deleting the last recorded scene leaves no empty scene container",
      );

      const missing = cli(["scene-edit", "first", "--delete"], { cwd: root });
      context.assert(missing.status !== 0, "deleting an absent scene is refused");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      const noFlow = cli([
        "scene-edit", "checkout", "--title", "Checkout", "--area", "commerce",
        "--exception-step", "ghost:step", "--action", "Acts", "--no-coverage-reason", "n",
      ], { cwd: root });
      context.assert(noFlow.status !== 0, "a step in an undeclared exception flow is refused");
      context.assert(
        noFlow.stderr.includes("--exception-flow"),
        "the refusal names the argument that declares the exception flow",
        noFlow.stderr.trim(),
      );

      const unpaired = cli(createSceneArgs("checkout", "commerce", ["--actor", "Lonely"]), { cwd: root });
      context.assert(unpaired.status !== 0, "an --actor without a paired --role is refused");

      const badId = cli(createSceneArgs("Not_Kebab", "commerce"), { cwd: root });
      context.assert(badId.status !== 0, "a scene id that is not kebab-case is refused");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      cli(createSceneArgs("checkout", "commerce"), { cwd: root });
      // The area key is also the subdirectory name, so a store where the two disagree cannot have a
      // correct index rebuilt from it. A write that reconciled around it would enter a path that
      // does not exist, so the command refuses instead.
      const scenePath = path.join(root, ".strict-spec-driven", "scenes", "commerce", "checkout.yaml");
      const before = readFileSync(scenePath, "utf8");
      writeFileSync(scenePath, before.replace("area: commerce", "area: support"), "utf8");

      const status = cli(["scene-status"], { cwd: root });
      context.assert(status.status !== 0, "a scene whose area disagrees with its directory is reported by scene-status");
      context.assert(
        status.stdout.includes("subdirectory name"),
        "the mismatch diagnostic explains that the area is the scene's subdirectory name",
        status.stdout.trim(),
      );

      const blocked = cli(["scene-edit", "checkout", "--status", "active"], { cwd: root });
      context.assert(blocked.status !== 0, "a write is refused while a recorded scene's area disagrees with its directory");
      context.assert(
        readFileSync(scenePath, "utf8") === before.replace("area: commerce", "area: support"),
        "the refused write leaves the misplaced scene byte-identical",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  context.section("Scene status command");

  {
    const root = makeWorkspace();
    try {
      writeMainSpec(root, "commerce-spec", ["payment-is-taken"]);
      cli(createSceneArgs("checkout", "commerce", [
        "--step", "pay", "--action", "The operator pays", "--covered-by", "commerce-spec:payment-is-taken",
        "--step", "notify", "--action", "The operator is notified", "--covered-by", "commerce-spec:nonexistent-requirement",
      ]), { cwd: root });
      cli(createSceneArgs("refund", "support"), { cwd: root });

      type Status = {
        valid: boolean;
        sceneCount: number;
        areas: string[];
        coverageCounts: Record<string, number>;
        scenes: Array<{
          id: string;
          steps: Array<{
            flow: string;
            stepId: string;
            state: string;
            noCoverageReason?: string;
            coveredBy: Array<{ spec_id: string; requirement_id: string; resolved: boolean }>;
          }>;
        }>;
      };

      const all = cli(["scene-status"], { cwd: root });
      context.assert(all.status === 0, "scene-status exits zero with an unresolved reference recorded", all.stderr);
      const report = JSON.parse(all.stdout) as Status;
      context.assert(report.sceneCount === 2, "scene-status reports every recorded scene", String(report.sceneCount));

      const checkout = report.scenes.find((scene) => scene.id === "checkout");
      const byId = new Map((checkout?.steps ?? []).map((step) => [step.stepId, step]));
      context.assert(byId.get("pay")?.state === "covered", "a step whose references resolve is reported as covered");
      context.assert(
        byId.get("begin")?.state === "waived" && byId.get("begin")?.noCoverageReason !== undefined,
        "a step carrying an explicit reason is reported as waived with that reason",
      );
      context.assert(
        byId.get("notify")?.state === "unresolved",
        "a step naming a requirement no spec holds is reported as unresolved",
        byId.get("notify")?.state,
      );
      context.assert(
        byId.get("notify")?.coveredBy[0]?.resolved === false,
        "the unresolved reference itself is reported as unresolved",
      );
      context.assert(
        byId.get("recover")?.flow === "failure",
        "exception-flow steps are reported under their flow id",
        byId.get("recover")?.flow,
      );
      context.assert(
        report.coverageCounts.unresolved === 1 && report.coverageCounts.covered === 1,
        "coverage counts aggregate every step state",
        JSON.stringify(report.coverageCounts),
      );

      const byArea = cli(["scene-status", "--area", "support"], { cwd: root });
      context.assert(byArea.status === 0, "narrowing by area exits zero", byArea.stderr);
      const areaReport = JSON.parse(byArea.stdout) as Status;
      context.assert(
        areaReport.sceneCount === 1 && areaReport.scenes[0]?.id === "refund",
        "narrowing by area reports only that area's scenes",
      );
      context.assert(
        areaReport.areas.join(",") === "commerce,support",
        "narrowing still reports every recorded area so the caller can widen",
        areaReport.areas.join(","),
      );

      const byScene = cli(["scene-status", "--scene", "checkout"], { cwd: root });
      const sceneReport = JSON.parse(byScene.stdout) as Status;
      context.assert(
        byScene.status === 0 && sceneReport.sceneCount === 1 && sceneReport.scenes[0]?.id === "checkout",
        "narrowing by scene reports only that scene",
      );

      const unmatchedArea = cli(["scene-status", "--area", "absent"], { cwd: root });
      context.assert(unmatchedArea.status !== 0, "an area matching no scene exits non-zero");
      context.assert(
        unmatchedArea.stdout.includes("commerce") && unmatchedArea.stdout.includes("support"),
        "the unmatched-area diagnostic names the recorded areas",
      );

      const unmatchedScene = cli(["scene-status", "--scene", "absent"], { cwd: root });
      context.assert(unmatchedScene.status !== 0, "a scene id matching no scene exits non-zero");
      context.assert(
        unmatchedScene.stdout.includes("checkout"),
        "the unmatched-scene diagnostic names the recorded scenes",
      );

      const before = readFileSync(path.join(root, ".strict-spec-driven", "scenes", "INDEX.yaml"), "utf8");
      cli(["scene-status"], { cwd: root });
      context.assert(
        readFileSync(path.join(root, ".strict-spec-driven", "scenes", "INDEX.yaml"), "utf8") === before,
        "scene-status mutates nothing",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      const empty = cli(["scene-status"], { cwd: root });
      context.assert(empty.status === 0, "a project holding no scene reports cleanly", empty.stderr);
      const report = parseJson(empty);
      context.assert(report.sceneCount === 0, "a project holding no scene reports no scene");
      context.assert(
        Array.isArray(report.diagnostics) && (report.diagnostics as unknown[]).length === 0,
        "a project holding no scene observes no new diagnostic",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  context.section("Change-level delta scene generation");

  {
    const root = makeWorkspace();
    try {
      const created = cli([
        "generate", "sample-change", "delta-scene",
        "--target-scene", "onboarding", "--title", "Onboarding", "--area", "accounts",
        "--operation", "ADDED",
        "--step", "sign-up", "--action", "The visitor signs up", "--covered-by", "accounts-spec:sign-up-is-accepted",
        "--exception-flow", "email-taken", "--trigger", "The email is registered",
        "--exception-step", "email-taken:explain", "--action", "The visitor is told", "--no-coverage-reason", "Copy is owned elsewhere",
      ], { cwd: root });
      context.assert(created.status === 0, "generating a delta scene exits zero", created.stderr);
      const result = parseJson(created);
      context.assert(
        result.artifactPath === ".strict-spec-driven/changes/sample-change/scenes/accounts/onboarding.yaml",
        "the delta scene is written at the area-and-id path beneath the change",
        String(result.artifactPath),
      );

      const deltaPath = path.join(root, ".strict-spec-driven", "changes", "sample-change", "scenes", "accounts", "onboarding.yaml");
      type Delta = {
        target_scene: string;
        scene?: { title: string; area: string };
        operations: Record<string, {
          main_flow?: Record<string, Record<string, unknown>>;
          exception_flows?: Record<string, { trigger?: string; steps?: Record<string, Record<string, unknown>> }>;
        }>;
      };
      const delta = readYaml<Delta>(deltaPath);
      context.assert(delta.target_scene === "onboarding", "the delta records its target scene");
      context.assert(delta.scene?.area === "accounts", "a new-scene delta records the title and area block");
      context.assert(
        delta.operations.ADDED?.main_flow?.["sign-up"] !== undefined,
        "a main-flow step is addressed under main_flow in its operation group",
      );
      context.assert(
        delta.operations.ADDED?.exception_flows?.["email-taken"]?.steps?.explain !== undefined,
        "an exception-flow step is addressed under its named flow in its operation group",
      );
      context.assert(
        delta.operations.MODIFIED !== undefined && delta.operations.REMOVED !== undefined,
        "every operation group is declared even when empty",
      );

      const before = readFileSync(deltaPath, "utf8");
      const repeated = cli([
        "generate", "sample-change", "delta-scene",
        "--target-scene", "onboarding", "--title", "Onboarding", "--area", "accounts",
        "--operation", "ADDED",
        "--step", "sign-up", "--action", "The visitor signs up", "--covered-by", "accounts-spec:sign-up-is-accepted",
      ], { cwd: root });
      context.assert(repeated.status === 0, "restating equivalent delta scene content exits zero", repeated.stderr);
      context.assert(readFileSync(deltaPath, "utf8") === before, "restating equivalent delta scene content is idempotent");

      const removedStep = cli([
        "generate", "sample-change", "delta-scene",
        "--target-scene", "onboarding", "--operation", "REMOVED",
        "--step", "legacy-captcha", "--reason", "The captcha step was retired",
      ], { cwd: root });
      context.assert(removedStep.status === 0, "a delta scene can retire a step", removedStep.stderr);
      context.assert(
        readYaml<Delta>(deltaPath).operations.REMOVED?.main_flow?.["legacy-captcha"]?.reason !== undefined,
        "the retired step records its reason",
      );

      // Both step maps require at least one entry, so a removal that empties one must take the
      // container with it or the delta's own schema refuses the next write.
      const dropped = cli([
        "generate", "sample-change", "delta-scene", "--target-scene", "onboarding", "--remove-step", "legacy-captcha",
      ], { cwd: root });
      context.assert(dropped.status === 0, "removing the last step of a flow exits zero", dropped.stderr);
      context.assert(
        readYaml<Delta>(deltaPath).operations.REMOVED?.main_flow === undefined,
        "removing the last step of a flow removes the emptied flow container",
      );

      const droppedException = cli([
        "generate", "sample-change", "delta-scene", "--target-scene", "onboarding", "--remove-step", "email-taken:explain",
      ], { cwd: root });
      context.assert(droppedException.status === 0, "removing the last exception-flow step exits zero", droppedException.stderr);
      context.assert(
        readYaml<Delta>(deltaPath).operations.ADDED?.exception_flows === undefined,
        "removing the last step of an exception flow removes the emptied flow",
      );

      const deleted = cli([
        "generate", "sample-change", "delta-scene", "--target-scene", "onboarding", "--delete",
      ], { cwd: root });
      context.assert(deleted.status === 0, "deleting a delta scene exits zero", deleted.stderr);
      context.assert(!existsSync(deltaPath), "deleting a delta scene removes its file");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      cli([
        "generate", "verified-change", "delta-scene",
        "--target-scene", "onboarding", "--title", "Onboarding", "--area", "accounts",
        "--operation", "ADDED", "--step", "sign-up", "--action", "Signs up", "--no-coverage-reason", "Not specified yet",
      ], { cwd: root });
      const deltaPath = path.join(root, ".strict-spec-driven", "changes", "verified-change", "scenes", "accounts", "onboarding.yaml");

      const cleanVerify = cli(["verify", "verified-change"], { cwd: root });
      const cleanScenePaths = (JSON.parse(cleanVerify.stdout) as { diagnostics: Array<{ artifactPath: string }> })
        .diagnostics.filter((diagnostic) => diagnostic.artifactPath.includes("/scenes/"));
      context.assert(
        cleanScenePaths.length === 0,
        "verify reports no scene diagnostic for a valid delta scene",
        JSON.stringify(cleanScenePaths),
      );

      // Without this, a delta scene would be validated only by the command that wrote it, so a
      // hand-damaged one would reach archive unchecked.
      writeFileSync(deltaPath, readFileSync(deltaPath, "utf8").replace("artifact_type: delta_scene", "artifact_type: bogus"), "utf8");
      const damagedVerify = cli(["verify", "verified-change"], { cwd: root });
      const damagedSceneDiagnostics = (JSON.parse(damagedVerify.stdout) as {
        diagnostics: Array<{ artifactPath: string; fieldPath: string }>;
      }).diagnostics.filter((diagnostic) => diagnostic.artifactPath.includes("/scenes/"));
      context.assert(
        damagedVerify.status !== 0 && damagedSceneDiagnostics.some((diagnostic) => diagnostic.fieldPath === "$.artifact_type"),
        "verify schema-validates a change's delta scene and names the offending field",
        JSON.stringify(damagedSceneDiagnostics),
      );

      writeFileSync(deltaPath, "target_scene: [\n", "utf8");
      const unparseableVerify = cli(["verify", "verified-change"], { cwd: root });
      context.assert(
        unparseableVerify.status !== 0
          && unparseableVerify.stdout.includes("delta scene is not valid YAML"),
        "verify reports an unparseable delta scene rather than skipping it",
        unparseableVerify.stdout.slice(0, 300),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      // The inventory declares an archived delta scene path, so archive must actually carry the
      // artifact there. Merging it into a main scene is a later change's scope, and the absence of
      // a main scene here is what keeps that boundary honest rather than assumed.
      cli([
        "generate", "archived-change", "delta-scene",
        "--target-scene", "onboarding", "--title", "Onboarding", "--area", "accounts",
        "--operation", "ADDED", "--step", "sign-up", "--action", "Signs up", "--no-coverage-reason", "Not specified yet",
      ], { cwd: root });
      cli(["generate", "archived-change", "proposal", "--what", "w", "--why", "y"], { cwd: root });
      cli(["generate", "archived-change", "design", "--approach", "a"], { cwd: root });
      cli([
        "generate", "archived-change", "tasks",
        "--testing", "--task", "t1", "--text", "test", "--command", "true",
        "--validation-task", "t1", "--unit-test-task", "t1",
      ], { cwd: root });
      cli(["generate", "archived-change", "tasks", "--implementation", "--task", "i1", "--text", "implement", "--status", "complete"], { cwd: root });
      cli(["generate", "archived-change", "tasks", "--verification", "--task", "v1", "--text", "verify", "--status", "complete"], { cwd: root });
      cli(["generate", "archived-change", "tasks", "--testing", "--task", "t1", "--status", "complete"], { cwd: root });
      for (const questionId of [
        "requirement-problem", "requirement-outcome", "requirement-trigger",
        "requirement-non-goals", "requirement-interpretation",
      ]) {
        cli([
          "generate", "archived-change", "questions",
          "--resolve", questionId, "--answer", "answered by the requester", "--answered-by", "human",
        ], { cwd: root });
      }

      const archived = cli(["archive", "archived-change"], { cwd: root });
      context.assert(
        archived.status === 0,
        "a change carrying a delta scene archives",
        `${archived.stdout.slice(0, 300)} ${archived.stderr.slice(0, 300)}`,
      );
      const destination = archived.status === 0
        ? (JSON.parse(archived.stdout) as { archiveDestination: string }).archiveDestination
        : "";
      context.assert(
        existsSync(path.join(root, destination, "scenes", "accounts", "onboarding.yaml")),
        "archive carries the delta scene to the archived change rather than dropping it",
        destination,
      );
      context.assert(
        !existsSync(path.join(root, ".strict-spec-driven", "scenes")),
        "archive does not merge a delta scene into a main scene, which is a later change's scope",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      const rejected = cli([
        "generate", "fresh-change", "delta-scene",
        "--target-scene", "unrecorded",
        "--operation", "ADDED", "--step", "s", "--action", "a", "--no-coverage-reason", "n",
      ], { cwd: root });
      context.assert(rejected.status !== 0, "a delta scene targeting an unrecorded scene without the new-scene block is refused");
      context.assert(
        !existsSync(path.join(root, ".strict-spec-driven", "changes", "fresh-change")),
        "a rejected first delta scene write leaves no change container behind",
      );

      for (const [label, args] of [
        ["a step declaring neither coverage nor a waiver", ["--operation", "ADDED", "--step", "s", "--action", "a"]],
        ["a step declaring both coverage and a waiver", ["--operation", "ADDED", "--step", "s", "--action", "a", "--covered-by", "x:y", "--no-coverage-reason", "n"]],
        ["an added step with no action", ["--operation", "ADDED", "--step", "s", "--no-coverage-reason", "n"]],
        ["a removed step carrying an action", ["--operation", "REMOVED", "--step", "s", "--reason", "r", "--action", "a"]],
        ["a removed step with no reason", ["--operation", "REMOVED", "--step", "s"]],
        ["an unknown operation name", ["--operation", "RENAMED", "--step", "s", "--action", "a", "--no-coverage-reason", "n"]],
        ["a step field with no open step", ["--operation", "ADDED", "--action", "a"]],
        ["a trigger with no exception flow", ["--operation", "ADDED", "--trigger", "t"]],
      ] as Array<[string, string[]]>) {
        const refusal = cli([
          "generate", "refusal-change", "delta-scene",
          "--target-scene", "onboarding", "--title", "Onboarding", "--area", "accounts",
          ...args,
        ], { cwd: root });
        context.assert(refusal.status !== 0, `${label} is refused`, refusal.stdout.trim());
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
