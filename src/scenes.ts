import { existsSync, readdirSync, rmdirSync, statSync } from "fs";
import path from "path";
import { parseYamlFile } from "./yaml.js";
import { loadBundledSchemaByArtifactType, validateArtifact, type ValidationDiagnostic } from "./validation.js";
import { commitYamlMutation, type YamlMutationResult, type YamlMutationValidationIssue } from "./yaml-mutation.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const SCENES_ROOT = `${STRICT_WORKFLOW_DIR}/scenes`;
const SCENES_INDEX_PATH = `${SCENES_ROOT}/INDEX.yaml`;
const SPEC_INDEX_PATH = `${STRICT_WORKFLOW_DIR}/specs/INDEX.yaml`;
const SCENE_SCHEMA_ID = "strict-spec-driven/scene/v1";
const SCENES_INDEX_SCHEMA_ID = "strict-spec-driven/scenes-index/v1";
const SCENE_SCHEMA_FILE = "templates/strict-spec-driven/schemas/scene.yaml";
const SCENES_INDEX_SCHEMA_FILE = "templates/strict-spec-driven/schemas/scenes-index.yaml";
const KEBAB_CASE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export type SceneLifecycleStatus = "draft" | "active" | "obsolete";
export type SceneCoverageRef = { spec_id: string; requirement_id: string };
export type SceneActor = { name: string; role: string };
export type SceneFlowStep = {
  action: string;
  covered_by?: SceneCoverageRef[];
  no_coverage_reason?: string;
};
export type SceneExceptionFlow = { trigger: string; steps: Record<string, SceneFlowStep> };

export type SceneArtifact = {
  schema: string;
  schema_version: number;
  artifact_type: string;
  schema_file: string;
  scene: { id: string; title: string };
  area: string;
  status: SceneLifecycleStatus;
  actors: SceneActor[];
  preconditions: string[];
  main_flow: Record<string, SceneFlowStep>;
  exception_flows: Record<string, SceneExceptionFlow>;
};

type SceneIndexEntry = { title: string; status: SceneLifecycleStatus; path: string };
type ScenesIndexArtifact = {
  schema: string;
  schema_version: number;
  artifact_type: string;
  schema_file: string;
  areas: Record<string, Record<string, SceneIndexEntry>>;
};

/** A step edit addresses the main flow by default, or one exception flow when `exceptionFlow` is set. */
export type SceneStepInput = {
  id: string;
  exceptionFlow?: string;
  action?: string;
  coveredBy: SceneCoverageRef[];
  removeCoverage: SceneCoverageRef[];
  noCoverageReason?: string;
};

export type SceneAuthorInput = {
  id: string;
  title?: string;
  area?: string;
  status?: string;
  actors: SceneActor[];
  preconditions: string[];
  exceptionFlows: Array<{ id: string; trigger: string }>;
  steps: SceneStepInput[];
  removeActors: string[];
  removePreconditions: string[];
  removeExceptionFlows: string[];
  /** `step-id` addresses the main flow; `flow-id:step-id` addresses one exception flow's step. */
  removeSteps: string[];
  delete: boolean;
};

export type SceneAuthorResult = YamlMutationResult & {
  sceneId: string;
  artifactPath: string | null;
  indexPath: string;
  operation: "create" | "update" | "delete";
};

export type SceneCoverageState = "covered" | "waived" | "unresolved";

export type SceneStepCoverage = {
  flow: string;
  stepId: string;
  action: string;
  state: SceneCoverageState;
  coveredBy: Array<SceneCoverageRef & { resolved: boolean }>;
  noCoverageReason?: string;
};

export type SceneStatusEntry = {
  id: string;
  title: string;
  area: string;
  status: SceneLifecycleStatus;
  path: string;
  steps: SceneStepCoverage[];
  coverageCounts: Record<SceneCoverageState, number>;
};

export type SceneStatusResult = {
  valid: boolean;
  sceneCount: number;
  statusCounts: Record<SceneLifecycleStatus, number>;
  coverageCounts: Record<SceneCoverageState, number>;
  areas: string[];
  scenes: SceneStatusEntry[];
  diagnostics: ValidationDiagnostic[];
};

export type SceneStatusOptions = { area?: string; sceneId?: string };

/** One operation group of a delta scene, addressed by flow and stable step id. */
type DeltaFlowEdit = {
  main_flow?: Record<string, SceneFlowStep>;
  exception_flows?: Record<string, { trigger?: string; steps?: Record<string, SceneFlowStep> }>;
};
type DeltaFlowRemoval = {
  main_flow?: Record<string, { reason: string }>;
  exception_flows?: Record<string, { steps?: Record<string, { reason: string }> }>;
};

export type DeltaSceneArtifact = {
  target_scene: string;
  scene?: { title: string; area: string; actors: SceneActor[]; preconditions: string[] };
  operations?: { ADDED?: DeltaFlowEdit; MODIFIED?: DeltaFlowEdit; REMOVED?: DeltaFlowRemoval };
};

export type SceneMergeReport = {
  targetScene: string;
  scenePath: string;
  created: boolean;
  added: number;
  modified: number;
  removed: number;
  modifiedMissingTargetAsAdded: string[];
  removedMissingTargetSkipped: string[];
};

export type SceneMergePlan = {
  /** Every scene the merged store holds, whether this change touched it or not. */
  scenes: LoadedScene[];
  /** Only the scenes the change's delta scenes targeted, in the order their reports were opened. */
  targeted: LoadedScene[];
  reports: SceneMergeReport[];
};

function scenesDir(rootDir: string): string {
  return path.join(rootDir, SCENES_ROOT);
}

function sceneFileRepoPath(area: string, sceneId: string): string {
  return `${SCENES_ROOT}/${area}/${sceneId}.yaml`;
}

function repoRelative(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function assertKebabCase(value: string, label: string): void {
  if (!KEBAB_CASE.test(value)) throw new Error(`${label} must be kebab-case: '${value}'`);
}

function schemaIssues(artifactType: string, candidate: unknown, artifactPath: string): YamlMutationValidationIssue[] {
  return validateArtifact(loadBundledSchemaByArtifactType(artifactType), candidate, artifactPath)
    .diagnostics
    .map((entry) => ({
      code: entry.source,
      fieldPath: entry.fieldPath,
      message: entry.message,
      expected: entry.expected,
      actual: entry.actual,
    }));
}

/**
 * Scene files are nested one directory deep under the area key, which is also the index group key,
 * so the canonical path and the group stay derivable from each other without a second declaration.
 */
function listSceneFiles(rootDir: string): string[] {
  const dir = scenesDir(rootDir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const files: string[] = [];
  for (const areaName of readdirSync(dir).sort()) {
    const areaDir = path.join(dir, areaName);
    if (!existsSync(areaDir) || !statSync(areaDir).isDirectory()) continue;
    files.push(
      ...readdirSync(areaDir)
        .filter((name) => name.endsWith(".yaml"))
        .map((name) => path.join(areaDir, name))
        .sort(),
    );
  }
  return files;
}

type LoadedScene = { id: string; area: string; absolutePath: string; repoPath: string; artifact: SceneArtifact };

function loadScenes(rootDir: string): { scenes: LoadedScene[]; diagnostics: ValidationDiagnostic[] } {
  const scenes: LoadedScene[] = [];
  const diagnostics: ValidationDiagnostic[] = [];
  for (const absolutePath of listSceneFiles(rootDir)) {
    const repoPath = repoRelative(rootDir, absolutePath);
    let artifact: SceneArtifact;
    try {
      artifact = parseYamlFile<SceneArtifact>(absolutePath);
    } catch (error) {
      diagnostics.push({
        source: "schema",
        artifactPath: repoPath,
        fieldPath: "$",
        message: `failed to parse scene: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    const sceneId = artifact?.scene?.id;
    if (typeof sceneId !== "string" || sceneId.length === 0) {
      diagnostics.push({ source: "schema", artifactPath: repoPath, fieldPath: "$.scene.id", message: "scene id is missing" });
      continue;
    }
    // The area key is also the subdirectory name, which is what keeps the index group and the
    // canonical path derivable from each other. Trusting the field over the directory it actually
    // sits in would rebuild the index pointing at a path that does not exist.
    const directoryArea = path.basename(path.dirname(absolutePath));
    if (artifact.area !== directoryArea) {
      diagnostics.push({
        source: "reference",
        artifactPath: repoPath,
        fieldPath: "$.area",
        message:
          `scene '${sceneId}' records area '${String(artifact.area)}' but is stored under '${directoryArea}'; `
          + "the area is the scene's subdirectory name, so move the file to "
          + `${SCENES_ROOT}/${String(artifact.area)}/${sceneId}.yaml or correct the recorded area`,
        expected: directoryArea,
        actual: String(artifact.area),
      });
      continue;
    }
    const fileName = path.basename(absolutePath, ".yaml");
    if (fileName !== sceneId) {
      diagnostics.push({
        source: "reference",
        artifactPath: repoPath,
        fieldPath: "$.scene.id",
        message:
          `scene '${sceneId}' is stored as '${fileName}.yaml'; the file name is the scene id, so the index entry `
          + "and the canonical path would disagree",
        expected: `${sceneId}.yaml`,
        actual: `${fileName}.yaml`,
      });
      continue;
    }
    scenes.push({ id: sceneId, area: artifact.area, absolutePath, repoPath, artifact });
  }
  return { scenes, diagnostics };
}

function buildScenesIndex(scenes: readonly LoadedScene[]): ScenesIndexArtifact {
  const areas: Record<string, Record<string, SceneIndexEntry>> = {};
  const sorted = [...scenes].sort((left, right) => left.id.localeCompare(right.id));
  for (const area of [...new Set(sorted.map((entry) => entry.area))].sort()) {
    const entries: Record<string, SceneIndexEntry> = {};
    for (const scene of sorted.filter((candidate) => candidate.area === area)) {
      entries[scene.id] = {
        title: scene.artifact.scene.title,
        status: scene.artifact.status,
        path: sceneFileRepoPath(scene.area, scene.id),
      };
    }
    areas[area] = entries;
  }
  return {
    schema: SCENES_INDEX_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "scenes_index",
    schema_file: SCENES_INDEX_SCHEMA_FILE,
    areas,
  };
}

function buildBaseScene(input: SceneAuthorInput): SceneArtifact {
  if (input.title === undefined) throw new Error("creating a scene requires --title");
  if (input.area === undefined) throw new Error("creating a scene requires --area");
  return {
    schema: SCENE_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "scene",
    schema_file: SCENE_SCHEMA_FILE,
    scene: { id: input.id, title: input.title },
    area: input.area,
    status: (input.status ?? "draft") as SceneLifecycleStatus,
    actors: [],
    preconditions: [],
    main_flow: {},
    exception_flows: {},
  };
}

function sameCoverage(left: SceneCoverageRef, right: SceneCoverageRef): boolean {
  return left.spec_id === right.spec_id && left.requirement_id === right.requirement_id;
}

/**
 * A step merge overwrites only the fields this invocation names. Supplying a coverage reference
 * clears a recorded waiver and vice versa, because the schema admits exactly one of the two and a
 * step carrying both would be refused after an otherwise valid edit.
 */
function applyStepInput(flow: Record<string, SceneFlowStep>, step: SceneStepInput, flowLabel: string): void {
  assertKebabCase(step.id, "step id");
  const existing = flow[step.id];
  if (existing === undefined && step.action === undefined) {
    throw new Error(`new step '${step.id}' in ${flowLabel} requires --action`);
  }
  const target: SceneFlowStep = existing ?? { action: step.action as string };
  if (step.action !== undefined) target.action = step.action;

  for (const removed of step.removeCoverage) {
    target.covered_by = (target.covered_by ?? []).filter((entry) => !sameCoverage(entry, removed));
    if (target.covered_by.length === 0) delete target.covered_by;
  }
  if (step.coveredBy.length > 0) {
    const merged = [...(target.covered_by ?? [])];
    for (const reference of step.coveredBy) {
      if (!merged.some((entry) => sameCoverage(entry, reference))) merged.push(reference);
    }
    target.covered_by = merged;
    delete target.no_coverage_reason;
  }
  if (step.noCoverageReason !== undefined) {
    target.no_coverage_reason = step.noCoverageReason;
    delete target.covered_by;
  }
  flow[step.id] = target;
}

function applySceneInput(candidate: SceneArtifact, input: SceneAuthorInput): void {
  if (input.title !== undefined) candidate.scene.title = input.title;
  if (input.status !== undefined) candidate.status = input.status as SceneLifecycleStatus;
  if (input.area !== undefined && input.area !== candidate.area) {
    throw new Error(
      `scene '${input.id}' is recorded in area '${candidate.area}'; the area is the scene's directory and is not changed by an edit`,
    );
  }

  for (const name of input.removeActors) {
    candidate.actors = (candidate.actors ?? []).filter((actor) => actor.name !== name);
  }
  for (const value of input.removePreconditions) {
    candidate.preconditions = (candidate.preconditions ?? []).filter((entry) => entry !== value);
  }
  for (const flowId of input.removeExceptionFlows) delete candidate.exception_flows?.[flowId];
  for (const reference of input.removeSteps) {
    const separator = reference.indexOf(":");
    if (separator === -1) {
      delete candidate.main_flow?.[reference];
      continue;
    }
    const flowId = reference.slice(0, separator);
    const stepId = reference.slice(separator + 1);
    const flow = candidate.exception_flows?.[flowId];
    if (flow !== undefined) delete flow.steps?.[stepId];
  }

  for (const actor of input.actors) {
    const existing = (candidate.actors ??= []).find((entry) => entry.name === actor.name);
    if (existing === undefined) candidate.actors.push({ ...actor });
    else existing.role = actor.role;
  }
  for (const value of input.preconditions) {
    candidate.preconditions ??= [];
    if (!candidate.preconditions.includes(value)) candidate.preconditions.push(value);
  }
  for (const flow of input.exceptionFlows) {
    assertKebabCase(flow.id, "exception flow id");
    const existing = (candidate.exception_flows ??= {})[flow.id];
    if (existing === undefined) candidate.exception_flows[flow.id] = { trigger: flow.trigger, steps: {} };
    else existing.trigger = flow.trigger;
  }
  for (const step of input.steps) {
    if (step.exceptionFlow === undefined) {
      applyStepInput((candidate.main_flow ??= {}), step, "the main flow");
      continue;
    }
    const flow = (candidate.exception_flows ??= {})[step.exceptionFlow];
    if (flow === undefined) {
      throw new Error(
        `exception flow '${step.exceptionFlow}' does not exist; declare it with --exception-flow ${step.exceptionFlow} --trigger <text> first`,
      );
    }
    applyStepInput((flow.steps ??= {}), step, `exception flow '${step.exceptionFlow}'`);
  }
}

function hasSceneEditIntent(input: SceneAuthorInput): boolean {
  return input.title !== undefined
    || input.area !== undefined
    || input.status !== undefined
    || input.actors.length > 0
    || input.preconditions.length > 0
    || input.exceptionFlows.length > 0
    || input.steps.length > 0
    || input.removeActors.length > 0
    || input.removePreconditions.length > 0
    || input.removeExceptionFlows.length > 0
    || input.removeSteps.length > 0;
}

/**
 * Owns every mutation of the scene family. The scene file and the regenerated index commit in one
 * transaction, so a rejected write can never leave an index entry naming a scene file that is
 * absent, and the first scene creates both the area directory and the index together rather than
 * leaving an empty container behind.
 */
export function authorScene(rootDir: string, input: SceneAuthorInput): SceneAuthorResult {
  assertKebabCase(input.id, "scene id");
  if (!input.delete && !hasSceneEditIntent(input)) {
    throw new Error("scene-edit requires semantic fields, named removals, or --delete");
  }
  if (input.delete && hasSceneEditIntent(input)) {
    throw new Error("--delete is a delete-only operation and is rejected alongside editing flags");
  }
  if (input.area !== undefined) assertKebabCase(input.area, "scene area");

  const loaded = loadScenes(rootDir);
  // The index is rebuilt from every recorded scene, so one unreadable or misplaced scene would be
  // silently dropped from it or entered at a path that does not exist. Refusing the write keeps the
  // store and its index consistent instead of reconciling around a file this command cannot read.
  if (loaded.diagnostics.length > 0) {
    throw new Error(
      "the recorded scene store cannot be read, so the scene index cannot be rebuilt: "
      + loaded.diagnostics.map((entry) => `${entry.artifactPath} ${entry.fieldPath}: ${entry.message}`).join("; "),
    );
  }
  const existing = loaded.scenes.find((entry) => entry.id === input.id);
  if (input.delete && existing === undefined) throw new Error(`scene '${input.id}' does not exist`);

  const area = existing?.area ?? input.area;
  if (area === undefined) throw new Error("creating a scene requires --area");
  const targetPath = existing?.repoPath ?? sceneFileRepoPath(area, input.id);
  const absolutePath = path.join(rootDir, targetPath);
  const operation = input.delete ? "delete" : existing === undefined ? "create" : "update";

  let candidate: SceneArtifact | undefined;
  if (!input.delete) {
    candidate = existing === undefined
      ? buildBaseScene({ ...input, area })
      : parseYamlFile<SceneArtifact>(existing.absolutePath);
    applySceneInput(candidate, input);
  }

  const remaining = loaded.scenes.filter((entry) => entry.id !== input.id);
  const indexScenes = candidate === undefined
    ? remaining
    : [...remaining, { id: input.id, area, absolutePath, repoPath: targetPath, artifact: candidate }];
  const indexAbsolutePath = path.join(rootDir, SCENES_INDEX_PATH);
  const indexExists = existsSync(indexAbsolutePath);

  // The index schema requires at least one area holding at least one scene, so deleting the last
  // scene deletes the index rather than writing the empty container the creation rule forbids.
  const indexOperation = indexScenes.length === 0
    ? (indexExists ? "delete" : "update")
    : (indexExists ? "update" : "create");

  const mutation = commitYamlMutation({
    rootDir,
    mutations: [
      {
        artifactFamily: "scene-state",
        artifactId: input.id,
        schemaId: SCENE_SCHEMA_ID,
        familyRoot: scenesDir(rootDir),
        absolutePath,
        operation,
        ...(candidate === undefined
          ? {}
          : { candidate, validateCandidate: (value, context) => schemaIssues("scene", value, context.artifactPath) }),
      },
      ...(indexScenes.length === 0 && !indexExists ? [] : [{
        artifactFamily: "scene-state",
        artifactId: "scenes-index",
        schemaId: SCENES_INDEX_SCHEMA_ID,
        familyRoot: scenesDir(rootDir),
        absolutePath: indexAbsolutePath,
        operation: indexOperation as "create" | "update" | "delete",
        role: "reference" as const,
        ...(indexScenes.length === 0
          ? {}
          : {
            candidate: buildScenesIndex(indexScenes),
            validateCandidate: (value: unknown, context: { artifactPath: string }) =>
              schemaIssues("scenes_index", value, context.artifactPath),
          }),
      }]),
    ],
  });

  if (mutation.committed && input.delete) pruneEmptySceneDirectories(rootDir, area);

  return {
    ...mutation,
    sceneId: input.id,
    artifactPath: input.delete ? null : targetPath,
    indexPath: SCENES_INDEX_PATH,
    operation,
  };
}

/**
 * Removes an area directory, and the scene root, that a committed delete left empty. Scenes are the
 * first family whose artifacts are nested deep enough for a delete to strand a directory, and an
 * empty area directory is the empty artifact container the creation rule forbids writing. This runs
 * only after the transaction committed and touches no file content, so it stays outside the YAML
 * mutation boundary rather than becoming a second write to the artifacts it just removed.
 */
function pruneEmptySceneDirectories(rootDir: string, area: string): void {
  for (const directoryPath of [path.join(scenesDir(rootDir), area), scenesDir(rootDir)]) {
    try {
      if (existsSync(directoryPath) && readdirSync(directoryPath).length === 0) rmdirSync(directoryPath);
    } catch {
      // A directory another process repopulated or already removed is not owned cleanup work.
    }
  }
}

/**
 * Commits a change's delta scenes into the recorded scene store and regenerates the scene index in
 * the same transaction, so a refused merge can never leave an index naming a scene file that was
 * never written. Returns one report per targeted scene, and nothing at all when the change carries
 * no delta scene.
 */
export function mergeDeltaScenes(rootDir: string, changeDir: string): SceneMergeReport[] {
  if (listDeltaScenePaths(changeDir).length === 0) return [];
  const plan = planDeltaSceneMerge(rootDir, changeDir);

  const indexAbsolutePath = path.join(rootDir, SCENES_INDEX_PATH);
  const indexExists = existsSync(indexAbsolutePath);
  const mutation = commitYamlMutation({
    rootDir,
    mutations: [
      ...plan.targeted.map((scene) => ({
        artifactFamily: "scene-state",
        artifactId: scene.id,
        schemaId: SCENE_SCHEMA_ID,
        familyRoot: scenesDir(rootDir),
        absolutePath: scene.absolutePath,
        operation: (existsSync(scene.absolutePath) ? "update" : "create") as "create" | "update",
        candidate: scene.artifact,
        validateCandidate: (value: unknown, context: { artifactPath: string }) =>
          schemaIssues("scene", value, context.artifactPath),
      })),
      {
        artifactFamily: "scene-state",
        artifactId: "scenes-index",
        schemaId: SCENES_INDEX_SCHEMA_ID,
        familyRoot: scenesDir(rootDir),
        absolutePath: indexAbsolutePath,
        operation: (indexExists ? "update" : "create") as "create" | "update",
        role: "reference" as const,
        candidate: buildScenesIndex(plan.scenes),
        validateCandidate: (value: unknown, context: { artifactPath: string }) =>
          schemaIssues("scenes_index", value, context.artifactPath),
      },
    ],
  });

  if (!mutation.committed) {
    throw new Error(
      `merging the change's delta scenes into ${SCENES_ROOT} was refused: `
      + mutation.diagnostics.map((entry) => `${entry.fieldPath}: ${entry.message}`).join("; "),
    );
  }
  return plan.reports;
}

const MAIN_FLOW = "main";

function flowLabel(flowId: string): string {
  return flowId === MAIN_FLOW ? "the main flow" : `exception flow '${flowId}'`;
}

/**
 * Merges one delta step into a flow. The merged step takes the delta's content, and its covering
 * requirements union with whatever the main step already named so the merged coverage does not
 * depend on which delta spec the requirements arrived from. Assigning an existing key leaves it at
 * its recorded position and a new key appends, which is exactly the declared position rule: a
 * modified step keeps its place in the scenario's step sequence and an added step lands after it.
 */
function mergeStepInto(flow: Record<string, SceneFlowStep>, stepId: string, incoming: SceneFlowStep): void {
  const existing = flow[stepId];
  const merged: SceneFlowStep = { action: incoming.action };
  if (incoming.covered_by !== undefined) {
    const union = [...(existing?.covered_by ?? [])];
    for (const reference of incoming.covered_by) {
      if (!union.some((entry) => sameCoverage(entry, reference))) union.push(reference);
    }
    merged.covered_by = union;
  } else if (incoming.no_coverage_reason !== undefined) {
    merged.no_coverage_reason = incoming.no_coverage_reason;
  }
  flow[stepId] = merged;
}

/** Resolves the flow a delta operation addresses, creating a named exception flow when the delta introduces it. */
function resolveFlow(
  scene: SceneArtifact,
  flowId: string,
  trigger: string | undefined,
  deltaPath: string,
): Record<string, SceneFlowStep> {
  if (flowId === MAIN_FLOW) return (scene.main_flow ??= {});
  const flows = (scene.exception_flows ??= {});
  const existing = flows[flowId];
  if (existing === undefined) {
    if (trigger === undefined) {
      throw new Error(
        `delta scene '${deltaPath}' introduces exception flow '${flowId}' on scene '${scene.scene.id}' without a trigger; `
        + "a flow this delta introduces must state the trigger that causes it",
      );
    }
    flows[flowId] = { trigger, steps: {} };
    return flows[flowId].steps;
  }
  if (trigger !== undefined) existing.trigger = trigger;
  return (existing.steps ??= {});
}

/** Walks one operation group's main-flow and exception-flow entries as flat `(flowId, trigger, stepId, value)` rows. */
function* walkFlowEntries<T>(
  group: { main_flow?: Record<string, T>; exception_flows?: Record<string, { trigger?: string; steps?: Record<string, T> }> } | undefined,
): Generator<{ flowId: string; trigger: string | undefined; stepId: string; value: T }> {
  for (const [stepId, value] of Object.entries(group?.main_flow ?? {})) {
    yield { flowId: MAIN_FLOW, trigger: undefined, stepId, value };
  }
  for (const [flowId, flow] of Object.entries(group?.exception_flows ?? {})) {
    for (const [stepId, value] of Object.entries(flow?.steps ?? {})) {
      yield { flowId, trigger: flow?.trigger, stepId, value };
    }
  }
}

/**
 * Removes an exception flow the removals emptied. The scene contract requires every exception flow
 * to hold at least one step, so leaving the emptied flow behind would write the empty container the
 * creation rule forbids and fail the scene's own schema on the next read.
 */
function pruneEmptyExceptionFlows(scene: SceneArtifact): void {
  for (const [flowId, flow] of Object.entries(scene.exception_flows ?? {})) {
    if (Object.keys(flow?.steps ?? {}).length === 0) delete scene.exception_flows[flowId];
  }
}

function buildSceneFromDelta(delta: DeltaSceneArtifact, deltaPath: string): SceneArtifact {
  if (delta.scene === undefined) {
    throw new Error(
      `delta scene '${deltaPath}' targets scene '${delta.target_scene}', which does not exist; `
      + "create it with a scene block naming title and area, or correct target_scene to name a recorded scene "
      + "(list them with 'strict-spec-cli scene-status')",
    );
  }
  return {
    schema: SCENE_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "scene",
    schema_file: SCENE_SCHEMA_FILE,
    scene: { id: delta.target_scene, title: delta.scene.title },
    area: delta.scene.area,
    status: "draft",
    actors: delta.scene.actors.map((actor) => ({ ...actor })),
    preconditions: [...delta.scene.preconditions],
    main_flow: {},
    exception_flows: {},
  };
}

/** Identifies one step address across the whole merge, so two deltas touching it can be compared. */
function stepAddress(sceneId: string, flowId: string, stepId: string): string {
  return `${sceneId} ${flowId} ${stepId}`;
}

function listDeltaScenePaths(changeDir: string): string[] {
  const deltaDir = path.join(changeDir, "scenes");
  if (!existsSync(deltaDir) || !statSync(deltaDir).isDirectory()) return [];
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".yaml") || name.endsWith(".yml")) files.push(full);
    }
  };
  walk(deltaDir);
  return files;
}

/**
 * Computes the merged scene store a change's delta scenes produce, without writing anything. Both
 * the archive merge and the coverage gate run through this, so the state the gate inspects before
 * implementation is the same state archive will commit rather than an approximation of it.
 */
export function planDeltaSceneMerge(rootDir: string, changeDir: string): SceneMergePlan {
  const loaded = loadScenes(rootDir);
  if (loaded.diagnostics.length > 0) {
    throw new Error(
      "the recorded scene store cannot be read, so a delta scene cannot be merged into it: "
      + loaded.diagnostics.map((entry) => `${entry.artifactPath} ${entry.fieldPath}: ${entry.message}`).join("; "),
    );
  }

  const working = new Map(loaded.scenes.map((scene) => [scene.id, scene]));
  const reports = new Map<string, SceneMergeReport>();
  const targeted: string[] = [];
  // Records which delta file last set each step address, so a second delta of the same change that
  // states a different action for it is refused instead of silently overwriting authored content.
  const actionOwners = new Map<string, { action: string; deltaPath: string }>();

  for (const deltaPath of listDeltaScenePaths(changeDir)) {
    const repoDeltaPath = repoRelative(rootDir, deltaPath);
    const delta = parseYamlFile<DeltaSceneArtifact>(deltaPath);
    if (typeof delta.target_scene !== "string" || delta.target_scene.length === 0) {
      throw new Error(`delta scene '${repoDeltaPath}' is missing target_scene`);
    }

    let scene = working.get(delta.target_scene);
    let report = reports.get(delta.target_scene);
    if (scene === undefined) {
      const artifact = buildSceneFromDelta(delta, repoDeltaPath);
      const repoPath = sceneFileRepoPath(artifact.area, delta.target_scene);
      scene = {
        id: delta.target_scene,
        area: artifact.area,
        absolutePath: path.join(rootDir, repoPath),
        repoPath,
        artifact,
      };
      working.set(scene.id, scene);
    }
    if (report === undefined) {
      report = {
        targetScene: delta.target_scene,
        scenePath: scene.repoPath,
        created: !loaded.scenes.some((entry) => entry.id === delta.target_scene),
        added: 0,
        modified: 0,
        removed: 0,
        modifiedMissingTargetAsAdded: [],
        removedMissingTargetSkipped: [],
      };
      reports.set(delta.target_scene, report);
      targeted.push(delta.target_scene);
    }

    const target = scene;
    const entry = report;
    const operations = delta.operations ?? {};
    // Two deltas of the same change may cover one step from different specs, which the coverage set
    // merge handles. Two deltas stating different actions for it is a conflict this merge refuses
    // rather than resolves, because picking one would discard the other's authored content unseen.
    const claimAction = (flowId: string, stepId: string, action: string, addedOperation: boolean): void => {
      const address = stepAddress(target.id, flowId, stepId);
      const owner = actionOwners.get(address);
      if (owner !== undefined && (addedOperation || owner.action !== action)) {
        const source = owner.deltaPath === repoDeltaPath
          ? `delta scene '${repoDeltaPath}' states two conflicting operations for`
          : `delta scenes '${owner.deltaPath}' and '${repoDeltaPath}' both operate on`;
        throw new Error(
          `${source} step '${stepId}' in ${flowLabel(flowId)} of scene '${target.id}'; keep one of the two operations `
          + "and restate it with 'strict-spec-cli generate <change-name> delta-scene --target-scene "
          + `${target.id} --operation MODIFIED --step ${stepId} --action <text>', dropping the other with `
          + `'strict-spec-cli generate <change-name> delta-scene --target-scene ${target.id} --remove-step ${stepId}'`,
        );
      }
      actionOwners.set(address, { action, deltaPath: repoDeltaPath });
    };

    for (const { flowId, trigger, stepId, value } of walkFlowEntries(operations.ADDED)) {
      claimAction(flowId, stepId, value.action, true);
      const flow = resolveFlow(target.artifact, flowId, trigger, repoDeltaPath);
      if (stepId in flow) {
        throw new Error(
          `delta scene '${repoDeltaPath}' adds step '${stepId}' to ${flowLabel(flowId)} of scene '${target.id}', `
          + "but that step already exists; state the edit as a MODIFIED operation with "
          + `'strict-spec-cli generate <change-name> delta-scene --target-scene ${target.id} --operation MODIFIED --step ${stepId} --action <text>'`,
        );
      }
      mergeStepInto(flow, stepId, value);
      entry.added += 1;
    }

    for (const { flowId, trigger, stepId, value } of walkFlowEntries(operations.MODIFIED)) {
      claimAction(flowId, stepId, value.action, false);
      const flow = resolveFlow(target.artifact, flowId, trigger, repoDeltaPath);
      const present = stepId in flow;
      mergeStepInto(flow, stepId, value);
      if (present) entry.modified += 1;
      else entry.modifiedMissingTargetAsAdded.push(stepId);
    }

    for (const { flowId, stepId } of walkFlowEntries(operations.REMOVED)) {
      const flow = flowId === MAIN_FLOW
        ? target.artifact.main_flow
        : target.artifact.exception_flows?.[flowId]?.steps;
      if (flow === undefined || !(stepId in flow)) {
        entry.removedMissingTargetSkipped.push(stepId);
        continue;
      }
      delete flow[stepId];
      entry.removed += 1;
    }
    pruneEmptyExceptionFlows(target.artifact);
  }

  const scenes = [...working.values()].sort((left, right) =>
    left.area.localeCompare(right.area) || left.id.localeCompare(right.id));
  return {
    scenes,
    targeted: targeted.map((id) => working.get(id)!),
    reports: [...reports.values()].sort((left, right) =>
      left.scenePath.localeCompare(right.scenePath) || left.targetScene.localeCompare(right.targetScene)),
  };
}

type SpecRequirementUniverse = Map<string, Set<string>>;

/**
 * Coverage references are resolved against the recorded main specs, which is what lets a status
 * report distinguish a step that names a real requirement from one that names a requirement nobody
 * ever wrote. A missing spec index resolves nothing rather than failing, because a project may
 * author a scene before any spec exists — that is the entry point the scene family exists to serve.
 */
function loadSpecRequirements(rootDir: string): SpecRequirementUniverse {
  const universe: SpecRequirementUniverse = new Map();
  const indexPath = path.join(rootDir, SPEC_INDEX_PATH);
  if (!existsSync(indexPath)) return universe;
  let index: { specs?: Array<{ id?: string; path?: string }> };
  try {
    index = parseYamlFile(indexPath);
  } catch {
    return universe;
  }
  for (const entry of index.specs ?? []) {
    if (typeof entry?.id !== "string" || typeof entry.path !== "string") continue;
    const specPath = path.join(rootDir, entry.path);
    if (!existsSync(specPath)) continue;
    try {
      const spec = parseYamlFile<{ requirements?: Record<string, unknown> }>(specPath);
      universe.set(entry.id, new Set(Object.keys(spec.requirements ?? {})));
    } catch {
      universe.set(entry.id, new Set());
    }
  }
  return universe;
}

/**
 * Overlays a change's delta specs onto the main-spec universe, producing the requirement set the
 * main specs will hold once the change archives. Archive merges specs before scenes, so this is the
 * state a merged scene step is actually checked against: a requirement the change adds or modifies
 * resolves, including one in a spec the change creates, and one it removes does not. An unreadable
 * delta contributes nothing, because verify already reports it as a schema failure of its own.
 */
function overlayChangeSpecRequirements(universe: SpecRequirementUniverse, changeDir: string): SpecRequirementUniverse {
  const overlaid: SpecRequirementUniverse = new Map(
    [...universe].map(([specId, requirementIds]) => [specId, new Set(requirementIds)]),
  );
  const specsDir = path.join(changeDir, "specs");
  if (!existsSync(specsDir) || !statSync(specsDir).isDirectory()) return overlaid;
  const deltaPaths: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".yaml") || name.endsWith(".yml")) deltaPaths.push(full);
    }
  };
  walk(specsDir);
  for (const deltaPath of deltaPaths) {
    let delta: { target_spec?: unknown; operations?: Record<string, unknown> };
    try {
      delta = parseYamlFile(deltaPath);
    } catch {
      continue;
    }
    if (typeof delta?.target_spec !== "string") continue;
    const requirementIds = overlaid.get(delta.target_spec) ?? new Set<string>();
    const idsOf = (operation: string): string[] => {
      const entries = delta.operations?.[operation];
      return entries !== null && typeof entries === "object" && !Array.isArray(entries) ? Object.keys(entries) : [];
    };
    for (const id of [...idsOf("ADDED"), ...idsOf("MODIFIED")]) requirementIds.add(id);
    for (const id of idsOf("REMOVED")) requirementIds.delete(id);
    overlaid.set(delta.target_spec, requirementIds);
  }
  return overlaid;
}

function describeStep(
  flow: string,
  stepId: string,
  step: SceneFlowStep,
  universe: SpecRequirementUniverse,
): SceneStepCoverage {
  const coveredBy = (step.covered_by ?? []).map((reference) => ({
    ...reference,
    resolved: universe.get(reference.spec_id)?.has(reference.requirement_id) ?? false,
  }));
  const state: SceneCoverageState = coveredBy.length === 0
    ? "waived"
    : coveredBy.every((reference) => reference.resolved) ? "covered" : "unresolved";
  return {
    flow,
    stepId,
    action: step.action,
    state,
    coveredBy,
    ...(step.no_coverage_reason === undefined ? {} : { noCoverageReason: step.no_coverage_reason }),
  };
}

function describeScene(scene: LoadedScene, universe: SpecRequirementUniverse): SceneStatusEntry {
  const steps: SceneStepCoverage[] = [];
  for (const [stepId, step] of Object.entries(scene.artifact.main_flow ?? {})) {
    steps.push(describeStep("main", stepId, step, universe));
  }
  for (const [flowId, flow] of Object.entries(scene.artifact.exception_flows ?? {})) {
    for (const [stepId, step] of Object.entries(flow.steps ?? {})) {
      steps.push(describeStep(flowId, stepId, step, universe));
    }
  }
  const coverageCounts: Record<SceneCoverageState, number> = { covered: 0, waived: 0, unresolved: 0 };
  for (const step of steps) coverageCounts[step.state] += 1;
  return {
    id: scene.id,
    title: scene.artifact.scene.title,
    area: scene.area,
    status: scene.artifact.status,
    path: scene.repoPath,
    steps,
    coverageCounts,
  };
}

/** Builds the delta-scene command that records coverage for one step, with every identifier already substituted. */
function coverageRemedyCommand(changeName: string, sceneId: string, flowId: string, stepId: string, action: string): string {
  const flowArgument = flowId === MAIN_FLOW ? "" : ` --exception-flow ${flowId}`;
  return `strict-spec-cli generate ${changeName} delta-scene --target-scene ${sceneId} --operation MODIFIED${flowArgument}`
    + ` --step ${stepId} --action ${JSON.stringify(action)} --covered-by <spec-id>:<requirement-id>`;
}

/**
 * Reports every step of the scenes this change touches that names no covering requirement and no
 * explicit waiver, or names a requirement that does not resolve. The scope is the merged result of
 * the change's delta scenes applied to the main scenes they target, so a step the change inherits
 * unchanged is checked while a scene the change never touches is not. A change carrying no delta
 * scene, and a repository holding no scene at all, therefore produce nothing.
 */
export function collectSceneCoverageDiagnostics(
  rootDir: string,
  changeDir: string,
  changeName: string,
): ValidationDiagnostic[] {
  if (listDeltaScenePaths(changeDir).length === 0) return [];

  let plan: SceneMergePlan;
  try {
    plan = planDeltaSceneMerge(rootDir, changeDir);
  } catch (error) {
    return [{
      source: "reference",
      artifactPath: repoRelative(rootDir, path.join(changeDir, "scenes")),
      fieldPath: "$",
      message: `the change's delta scenes cannot be merged, so scene coverage cannot be checked: ${error instanceof Error ? error.message : String(error)}`,
    }];
  }

  const universe = overlayChangeSpecRequirements(loadSpecRequirements(rootDir), changeDir);
  const diagnostics: ValidationDiagnostic[] = [];
  for (const scene of plan.targeted) {
    const sceneDiagnostics: ValidationDiagnostic[] = [];
    const flows: Array<[string, Record<string, SceneFlowStep>]> = [
      [MAIN_FLOW, scene.artifact.main_flow ?? {}],
      ...Object.entries(scene.artifact.exception_flows ?? {})
        .map(([flowId, flow]) => [flowId, flow?.steps ?? {}] as [string, Record<string, SceneFlowStep>]),
    ];
    for (const [flowId, flow] of flows) {
      for (const [stepId, step] of Object.entries(flow)) {
        const fieldPath = flowId === MAIN_FLOW
          ? `$.main_flow.${stepId}`
          : `$.exception_flows.${flowId}.steps.${stepId}`;
        const remedy = coverageRemedyCommand(changeName, scene.id, flowId, stepId, step.action);
        const covering = step.covered_by ?? [];

        if (covering.length === 0 && step.no_coverage_reason === undefined) {
          sceneDiagnostics.push({
            source: "reference",
            artifactPath: scene.repoPath,
            fieldPath,
            message:
              `step '${stepId}' in ${flowLabel(flowId)} of scene '${scene.id}' names no covering requirement and no `
              + `no-coverage reason; record its coverage with '${remedy}', reading the covering spec id and requirement id `
              + `from ${SPEC_INDEX_PATH} and the spec file it names, or waive it deliberately by replacing --covered-by with `
              + "--no-coverage-reason <text>",
            expected: "a covering requirement or an explicit no-coverage reason",
            actual: "neither",
          });
          continue;
        }

        const unresolved = covering.filter((reference) => !(universe.get(reference.spec_id)?.has(reference.requirement_id) ?? false));
        if (unresolved.length === 0) continue;
        sceneDiagnostics.push({
          source: "reference",
          artifactPath: scene.repoPath,
          fieldPath,
          message:
            `step '${stepId}' in ${flowLabel(flowId)} of scene '${scene.id}' names covering requirement(s) that do not `
            + `resolve: ${unresolved.map((reference) => `${reference.spec_id}:${reference.requirement_id}`).join(", ")}; `
            + `correct the reference with '${remedy}', reading the recorded spec ids and requirement ids from `
            + `${SPEC_INDEX_PATH} and the spec file it names, or add the missing requirement to this change with `
            + `'strict-spec-cli generate ${changeName} delta-spec --target-spec <spec-id> --operation ADDED --requirement <requirement-id> --strength MUST --statement <text>'`,
          expected: "covering requirements that resolve against the recorded main specs as this change's delta specs leave them",
          actual: unresolved.map((reference) => `${reference.spec_id}:${reference.requirement_id}`).join(", "),
        });
      }
    }

    // A step-level gap explains the merged scene far better than the schema violation it also
    // causes, so the structural check reports only what no coverage gap already accounts for. The
    // merge commits the merged scene against the scene schema, so reporting it here is what keeps
    // archive from refusing after the spec and standard merges have already written.
    diagnostics.push(...sceneDiagnostics);
    if (sceneDiagnostics.length > 0) continue;
    for (const issue of schemaIssues("scene", scene.artifact, scene.repoPath)) {
      diagnostics.push({
        source: "reference",
        artifactPath: scene.repoPath,
        fieldPath: issue.fieldPath,
        message:
          `merging this change's delta scenes would leave scene '${scene.id}' invalid: ${issue.message}; `
          + `inspect the merged result with 'strict-spec-cli scene-status --scene ${scene.id}' and correct the delta with `
          + `'strict-spec-cli generate ${changeName} delta-scene --target-scene ${scene.id} --<named-args>'`,
        ...(issue.expected === undefined ? {} : { expected: issue.expected }),
        ...(issue.actual === undefined ? {} : { actual: issue.actual }),
      });
    }
  }
  return diagnostics;
}

/**
 * Read-only. An unresolvable coverage reference is reported as its own step state and exits zero:
 * the gate that blocks ready and verify on an uncovered step is owned elsewhere, and a status
 * command that refused while a scene was mid-authoring could not be used to survey one.
 */
export function getSceneStatus(rootDir: string, options: SceneStatusOptions = {}): SceneStatusResult {
  const loaded = loadScenes(rootDir);
  const universe = loadSpecRequirements(rootDir);
  const allAreas = [...new Set(loaded.scenes.map((scene) => scene.area))].sort();
  const diagnostics = [...loaded.diagnostics];

  let selected = loaded.scenes;
  if (options.area !== undefined) {
    selected = selected.filter((scene) => scene.area === options.area);
    if (selected.length === 0) {
      diagnostics.push({
        source: "reference",
        artifactPath: SCENES_INDEX_PATH,
        fieldPath: "$.areas",
        message: allAreas.length === 0
          ? `no scene area matches '${options.area}'; this project records no scene yet, so author one with 'strict-spec-cli scene-edit <scene-id> --area <area> --title <text>'`
          : `no scene area matches '${options.area}'; recorded areas are ${allAreas.join(", ")} (list them with 'strict-spec-cli scene-status')`,
        expected: allAreas.join(", "),
        actual: options.area,
      });
    }
  }
  if (options.sceneId !== undefined) {
    const before = selected;
    selected = selected.filter((scene) => scene.id === options.sceneId);
    if (selected.length === 0 && before.length > 0) {
      const recorded = before.map((scene) => scene.id).sort();
      diagnostics.push({
        source: "reference",
        artifactPath: SCENES_INDEX_PATH,
        fieldPath: "$.areas",
        message: `no scene matches '${options.sceneId}'; recorded scenes are ${recorded.join(", ")} (list them with 'strict-spec-cli scene-status')`,
        expected: recorded.join(", "),
        actual: options.sceneId,
      });
    }
  }

  const scenes = selected
    .map((scene) => describeScene(scene, universe))
    .sort((left, right) => left.area.localeCompare(right.area) || left.id.localeCompare(right.id));
  const statusCounts: Record<SceneLifecycleStatus, number> = { draft: 0, active: 0, obsolete: 0 };
  const coverageCounts: Record<SceneCoverageState, number> = { covered: 0, waived: 0, unresolved: 0 };
  for (const scene of scenes) {
    statusCounts[scene.status] += 1;
    for (const state of ["covered", "waived", "unresolved"] as const) {
      coverageCounts[state] += scene.coverageCounts[state];
    }
  }

  return {
    valid: diagnostics.length === 0,
    sceneCount: scenes.length,
    statusCounts,
    coverageCounts,
    areas: allAreas,
    scenes,
    diagnostics,
  };
}
