/**
 * The delta view-model mappers: turn one parsed change-scoped delta spec,
 * delta scene, or delta tech file into the presentation structure its
 * dedicated renderer draws — operation groups labeled with their declared
 * operation, carrying requirement bodies, scene flow steps, and rule bodies
 * through the same layouts their main counterparts use.
 *
 * The mappers are React-free and follow the same unknown-field contract as
 * the change view models: the scalar header renders as the generic view
 * draws it, the dedicated body presents the declared fields the layout
 * knows, and unrecognized top-level fields survive as generic blocks the
 * additional-fields section renders.
 */
import type { DedicatedView } from "./changeParts.ts";
import { partitionDocument, soleValue, stringField } from "./recordFields.ts";

/** The declared operations of a delta file, in their recorded order. */
const OPERATION_ORDER = ["ADDED", "MODIFIED", "REMOVED"] as const;

/** One step of one scenario: the declared keyword and its text. */
export interface ScenarioStep {
  /** The declared step keyword, exactly as written: GIVEN, WHEN, or THEN. */
  readonly kind: string;
  readonly text: string;
}

/** One scenario of a requirement body: its id and its ordered steps. */
export interface ScenarioEntry {
  readonly id: string;
  readonly steps: readonly ScenarioStep[];
}

/** One requirement body of a delta spec operation group. */
export interface RequirementBody {
  readonly id: string;
  readonly strength?: string;
  readonly statement?: string;
  readonly scenarios: readonly ScenarioEntry[];
  /** The retirement reason, present only in a REMOVED group. */
  readonly reason?: string;
}

/** One covering requirement reference of a scene step. */
export interface CoverageRef {
  readonly specId: string;
  readonly requirementId: string;
}

/** One scene flow step of a delta scene operation group. */
export interface SceneStep {
  readonly id: string;
  readonly action?: string;
  readonly coveredBy: readonly CoverageRef[];
  readonly noCoverageReason?: string;
  /** The retirement reason, present only in a REMOVED group. */
  readonly reason?: string;
}

/** One exception flow of a delta scene operation group. */
export interface ExceptionFlow {
  readonly id: string;
  readonly trigger?: string;
  readonly steps: readonly SceneStep[];
}

/** One rule body of a delta tech operation group. */
export interface TechRule {
  readonly id: string;
  readonly strength?: string;
  readonly statement?: string;
  readonly rationale?: string;
  readonly enforcement?: { readonly method?: string; readonly detail?: string };
  readonly examples?: { readonly good: readonly string[]; readonly bad: readonly string[] };
  readonly exceptions: readonly string[];
  /** The retirement reason, present only in a REMOVED group. */
  readonly reason?: string;
}

/** One operation group of a delta file, labeled with its declared operation. */
export interface DeltaOperation<TItems> {
  /** The declared operation label, exactly as written. */
  readonly operation: string;
  readonly items: readonly TItems[];
}

/** The delta spec view body: target, new-spec block, and operation groups. */
export interface DeltaSpecBody {
  readonly targetSpec?: string;
  readonly newSpec?: { readonly title?: string; readonly path?: string };
  readonly operations: readonly DeltaOperation<RequirementBody>[];
}

/** The delta scene view body: target and operation groups with flows. */
export interface DeltaSceneBody {
  readonly targetScene?: string;
  readonly operations: readonly {
    readonly operation: string;
    readonly mainFlow: readonly SceneStep[];
    readonly exceptionFlows: readonly ExceptionFlow[];
  }[];
}

/** The delta tech view body: target, new-standard block, and rule groups. */
export interface DeltaTechBody {
  readonly targetStandard?: string;
  readonly newStandard?: { readonly title?: string; readonly category?: string };
  readonly operations: readonly DeltaOperation<TechRule>[];
}

/**
 * Maps one declared requirement body from its operation group entry. The
 * main spec renderer reuses this mapper, because a delta spec requirement
 * and a main spec requirement carry the same declared shape.
 */
export function requirementBody(id: string, entry: unknown): RequirementBody {
  const scenariosSource = soleValue(entry, "scenarios");
  const scenarios: ScenarioEntry[] = [];
  if (typeof scenariosSource === "object" && scenariosSource !== null && !Array.isArray(scenariosSource)) {
    for (const [scenarioId, stepsSource] of Object.entries(scenariosSource as Record<string, unknown>)) {
      const steps: ScenarioStep[] = [];
      if (Array.isArray(stepsSource)) {
        for (const step of stepsSource) {
          if (typeof step !== "object" || step === null) {
            continue;
          }
          const entries = Object.entries(step as Record<string, unknown>);
          if (entries.length !== 1) {
            continue;
          }
          const [kind, text] = entries[0] as [string, unknown];
          if (typeof text === "string") {
            steps.push({ kind, text });
          }
        }
      }
      scenarios.push({ id: scenarioId, steps });
    }
  }
  return {
    id,
    strength: stringField(entry, "strength"),
    statement: stringField(entry, "statement"),
    scenarios,
    reason: stringField(entry, "reason"),
  };
}

/**
 * Maps one declared scene flow step from its keyed flow entry. The main
 * scene renderer reuses this mapper, because a delta scene step and a main
 * scene step carry the same declared shape.
 */
export function sceneStep(id: string, entry: unknown): SceneStep {
  const coverageSource = soleValue(entry, "covered_by");
  const coveredBy: CoverageRef[] = [];
  if (Array.isArray(coverageSource)) {
    for (const ref of coverageSource) {
      const specId = stringField(ref, "spec_id");
      const requirementId = stringField(ref, "requirement_id");
      if (specId !== undefined && requirementId !== undefined) {
        coveredBy.push({ specId, requirementId });
      }
    }
  }
  return {
    id,
    action: stringField(entry, "action"),
    coveredBy,
    noCoverageReason: stringField(entry, "no_coverage_reason"),
    reason: stringField(entry, "reason"),
  };
}

/**
 * Maps the keyed steps of one flow container, in declaration order. The
 * main scene renderer reuses this mapper over its declared main_flow and
 * exception-flow steps containers.
 */
export function keyedSteps(flow: unknown): SceneStep[] {
  if (typeof flow !== "object" || flow === null) {
    return [];
  }
  return Object.entries(flow as Record<string, unknown>).map(([id, entry]) => sceneStep(id, entry));
}

/**
 * Maps one declared rule body from its operation group entry. The main
 * technical standard renderer reuses this mapper, because a delta tech rule
 * and a main standard rule carry the same declared shape.
 */
export function techRule(id: string, entry: unknown): TechRule {
  const enforcement = soleValue(entry, "enforcement");
  const examples = soleValue(entry, "examples");
  const goodSource = examples === undefined ? undefined : soleValue(examples, "good");
  const badSource = examples === undefined ? undefined : soleValue(examples, "bad");
  const exceptionSource = soleValue(entry, "exceptions");
  return {
    id,
    strength: stringField(entry, "strength"),
    statement: stringField(entry, "statement"),
    rationale: stringField(entry, "rationale"),
    enforcement: enforcement === undefined
      ? undefined
      : { method: stringField(enforcement, "method"), detail: stringField(enforcement, "detail") },
    examples: examples === undefined
      ? undefined
      : {
        good: Array.isArray(goodSource) ? goodSource.filter((entry): entry is string => typeof entry === "string") : [],
        bad: Array.isArray(badSource) ? badSource.filter((entry): entry is string => typeof entry === "string") : [],
      },
    exceptions: Array.isArray(exceptionSource)
      ? exceptionSource.filter((entry): entry is string => typeof entry === "string")
      : [],
    reason: stringField(entry, "reason"),
  };
}

/** Maps the keyed items of every declared operation group, in order, skipping groups that hold no entries. */
function operationItems<T>(operations: unknown, mapItem: (id: string, entry: unknown) => T): DeltaOperation<T>[] {
  if (typeof operations !== "object" || operations === null) {
    return [];
  }
  const groups: DeltaOperation<T>[] = [];
  for (const operation of OPERATION_ORDER) {
    const entries = (operations as Record<string, unknown>)[operation];
    if (typeof entries !== "object" || entries === null) {
      continue;
    }
    const items = Object.entries(entries as Record<string, unknown>).map(([id, entry]) => mapItem(id, entry));
    if (items.length === 0) {
      continue;
    }
    groups.push({ operation, items });
  }
  return groups;
}

/** The top-level keys the delta spec layout presents. */
const DELTA_SPEC_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "target_spec", "spec", "operations",
]);

/** Maps one parsed delta spec onto the delta spec view's presentation. */
export function deltaSpecView(data: unknown): DedicatedView<DeltaSpecBody> {
  const newSpec = soleValue(data, "spec");
  const body: DeltaSpecBody = {
    targetSpec: stringField(data, "target_spec"),
    newSpec: newSpec === undefined
      ? undefined
      : { title: stringField(newSpec, "title"), path: stringField(newSpec, "path") },
    operations: operationItems(soleValue(data, "operations"), requirementBody),
  };
  return { ...partitionDocument(data, DELTA_SPEC_KEYS), body };
}

/** The top-level keys the delta scene layout presents. */
const DELTA_SCENE_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "target_scene", "operations",
]);

/** Maps one parsed delta scene onto the delta scene view's presentation. */
export function deltaSceneView(data: unknown): DedicatedView<DeltaSceneBody> {
  const operationsSource = soleValue(data, "operations");
  const operations: DeltaSceneBody["operations"][number][] = [];
  if (typeof operationsSource === "object" && operationsSource !== null) {
    for (const operation of OPERATION_ORDER) {
      const group = (operationsSource as Record<string, unknown>)[operation];
      if (typeof group !== "object" || group === null) {
        continue;
      }
      const exceptionSource = soleValue(group, "exception_flows");
      const exceptionFlows: ExceptionFlow[] = [];
      if (typeof exceptionSource === "object" && exceptionSource !== null) {
        for (const [flowId, flow] of Object.entries(exceptionSource as Record<string, unknown>)) {
          exceptionFlows.push({
            id: flowId,
            trigger: stringField(flow, "trigger"),
            steps: keyedSteps(soleValue(flow, "steps")),
          });
        }
      }
      const mainFlow = keyedSteps(soleValue(group, "main_flow"));
      if (mainFlow.length === 0 && exceptionFlows.length === 0) {
        continue;
      }
      operations.push({
        operation,
        mainFlow,
        exceptionFlows,
      });
    }
  }
  const body: DeltaSceneBody = {
    targetScene: stringField(data, "target_scene"),
    operations,
  };
  return { ...partitionDocument(data, DELTA_SCENE_KEYS), body };
}

/** The top-level keys the delta tech layout presents. */
const DELTA_TECH_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "target_standard", "standard", "operations",
]);

/** Maps one parsed delta tech onto the delta tech view's presentation. */
export function deltaTechView(data: unknown): DedicatedView<DeltaTechBody> {
  const newStandard = soleValue(data, "standard");
  const body: DeltaTechBody = {
    targetStandard: stringField(data, "target_standard"),
    newStandard: newStandard === undefined
      ? undefined
      : { title: stringField(newStandard, "title"), category: stringField(newStandard, "category") },
    operations: operationItems(soleValue(data, "operations"), techRule),
  };
  return { ...partitionDocument(data, DELTA_TECH_KEYS), body };
}
