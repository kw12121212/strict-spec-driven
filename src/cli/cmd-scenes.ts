import {
  authorScene,
  getSceneStatus,
  type SceneAuthorInput,
  type SceneCoverageRef,
  type SceneStatusOptions,
  type SceneStepInput,
} from "../scenes.js";
import { handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeUsage } from "./output.js";

export const SCENE_EDIT_FLAGS = [
  "title", "area", "status",
  "actor", "role", "precondition",
  "exception-flow", "trigger",
  "step", "exception-step", "action", "covered-by", "remove-covered-by", "no-coverage-reason",
  "remove-actor", "remove-precondition", "remove-exception-flow", "remove-step",
  "delete",
] as const;

export const SCENE_STATUS_FLAGS = ["area", "scene"] as const;

/** Flags that belong to the step group most recently opened by --step or --exception-step. */
const STEP_SCOPED_FLAGS = new Set(["action", "covered-by", "remove-covered-by", "no-coverage-reason"]);

type ParsedToken = { name: string; value?: string };

function tokenize(argv: string[], allowed: readonly string[], valueless: ReadonlySet<string>): ParsedToken[] {
  const allowedSet = new Set(allowed);
  const tokens: ParsedToken[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token === "--") throw new Error(`unexpected argument '${token ?? ""}'`);
    const equals = token.indexOf("=");
    const name = token.slice(2, equals === -1 ? undefined : equals);
    if (!allowedSet.has(name)) throw new Error(`unsupported argument --${name}`);
    if (valueless.has(name)) {
      if (equals !== -1) throw new Error(`--${name} does not accept a value`);
      tokens.push({ name });
      continue;
    }
    const value = equals === -1 ? argv[index + 1] : token.slice(equals + 1);
    if (value === undefined || value.length === 0 || (equals === -1 && value.startsWith("--"))) {
      throw new Error(`missing value for --${name}`);
    }
    tokens.push({ name, value });
    if (equals === -1) index += 1;
  }
  return tokens;
}

function parseCoverageRef(value: string, flagName: string): SceneCoverageRef {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`--${flagName} expects <spec-id>:<requirement-id>, received '${value}'`);
  }
  return { spec_id: value.slice(0, separator), requirement_id: value.slice(separator + 1) };
}

function parseExceptionStepRef(value: string): { flowId: string; stepId: string } {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`--exception-step expects <flow-id>:<step-id>, received '${value}'`);
  }
  return { flowId: value.slice(0, separator), stepId: value.slice(separator + 1) };
}

function parseSceneEditInput(id: string, argv: string[]): SceneAuthorInput {
  const tokens = tokenize(argv, SCENE_EDIT_FLAGS, new Set(["delete"]));
  const input: SceneAuthorInput = {
    id,
    actors: [],
    preconditions: [],
    exceptionFlows: [],
    steps: [],
    removeActors: [],
    removePreconditions: [],
    removeExceptionFlows: [],
    removeSteps: [],
    delete: false,
  };
  const actorNames: string[] = [];
  const actorRoles: string[] = [];
  const exceptionIds: string[] = [];
  const exceptionTriggers: string[] = [];
  let openStep: SceneStepInput | undefined;

  const single = (name: string, current: string | undefined, value: string): string => {
    if (current !== undefined) throw new Error(`--${name} may be supplied at most once`);
    return value;
  };

  for (const token of tokens) {
    const value = token.value as string;
    if (STEP_SCOPED_FLAGS.has(token.name)) {
      if (openStep === undefined) {
        throw new Error(`--${token.name} requires an open step; supply --step <id> or --exception-step <flow-id>:<step-id> first`);
      }
      switch (token.name) {
        case "action":
          openStep.action = single("action", openStep.action, value);
          break;
        case "covered-by":
          openStep.coveredBy.push(parseCoverageRef(value, "covered-by"));
          break;
        case "remove-covered-by":
          openStep.removeCoverage.push(parseCoverageRef(value, "remove-covered-by"));
          break;
        default:
          openStep.noCoverageReason = single("no-coverage-reason", openStep.noCoverageReason, value);
      }
      continue;
    }

    switch (token.name) {
      case "step":
        openStep = { id: value, coveredBy: [], removeCoverage: [] };
        input.steps.push(openStep);
        break;
      case "exception-step": {
        const reference = parseExceptionStepRef(value);
        openStep = { id: reference.stepId, exceptionFlow: reference.flowId, coveredBy: [], removeCoverage: [] };
        input.steps.push(openStep);
        break;
      }
      case "title":
        input.title = single("title", input.title, value);
        break;
      case "area":
        input.area = single("area", input.area, value);
        break;
      case "status":
        input.status = single("status", input.status, value);
        break;
      case "actor":
        actorNames.push(value);
        break;
      case "role":
        actorRoles.push(value);
        break;
      case "precondition":
        input.preconditions.push(value);
        break;
      case "exception-flow":
        exceptionIds.push(value);
        break;
      case "trigger":
        exceptionTriggers.push(value);
        break;
      case "remove-actor":
        input.removeActors.push(value);
        break;
      case "remove-precondition":
        input.removePreconditions.push(value);
        break;
      case "remove-exception-flow":
        input.removeExceptionFlows.push(value);
        break;
      case "remove-step":
        input.removeSteps.push(value);
        break;
      case "delete":
        input.delete = true;
        break;
      default:
        // Never fall through to a destructive default: a flag added to the allow-list without a
        // case here must fail loudly rather than silently read as a whole-scene deletion.
        throw new Error(`--${token.name} is accepted but not handled; this is a defect in scene-edit argument parsing`);
    }
  }

  if (actorNames.length !== actorRoles.length) {
    throw new Error("--actor and --role must be supplied in equal counts, one --role per --actor");
  }
  if (exceptionIds.length !== exceptionTriggers.length) {
    throw new Error("--exception-flow and --trigger must be supplied in equal counts, one --trigger per --exception-flow");
  }
  input.actors = actorNames.map((name, index) => ({ name, role: actorRoles[index] as string }));
  input.exceptionFlows = exceptionIds.map((flowId, index) => ({ id: flowId, trigger: exceptionTriggers[index] as string }));
  return input;
}

function parseSceneStatusOptions(argv: string[]): SceneStatusOptions {
  const tokens = tokenize(argv, SCENE_STATUS_FLAGS, new Set());
  const options: SceneStatusOptions = {};
  for (const token of tokens) {
    if (token.name === "area") {
      if (options.area !== undefined) throw new Error("--area may be supplied at most once");
      options.area = token.value;
      continue;
    }
    if (token.name !== "scene") {
      throw new Error(`--${token.name} is accepted but not handled; this is a defect in scene-status argument parsing`);
    }
    if (options.sceneId !== undefined) throw new Error("--scene may be supplied at most once");
    options.sceneId = token.value;
  }
  return options;
}

export function runSceneEdit(argv: string[]): number {
  if (handleHelpRequest("scene-edit", argv)) return 0;
  const [id, ...flagArgs] = argv;
  if (id === undefined || id.startsWith("--")) {
    writeUsage(getCommandUsage("scene-edit"));
    return 1;
  }
  try {
    const result = authorScene(process.cwd(), parseSceneEditInput(id, flagArgs));
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(getCommandUsage("scene-edit"));
    return 1;
  }
}

export function runSceneStatus(argv: string[]): number {
  if (handleHelpRequest("scene-status", argv)) return 0;
  try {
    const result = getSceneStatus(process.cwd(), parseSceneStatusOptions(argv));
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(getCommandUsage("scene-status"));
    return 1;
  }
}
