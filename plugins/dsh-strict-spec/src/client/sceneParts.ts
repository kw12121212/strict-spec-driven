/**
 * The scene view-model mappers: turn one parsed scene and one parsed
 * scenes index into the presentation structure their dedicated renderers
 * draw, keeping the mapping React-free so rendered structure is
 * deterministically testable under bun test/run.ts.
 *
 * Every mapper follows the same unknown-field contract the milestone's
 * unknown-field-display answer settles: the scalar header renders exactly
 * as the generic view draws it, the dedicated body presents the declared
 * fields the layout knows, and every top-level field the layout does not
 * present survives as generic blocks an additional-fields section renders,
 * so a newer schema version never makes content disappear from the reader.
 *
 * The module also owns the coverage navigation the scene view adds: a
 * step's covering reference resolves against the tree's documents record
 * by declared spec id and opens the covering requirement's anchor through
 * the shared viewer open action only, mirroring the roadmap navigator's
 * open-action contract with a visible unresolved marker when a reference
 * resolves to no held document.
 */
import type { DedicatedView } from "./changeParts.ts";
import { partitionDocument, soleValue, stringEntries, stringField } from "./recordFields.ts";
import { keyedSteps } from "./deltaParts.ts";
import type { ExceptionFlow, SceneStep } from "./deltaParts.ts";
import { requirementAnchor } from "./specParts.ts";
import type { ViewerActions } from "../model/store.ts";
import type { DocumentRecord } from "../model/nodes.ts";

/** One actor of a scene: the declared name with its responsibility. */
export interface SceneActor {
  readonly name: string;
  readonly role?: string;
}

/** The scene view body: identity, cast, preconditions, and both flow kinds. */
export interface SceneViewBody {
  /** The single declared scene's id and title, when the file declares them. */
  readonly scene?: { readonly id?: string; readonly title?: string };
  /** The declared area grouping key. */
  readonly area?: string;
  /** The declared top-level status. */
  readonly status?: string;
  readonly actors: readonly SceneActor[];
  readonly preconditions: readonly string[];
  /** The ordered main-flow steps, in declaration order. */
  readonly mainFlow: readonly SceneStep[];
  /** The declared exception flows, each under its trigger. */
  readonly exceptionFlows: readonly ExceptionFlow[];
}

/** The top-level keys the scene layout presents. */
const SCENE_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "scene", "area", "status", "actors", "preconditions",
  "main_flow", "exception_flows",
]);

/** Reads one declared actor entry of a scene's cast. */
function sceneActor(entry: unknown): SceneActor | undefined {
  const name = stringField(entry, "name");
  if (name === undefined) {
    return undefined;
  }
  return { name, role: stringField(entry, "role") };
}

/**
 * Maps one parsed scene onto the scene view's presentation: the declared
 * identity and status, the cast with their responsibilities, the ordered
 * main flow, and the exception flows each under its declared trigger,
 * with every step mapped through the same step mapper the delta scene
 * view uses, so a step reads the same way before and after it merges.
 */
export function sceneView(data: unknown): DedicatedView<SceneViewBody> {
  const scene = soleValue(data, "scene");
  const actorsSource = soleValue(data, "actors");
  const actors: SceneActor[] = [];
  if (Array.isArray(actorsSource)) {
    for (const entry of actorsSource) {
      const actor = sceneActor(entry);
      if (actor !== undefined) {
        actors.push(actor);
      }
    }
  }
  const exceptionSource = soleValue(data, "exception_flows");
  const exceptionFlows: ExceptionFlow[] = [];
  if (typeof exceptionSource === "object" && exceptionSource !== null && !Array.isArray(exceptionSource)) {
    for (const [flowId, flow] of Object.entries(exceptionSource as Record<string, unknown>)) {
      exceptionFlows.push({
        id: flowId,
        trigger: stringField(flow, "trigger"),
        steps: keyedSteps(soleValue(flow, "steps")),
      });
    }
  }
  const body: SceneViewBody = {
    scene: scene === undefined
      ? undefined
      : { id: stringField(scene, "id"), title: stringField(scene, "title") },
    area: stringField(data, "area"),
    status: stringField(data, "status"),
    actors,
    preconditions: stringEntries(soleValue(data, "preconditions")),
    mainFlow: keyedSteps(soleValue(data, "main_flow")),
    exceptionFlows,
  };
  return { ...partitionDocument(data, SCENE_KEYS), body };
}

/** One scene entry of a scenes index area, as the index file declares it. */
export interface ScenesIndexEntry {
  /** The scene id the index records the entry under. */
  readonly id: string;
  /** The declared title, when the entry carries one. */
  readonly title?: string;
  /** The declared status, when the entry carries one. */
  readonly status?: string;
  /** The declared scene file path, when the entry carries one. */
  readonly path?: string;
}

/** One area group of the scenes index view. */
export interface ScenesAreaGroup {
  /** The declared area key the index groups its scene entries under. */
  readonly area: string;
  /** The entries the index declares under this area. */
  readonly scenes: readonly ScenesIndexEntry[];
}

/** The scenes index view body: entries grouped by their declared areas. */
export interface ScenesIndexBody {
  readonly groups: readonly ScenesAreaGroup[];
}

/** The top-level keys the scenes index layout presents. */
const SCENES_INDEX_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file", "areas",
]);

/**
 * Maps one parsed scenes index onto the index view's presentation: the
 * declared areas each hold their keyed scene entries in declaration
 * order, exactly as the index groups them.
 */
export function scenesIndexView(data: unknown): DedicatedView<ScenesIndexBody> {
  const areasSource = soleValue(data, "areas");
  const groups: ScenesAreaGroup[] = [];
  if (typeof areasSource === "object" && areasSource !== null && !Array.isArray(areasSource)) {
    for (const [area, areaSource] of Object.entries(areasSource as Record<string, unknown>)) {
      const scenes: ScenesIndexEntry[] = [];
      if (typeof areaSource === "object" && areaSource !== null && !Array.isArray(areaSource)) {
        for (const [id, entry] of Object.entries(areaSource as Record<string, unknown>)) {
          scenes.push({
            id,
            title: stringField(entry, "title"),
            status: stringField(entry, "status"),
            path: stringField(entry, "path"),
          });
        }
      }
      groups.push({ area, scenes });
    }
  }
  return { ...partitionDocument(data, SCENES_INDEX_KEYS), body: { groups } };
}

/**
 * Resolves one covering reference against the tree's documents record:
 * the non-archived main-spec document whose recorded spec id matches and,
 * when the reference names a requirement, whose recorded requirement ids
 * hold it. Archived files stay unread while they are only listed, and
 * scenes carry no archive, so an unrecorded target reports as not found —
 * including a reference naming a held spec but a requirement that spec
 * does not declare, which would otherwise render as a link that opens
 * silently un-anchored.
 */
export function resolveSpecTarget(
  documents: Readonly<Record<string, DocumentRecord>>,
  specId: string,
  requirementId?: string,
): DocumentRecord | undefined {
  const target = Object.values(documents).find(
    (record) => !record.archived && record.family === "specs" && record.specId === specId,
  );
  if (target === undefined) {
    return undefined;
  }
  if (requirementId !== undefined && target.requirementIds !== undefined && !target.requirementIds.includes(requirementId)) {
    return undefined;
  }
  return target;
}

/** The navigator the scene view uses to open a covering requirement. */
export interface SceneNavigator {
  /**
   * Opens the spec one covering reference names, anchored at its named
   * requirement, when the spec resolves in the loaded tree; returns
   * whether it opened.
   */
  openRequirement(specId: string, requirementId: string): boolean;
}

/**
 * Creates the scene navigator over the shared viewer open action: the one
 * action a tree row uses, so a requirement opened from a rendered coverage
 * link behaves exactly as a document opened from the tree. A reference
 * whose spec or named requirement resolves to no held document opens
 * nothing. The navigator reads only passed-in state and touches no store,
 * port, or tree mutation.
 */
export function createSceneNavigator(
  actions: Pick<ViewerActions, "openDocument">,
  sessionId: string,
  documents: Readonly<Record<string, DocumentRecord>>,
): SceneNavigator {
  return {
    openRequirement(specId: string, requirementId: string): boolean {
      const target = resolveSpecTarget(documents, specId, requirementId);
      if (target === undefined) {
        return false;
      }
      void actions.openDocument(sessionId, target.path, requirementAnchor(specId, requirementId));
      return true;
    },
  };
}
