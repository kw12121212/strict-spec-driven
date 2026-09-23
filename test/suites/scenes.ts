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

/**
 * A complete new-scene block. The block carries the sections no flow step references, because a
 * scene the archive merge assembles without them could not validate against the main scene schema.
 */
const NEW_ONBOARDING_SCENE_BLOCK = [
  "--title", "Onboarding", "--area", "accounts",
  "--actor", "Visitor", "--role", "Signs up",
  "--precondition", "The visitor has an email address",
];

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
        "--target-scene", "onboarding", ...NEW_ONBOARDING_SCENE_BLOCK,
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
        "--target-scene", "onboarding", ...NEW_ONBOARDING_SCENE_BLOCK,
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
        "--target-scene", "onboarding", ...NEW_ONBOARDING_SCENE_BLOCK,
        "--operation", "ADDED", "--step", "sign-up", "--action", "Signs up", "--no-coverage-reason", "Not specified yet",
        // A new-scene delta must supply an exception flow, because the scene it creates is checked
        // against the main scene contract, which requires at least one.
        "--exception-flow", "email-taken", "--trigger", "The email is registered",
        "--exception-step", "email-taken:explain", "--action", "The visitor is told", "--no-coverage-reason", "Copy is owned elsewhere",
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
      // The inventory declares an archived delta scene path, so archive must carry the artifact
      // there as well as merging it, and the archived copy is what keeps the merged scene traceable
      // back to the change that produced it.
      cli([
        "generate", "archived-change", "delta-scene",
        "--target-scene", "onboarding", ...NEW_ONBOARDING_SCENE_BLOCK,
        "--operation", "ADDED", "--step", "sign-up", "--action", "Signs up", "--no-coverage-reason", "Not specified yet",
        "--exception-flow", "email-taken", "--trigger", "The email is registered",
        "--exception-step", "email-taken:explain", "--action", "The visitor is told", "--no-coverage-reason", "Copy is owned elsewhere",
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
        existsSync(path.join(root, ".strict-spec-driven", "scenes", "accounts", "onboarding.yaml")),
        "archive also merges the delta scene into the recorded scene store",
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
          "--target-scene", "onboarding", ...NEW_ONBOARDING_SCENE_BLOCK,
          ...args,
        ], { cwd: root });
        context.assert(refusal.status !== 0, `${label} is refused`, refusal.stdout.trim());
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

/**
 * Authors the planning artifacts a change needs to reach verify and archive. The artifacts go in
 * through the shipped commands rather than as hand-written YAML, so a suite built on them exercises
 * the same authoring path an operator uses.
 */
function writeArchivableChange(root: string, changeName: string): void {
  cli(["propose", changeName], { cwd: root });
  cli(["generate", changeName, "proposal",
    "--what", "Exercise the scene merge", "--why", "Cover archive behavior",
    "--in", "Scene merge", "--out", "Everything else", "--unchanged", "Existing specs"], { cwd: root });
  cli(["generate", changeName, "design", "--approach", "Merge the delta scenes",
    "--decision", "merge", "--decision-text", "Merge on archive", "--rationale", "The contract says so"], { cwd: root });
  cli(["generate", changeName, "tasks",
    "--implementation", "--task", "impl", "--text", "Do the work", "--status", "complete",
    "--testing", "--task", "tests", "--text", "Run the tests", "--status", "complete",
    "--verification", "--task", "check", "--text", "Verify the result", "--status", "complete",
    "--validation-task", "tests", "--unit-test-task", "tests"], { cwd: root });
  cli(["generate", changeName, "questions",
    "--resolved", "seed", "--question", "Is the scope settled?", "--context", "Suite fixture",
    "--answer", "Yes", "--answered-by", "human"], { cwd: root });
  for (const questionId of [
    "requirement-problem", "requirement-trigger", "requirement-outcome",
    "requirement-non-goals", "requirement-interpretation",
  ]) {
    cli(["generate", changeName, "questions", "--resolve", questionId, "--answer", "Settled by the fixture", "--answered-by", "human"], { cwd: root });
  }
}

/** The arguments that author one complete new scene through a delta, ready for the archive merge. */
function newCheckoutSceneArgs(changeName: string, extra: string[] = []): string[] {
  return [
    "generate", changeName, "delta-scene", "--target-scene", "checkout",
    "--title", "Checkout", "--area", "commerce",
    "--actor", "Shopper", "--role", "Drives checkout",
    "--precondition", "A cart holds at least one item",
    "--operation", "ADDED",
    "--step", "begin", "--action", "The shopper begins", "--covered-by", "commerce-spec:payment-is-taken",
    "--exception-flow", "declined", "--trigger", "The payment is declined",
    "--exception-step", "declined:retry", "--action", "The shopper retries", "--no-coverage-reason", "Retry copy is provider-owned",
    ...extra,
  ];
}

type MergedScene = {
  actors: Array<{ name: string; role: string }>;
  preconditions: string[];
  main_flow: Record<string, { action: string; covered_by?: Array<{ spec_id: string; requirement_id: string }>; no_coverage_reason?: string }>;
  exception_flows: Record<string, { trigger: string; steps: Record<string, { action: string }> }>;
};

export async function runSceneMergeAndCoverageSuite(context: TestContext): Promise<void> {
  const yaml = await loadDistModule<YamlModule>("yaml.js");
  const readYaml = <T>(filePath: string): T => yaml.parseYamlDocument<T>(readFileSync(filePath, "utf8"));
  const scenePath = (root: string): string =>
    path.join(root, ".strict-spec-driven", "scenes", "commerce", "checkout.yaml");
  const indexPath = (root: string): string => path.join(root, ".strict-spec-driven", "scenes", "INDEX.yaml");

  context.section("Archive merge of delta scenes");

  {
    const root = makeWorkspace();
    try {
      writeMainSpec(root, "commerce-spec", ["payment-is-taken", "refund-is-issued"]);
      writeArchivableChange(root, "creates-scene");
      const generated = cli(newCheckoutSceneArgs("creates-scene"), { cwd: root });
      context.assert(generated.status === 0, "a complete new-scene delta generates", generated.stderr);

      const archived = cli(["archive", "creates-scene"], { cwd: root });
      context.assert(archived.status === 0, "archive exits zero with a delta scene to merge", archived.stderr);
      const result = JSON.parse(archived.stdout) as {
        sceneMergeSummary: Record<string, number>;
        mergedScenes: Array<{ targetScene: string; scenePath: string; created: boolean; added: number }>;
      };
      context.assert(result.sceneMergeSummary.scenesCreated === 1, "the merge summary reports one created scene");
      context.assert(result.sceneMergeSummary.added === 2, "the merge summary counts every added step", String(result.sceneMergeSummary.added));
      context.assert(
        result.mergedScenes[0]?.scenePath === ".strict-spec-driven/scenes/commerce/checkout.yaml",
        "the merge report names the canonical scene path",
        result.mergedScenes[0]?.scenePath,
      );

      context.assert(existsSync(scenePath(root)), "the merged scene is written at its canonical nested path");
      const scene = readYaml<MergedScene>(scenePath(root));
      context.assert(scene.actors[0]?.name === "Shopper", "the new-scene block's actors reach the created scene");
      context.assert(
        scene.preconditions[0] === "A cart holds at least one item",
        "the new-scene block's preconditions reach the created scene",
      );
      context.assert(scene.main_flow.begin?.action === "The shopper begins", "an added main-flow step reaches the created scene");
      context.assert(
        scene.exception_flows.declined?.steps?.retry !== undefined,
        "an added exception-flow step reaches the created scene under its flow",
      );

      const index = readYaml<{ areas: Record<string, Record<string, { title: string; status: string; path: string }>> }>(indexPath(root));
      context.assert(
        index.areas?.commerce?.checkout?.path === ".strict-spec-driven/scenes/commerce/checkout.yaml",
        "the merge regenerates the scene index with the created scene's canonical path",
      );

      // A second change over the same state must rebuild the index to byte-identical content, which
      // is the whole claim behind calling the regeneration deterministic.
      const indexBefore = readFileSync(indexPath(root), "utf8");
      writeArchivableChange(root, "second-change");
      cli(["generate", "second-change", "delta-scene", "--target-scene", "checkout",
        "--operation", "MODIFIED", "--step", "begin", "--action", "The shopper begins",
        "--covered-by", "commerce-spec:payment-is-taken"], { cwd: root });
      const second = cli(["archive", "second-change"], { cwd: root });
      context.assert(second.status === 0, "archiving a second change over merged scene state exits zero", second.stderr);
      context.assert(
        readFileSync(indexPath(root), "utf8") === indexBefore,
        "regenerating the scene index over unchanged scene identity produces byte-identical content",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      writeMainSpec(root, "commerce-spec", ["payment-is-taken", "refund-is-issued"]);
      writeArchivableChange(root, "creates-scene");
      cli(newCheckoutSceneArgs("creates-scene"), { cwd: root });
      cli(["archive", "creates-scene"], { cwd: root });

      writeArchivableChange(root, "edits-scene");
      cli(["generate", "edits-scene", "delta-scene", "--target-scene", "checkout",
        "--operation", "ADDED",
        "--step", "pay", "--action", "The shopper pays", "--covered-by", "commerce-spec:payment-is-taken",
        "--operation", "MODIFIED",
        "--step", "begin", "--action", "The shopper opens the cart", "--covered-by", "commerce-spec:refund-is-issued"], { cwd: root });
      const archived = cli(["archive", "edits-scene"], { cwd: root });
      context.assert(archived.status === 0, "archiving a delta against a recorded scene exits zero", archived.stderr);

      const scene = readYaml<MergedScene>(scenePath(root));
      context.assert(
        scene.main_flow.begin?.action === "The shopper opens the cart",
        "a step present in both takes the delta's content",
        scene.main_flow.begin?.action,
      );
      context.assert(
        Object.keys(scene.main_flow).join(",") === "begin,pay",
        "a modified step keeps its main-scene position and an added step appends in delta order",
        Object.keys(scene.main_flow).join(","),
      );
      const coverage = (scene.main_flow.begin?.covered_by ?? []).map((entry) => `${entry.spec_id}:${entry.requirement_id}`).sort();
      context.assert(
        coverage.join(",") === "commerce-spec:payment-is-taken,commerce-spec:refund-is-issued",
        "covering requirements merge as a set across the main scene and the delta",
        coverage.join(","),
      );
      context.assert(
        scene.exception_flows.declined?.steps?.retry !== undefined,
        "a step the delta never mentions survives the merge unchanged",
      );

      const result = JSON.parse(archived.stdout) as { sceneMergeSummary: Record<string, number> };
      context.assert(result.sceneMergeSummary.scenesUpdated === 1, "the merge summary reports an updated rather than created scene");
      context.assert(result.sceneMergeSummary.modified === 1, "the merge summary counts the modified step");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      writeMainSpec(root, "commerce-spec", ["payment-is-taken", "refund-is-issued"]);
      writeArchivableChange(root, "creates-scene");
      cli(newCheckoutSceneArgs("creates-scene"), { cwd: root });
      cli(["archive", "creates-scene"], { cwd: root });

      writeArchivableChange(root, "declared-rules");
      cli(["generate", "declared-rules", "delta-scene", "--target-scene", "checkout",
        "--operation", "MODIFIED",
        "--step", "absent-step", "--action", "A step the main scene never held", "--covered-by", "commerce-spec:payment-is-taken",
        "--operation", "REMOVED",
        "--step", "never-recorded", "--reason", "It was never there"], { cwd: root });
      const archived = cli(["archive", "declared-rules"], { cwd: root });
      context.assert(archived.status === 0, "the declared missing-target rules do not fail archive", archived.stderr);
      const result = JSON.parse(archived.stdout) as {
        mergedScenes: Array<{ modifiedMissingTargetAsAdded: string[]; removedMissingTargetSkipped: string[] }>;
      };
      context.assert(
        result.mergedScenes[0]?.modifiedMissingTargetAsAdded.includes("absent-step"),
        "a MODIFIED step whose target is absent is recorded as added",
      );
      context.assert(
        result.mergedScenes[0]?.removedMissingTargetSkipped.includes("never-recorded"),
        "a REMOVED step whose target is absent is recorded as a skipped removal",
      );

      writeArchivableChange(root, "adds-existing");
      cli(["generate", "adds-existing", "delta-scene", "--target-scene", "checkout",
        "--operation", "ADDED",
        "--step", "begin", "--action", "A colliding add", "--covered-by", "commerce-spec:payment-is-taken"], { cwd: root });
      const collision = cli(["archive", "adds-existing"], { cwd: root });
      context.assert(collision.status !== 0, "an ADDED step colliding with a recorded step id is refused");
      context.assert(
        collision.stderr.includes("already exists") && collision.stderr.includes("MODIFIED"),
        "the collision refusal names the runnable MODIFIED remedy",
        collision.stderr.trim(),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      writeMainSpec(root, "commerce-spec", ["payment-is-taken"]);
      writeArchivableChange(root, "missing-target");
      // The generator refuses a scene block it cannot complete, so the merge's own missing-target
      // error is reached by writing the incomplete delta the generator would never produce.
      const deltaDir = path.join(root, ".strict-spec-driven", "changes", "missing-target", "scenes", "commerce");
      mkdirSync(deltaDir, { recursive: true });
      writeFileSync(
        path.join(deltaDir, "checkout.yaml"),
        [
          "schema: strict-spec-driven/delta-scene/v1",
          "schema_version: 1",
          "artifact_type: delta_scene",
          "schema_file: templates/strict-spec-driven/schemas/delta-scene.yaml",
          "target_scene: checkout",
          "operations:",
          "  ADDED:",
          "    main_flow:",
          "      begin:",
          "        action: The shopper begins",
          "        covered_by:",
          "          - spec_id: commerce-spec",
          "            requirement_id: payment-is-taken",
          "  MODIFIED: {}",
          "  REMOVED: {}",
          "",
        ].join("\n"),
        "utf8",
      );
      const archived = cli(["archive", "missing-target"], { cwd: root });
      context.assert(archived.status !== 0, "a delta targeting an unrecorded scene with no scene block is refused");
      context.assert(
        archived.stderr.includes("does not exist") && archived.stderr.includes("scene block"),
        "the missing-target refusal explains that a scene block creates the scene",
        archived.stderr.trim(),
      );
      context.assert(!existsSync(indexPath(root)), "the refused merge leaves no scene index behind");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      writeMainSpec(root, "commerce-spec", ["payment-is-taken"]);
      writeArchivableChange(root, "conflicting-deltas");
      cli(newCheckoutSceneArgs("conflicting-deltas"), { cwd: root });
      // A second delta file for a different scene that restates one of the first scene's steps with
      // a different action is the delta-versus-delta collision the merge refuses rather than resolves.
      const deltaDir = path.join(root, ".strict-spec-driven", "changes", "conflicting-deltas", "scenes", "commerce");
      writeFileSync(
        path.join(deltaDir, "zz-also-checkout.yaml"),
        [
          "schema: strict-spec-driven/delta-scene/v1",
          "schema_version: 1",
          "artifact_type: delta_scene",
          "schema_file: templates/strict-spec-driven/schemas/delta-scene.yaml",
          "target_scene: checkout",
          "operations:",
          "  ADDED: {}",
          "  MODIFIED:",
          "    main_flow:",
          "      begin:",
          "        action: A conflicting action for the same step",
          "        covered_by:",
          "          - spec_id: commerce-spec",
          "            requirement_id: payment-is-taken",
          "  REMOVED: {}",
          "",
        ].join("\n"),
        "utf8",
      );
      const archived = cli(["archive", "conflicting-deltas"], { cwd: root });
      context.assert(archived.status !== 0, "two delta scenes stating conflicting content for one step are refused");
      for (const expected of ["checkout.yaml", "zz-also-checkout.yaml", "begin", "checkout"]) {
        context.assert(
          archived.stderr.includes(expected),
          `the conflict refusal names ${expected}`,
          archived.stderr.trim(),
        );
      }
      context.assert(!existsSync(scenePath(root)), "the refused merge writes no main scene");
      context.assert(!existsSync(indexPath(root)), "the refused merge writes no scene index");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  context.section("Scene coverage gating in ready and verify");

  {
    const root = makeWorkspace();
    try {
      writeMainSpec(root, "commerce-spec", ["payment-is-taken"]);
      writeArchivableChange(root, "unresolvable-reference");
      cli(newCheckoutSceneArgs("unresolvable-reference", [
        "--step", "pay", "--action", "The shopper pays", "--covered-by", "commerce-spec:no-such-requirement",
      ]), { cwd: root });

      const verified = cli(["verify", "unresolvable-reference"], { cwd: root });
      context.assert(verified.status !== 0, "verify exits non-zero on an unresolvable covering reference");
      const verifyDiagnostics = (JSON.parse(verified.stdout) as { diagnostics: Array<Record<string, string>> }).diagnostics;
      const gap = verifyDiagnostics.find((entry) => entry.fieldPath === "$.main_flow.pay");
      context.assert(gap !== undefined, "verify reports the gap against the step's field path");
      context.assert(
        gap?.artifactPath === ".strict-spec-driven/scenes/commerce/checkout.yaml",
        "the gap names the scene it belongs to",
        gap?.artifactPath,
      );
      context.assert(
        gap?.message.includes("commerce-spec:no-such-requirement") === true,
        "the gap names the reference that failed to resolve",
        gap?.message,
      );
      context.assert(
        gap?.message.includes("strict-spec-cli generate unresolvable-reference delta-scene --target-scene checkout") === true
        && gap?.message.includes("--step pay") === true,
        "the gap names its runnable remedy with the change, scene, and step already substituted",
        gap?.message,
      );
      context.assert(
        gap?.message.includes(".strict-spec-driven/specs/INDEX.yaml") === true,
        "the gap names the source to consult for the requirement id the author must still supply",
        gap?.message,
      );

      const readied = cli(["ready", "unresolvable-reference"], { cwd: root });
      context.assert(readied.status !== 0, "ready exits non-zero on the same coverage gap");
      const readyDiagnostics = (JSON.parse(readied.stdout) as { diagnostics: Array<Record<string, string>> }).diagnostics;
      context.assert(
        readyDiagnostics.some((entry) => entry.message === gap?.message),
        "ready and verify report the identical coverage-gap diagnostic",
      );

      const archived = cli(["archive", "unresolvable-reference"], { cwd: root });
      context.assert(archived.status !== 0, "archive refuses while a coverage gap blocks verification");
      context.assert(!existsSync(scenePath(root)), "the blocked archive merges no scene");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    // A step may cite the requirement its own change adds: archive merges specs before scenes, so
    // coverage is resolved against the main specs as the change's delta specs will leave them.
    const root = makeWorkspace();
    try {
      writeMainSpec(root, "commerce-spec", ["payment-is-taken"]);
      writeArchivableChange(root, "adds-covering-requirement");
      const addedDelta = cli([
        "generate", "adds-covering-requirement", "delta-spec", "--target-spec", "commerce-spec",
        "--operation", "ADDED", "--requirement", "receipt-is-sent", "--strength", "MUST",
        "--statement", "The system MUST send a receipt.",
        "--scenario", "receipt", "--given", "a paid order", "--when", "payment completes", "--then", "a receipt is sent",
      ], { cwd: root });
      context.assert(addedDelta.status === 0, "the covering requirement is added by the change's delta spec", addedDelta.stderr);
      const createdSpec = cli([
        "generate", "adds-covering-requirement", "delta-spec", "--target-spec", "shipping-spec",
        "--title", "Shipping", "--new-spec-path", ".strict-spec-driven/specs/shipping-spec.yaml",
        "--operation", "ADDED", "--requirement", "parcel-is-labelled", "--strength", "MUST",
        "--statement", "The system MUST label the parcel.",
        "--scenario", "label", "--given", "a paid order", "--when", "it ships", "--then", "the parcel is labelled",
      ], { cwd: root });
      context.assert(createdSpec.status === 0, "a spec the change creates is authored as a delta", createdSpec.stderr);
      cli(newCheckoutSceneArgs("adds-covering-requirement", [
        "--step", "receipt", "--action", "The shopper receives a receipt", "--covered-by", "commerce-spec:receipt-is-sent",
        "--step", "ship", "--action", "The order ships", "--covered-by", "shipping-spec:parcel-is-labelled",
      ]), { cwd: root });

      const verified = cli(["verify", "adds-covering-requirement"], { cwd: root });
      context.assert(
        verified.status === 0,
        "a step covered by a requirement the same change adds, or by one in a spec it creates, passes verify",
        verified.stdout.trim(),
      );
      const readied = cli(["ready", "adds-covering-requirement"], { cwd: root });
      context.assert(readied.status === 0, "the same references pass ready", readied.stdout.trim());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      writeMainSpec(root, "commerce-spec", ["payment-is-taken", "refund-is-issued"]);
      writeArchivableChange(root, "removes-covering-requirement");
      const removedDelta = cli([
        "generate", "removes-covering-requirement", "delta-spec", "--target-spec", "commerce-spec",
        "--operation", "REMOVED", "--requirement", "refund-is-issued", "--reason", "Refunds moved to the returns spec",
      ], { cwd: root });
      context.assert(removedDelta.status === 0, "the change's delta spec removes a recorded requirement", removedDelta.stderr);
      cli(newCheckoutSceneArgs("removes-covering-requirement", [
        "--step", "refund", "--action", "The shopper is refunded", "--covered-by", "commerce-spec:refund-is-issued",
      ]), { cwd: root });

      const verified = cli(["verify", "removes-covering-requirement"], { cwd: root });
      context.assert(verified.status !== 0, "a step covered by a requirement the same change removes fails verify");
      const gap = (JSON.parse(verified.stdout) as { diagnostics: Array<Record<string, string>> }).diagnostics
        .find((entry) => entry.fieldPath === "$.main_flow.refund");
      context.assert(
        gap?.message.includes("commerce-spec:refund-is-issued") === true,
        "the gap names the removed requirement as the reference that failed to resolve",
        gap?.message,
      );
      const readied = cli(["ready", "removes-covering-requirement"], { cwd: root });
      context.assert(readied.status !== 0, "ready refuses the same removed reference");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      writeMainSpec(root, "commerce-spec", ["payment-is-taken"]);
      writeArchivableChange(root, "waived-step");
      cli(newCheckoutSceneArgs("waived-step", [
        "--step", "browse", "--action", "The shopper browses", "--no-coverage-reason", "Browsing is covered by the catalog scene",
      ]), { cwd: root });
      const verified = cli(["verify", "waived-step"], { cwd: root });
      context.assert(verified.status === 0, "an explicit no-coverage reason passes verify", verified.stdout.trim());
      const readied = cli(["ready", "waived-step"], { cwd: root });
      const readyResult = JSON.parse(readied.stdout) as { diagnostics: Array<Record<string, string>> };
      context.assert(
        !readyResult.diagnostics.some((entry) => entry.message.includes("no-coverage reason")),
        "an explicit no-coverage reason raises no gap in ready either",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      writeMainSpec(root, "commerce-spec", ["payment-is-taken"]);
      writeArchivableChange(root, "creates-scene");
      cli(newCheckoutSceneArgs("creates-scene"), { cwd: root });
      cli(["archive", "creates-scene"], { cwd: root });

      // A recorded scene may be edited by hand, and an edit that drops a step's coverage leaves a
      // step declaring neither a requirement nor a waiver. The gate reads the merged scene state, so
      // the next change touching that scene inherits the gap rather than merging past it.
      const recorded = readFileSync(scenePath(root), "utf8")
        .replace(/    covered_by:\n      - spec_id: commerce-spec\n        requirement_id: payment-is-taken\n/, "");
      writeFileSync(scenePath(root), recorded, "utf8");

      writeArchivableChange(root, "inherits-gap");
      cli(["generate", "inherits-gap", "delta-scene", "--target-scene", "checkout",
        "--operation", "ADDED",
        "--step", "pay", "--action", "The shopper pays", "--covered-by", "commerce-spec:payment-is-taken"], { cwd: root });
      const verified = cli(["verify", "inherits-gap"], { cwd: root });
      context.assert(verified.status !== 0, "a step inherited uncovered from a targeted main scene blocks verify");
      const inherited = (JSON.parse(verified.stdout) as { diagnostics: Array<Record<string, string>> })
        .diagnostics.find((entry) => entry.fieldPath === "$.main_flow.begin");
      context.assert(
        inherited?.message.includes("names no covering requirement and no no-coverage reason") === true,
        "the inherited gap reports the step declaring neither",
        inherited?.message,
      );
      context.assert(
        inherited?.message.includes("--no-coverage-reason") === true,
        "the inherited gap names the deliberate-waiver remedy alongside the coverage remedy",
        inherited?.message,
      );

      // The same uncovered scene must not block a change that never touches it.
      writeArchivableChange(root, "untouched-scene");
      const untouched = cli(["verify", "untouched-scene"], { cwd: root });
      context.assert(
        untouched.status === 0,
        "an uncovered main scene the change never touches does not block it",
        untouched.stdout.trim(),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  {
    const root = makeWorkspace();
    try {
      writeMainSpec(root, "commerce-spec", ["payment-is-taken"]);
      writeArchivableChange(root, "plain-change");
      const verified = cli(["verify", "plain-change"], { cwd: root });
      context.assert(
        verified.status === 0,
        "a repository holding no scene observes no new diagnostic from verify",
        verified.stdout.trim(),
      );
      const readied = cli(["ready", "plain-change"], { cwd: root });
      const diagnostics = (JSON.parse(readied.stdout) as { diagnostics: Array<Record<string, string>> }).diagnostics;
      context.assert(
        !diagnostics.some((entry) => entry.message.includes("scene")),
        "a repository holding no scene observes no new diagnostic from ready either",
        JSON.stringify(diagnostics),
      );
      context.assert(!existsSync(path.join(root, ".strict-spec-driven", "scenes")), "no scene directory is created");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  context.section("New-scene delta block completeness");

  {
    const root = makeWorkspace();
    try {
      for (const [label, extra, expected] of [
        ["a scene block with no actor", ["--title", "Checkout", "--area", "commerce", "--precondition", "A cart exists"], "--actor"],
        ["a scene block with no precondition", ["--title", "Checkout", "--area", "commerce", "--actor", "Shopper", "--role", "Buys"], "--precondition"],
        ["an actor with no role", ["--title", "Checkout", "--area", "commerce", "--actor", "Shopper", "--precondition", "A cart exists"], "role"],
      ] as Array<[string, string[], string]>) {
        const refused = cli([
          "generate", "incomplete-block", "delta-scene", "--target-scene", "checkout", ...extra,
          "--operation", "ADDED", "--step", "begin", "--action", "a", "--no-coverage-reason", "n",
        ], { cwd: root });
        context.assert(refused.status !== 0, `${label} is refused`, refused.stdout.trim());
        context.assert(
          refused.stderr.includes(expected),
          `${label} names ${expected} in its refusal`,
          refused.stderr.trim(),
        );
      }
      context.assert(
        !existsSync(path.join(root, ".strict-spec-driven", "changes", "incomplete-block", "scenes")),
        "a refused new-scene delta leaves no delta scene behind",
      );

      // Actors and preconditions belong to the scene, not to any flow step, so a delta may supply
      // them only for a scene it creates; a recorded scene's own edit path owns them instead.
      writeMainSpec(root, "commerce-spec", ["payment-is-taken"]);
      writeArchivableChange(root, "creates-scene");
      cli(newCheckoutSceneArgs("creates-scene"), { cwd: root });
      cli(["archive", "creates-scene"], { cwd: root });
      const refusedRestatement = cli([
        "generate", "later-change", "delta-scene", "--target-scene", "checkout",
        "--actor", "Courier", "--role", "Delivers",
        "--operation", "MODIFIED", "--step", "begin", "--action", "a", "--no-coverage-reason", "n",
      ], { cwd: root });
      context.assert(refusedRestatement.status !== 0, "a delta restating a recorded scene's actors is refused");
      context.assert(
        refusedRestatement.stderr.includes("strict-spec-cli scene-edit checkout"),
        "the refusal names the command that owns a recorded scene's actors and preconditions",
        refusedRestatement.stderr.trim(),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

/**
 * A merged scene that cannot validate must be reported by verify, not discovered inside archive.
 * Archive merges specs and standards before scenes, so a refusal raised there would leave the
 * repository holding merged specs with the change still active.
 */
export async function runSceneMergeValiditySuite(context: TestContext): Promise<void> {
  context.section("Merged scene validity is a verify diagnostic");

  const root = makeWorkspace();
  try {
    writeMainSpec(root, "commerce-spec", ["payment-is-taken"]);
    writeArchivableChange(root, "creates-scene");
    cli(newCheckoutSceneArgs("creates-scene"), { cwd: root });
    cli(["archive", "creates-scene"], { cwd: root });

    const specBefore = readFileSync(path.join(root, ".strict-spec-driven", "specs", "commerce-spec.yaml"), "utf8");
    writeArchivableChange(root, "empties-flow");
    cli(["generate", "empties-flow", "delta-spec", "--target-spec", "commerce-spec",
      "--operation", "ADDED", "--requirement", "cart-is-restored", "--strength", "MUST",
      "--statement", "The system MUST restore the cart after a decline.",
      "--scenario", "only", "--given", "a decline", "--when", "the shopper returns", "--then", "the cart is intact"], { cwd: root });
    // Removing the exception flow's only step empties a container the scene contract requires.
    cli(["generate", "empties-flow", "delta-scene", "--target-scene", "checkout",
      "--operation", "REMOVED", "--exception-step", "declined:retry", "--reason", "Retry moved to the cart"], { cwd: root });

    const verified = cli(["verify", "empties-flow"], { cwd: root });
    context.assert(verified.status !== 0, "verify reports a merge that would leave the scene invalid");
    const diagnostics = (JSON.parse(verified.stdout) as { diagnostics: Array<Record<string, string>> }).diagnostics;
    const invalid = diagnostics.find((entry) => entry.message.includes("would leave scene 'checkout' invalid"));
    context.assert(invalid !== undefined, "the diagnostic names the scene the merge would invalidate", JSON.stringify(diagnostics));
    context.assert(
      invalid?.message.includes("strict-spec-cli generate empties-flow delta-scene --target-scene checkout") === true,
      "the diagnostic names the runnable remedy with the change and scene already substituted",
      invalid?.message,
    );

    const archived = cli(["archive", "empties-flow"], { cwd: root });
    context.assert(archived.status !== 0, "archive refuses the change rather than merging it halfway");
    context.assert(
      readFileSync(path.join(root, ".strict-spec-driven", "specs", "commerce-spec.yaml"), "utf8") === specBefore,
      "the refused archive leaves the main specs untouched rather than half-merged",
    );
    context.assert(
      existsSync(path.join(root, ".strict-spec-driven", "changes", "empties-flow")),
      "the refused archive leaves the change active",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
