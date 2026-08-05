import { generateArchitectureDocument, getArchitectureStatus } from "../architecture.js";
import { authorArchitecture, type ArchitectureAuthorInput } from "../architecture-author.js";
import { DocumentSourceError } from "../document-render.js";
import { handleHelpRequest, parseDocumentGenerateArgs } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeUsage } from "./output.js";

const ARCHITECTURE_EDIT_FLAGS = new Set([
  "id", "title", "component", "component-title", "component-responsibility", "boundary", "depends-on",
  "implementation", "flow", "flow-title", "flow-trigger", "flow-step", "flow-component", "decision",
  "decision-title", "decision-statement", "decision-rationale", "decision-status", "alternative", "remove-component",
  "remove-flow", "remove-decision", "remove-boundary", "remove-dependency", "remove-implementation", "remove-flow-step",
  "remove-flow-component", "remove-alternative",
]);

function parseArchitectureFlags(argv: string[]): Record<string, string[]> {
  const flags: Record<string, string[]> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") || token === "--") throw new Error(`unexpected argument '${token}'`);
    const equals = token.indexOf("=");
    const name = token.slice(2, equals === -1 ? undefined : equals);
    if (name === "delete") {
      if (equals !== -1) throw new Error("--delete does not accept a value");
      flags.delete = ["true"];
      continue;
    }
    if (!ARCHITECTURE_EDIT_FLAGS.has(name)) throw new Error(`unsupported argument --${name}`);
    const value = equals === -1 ? argv[index + 1] : token.slice(equals + 1);
    if (value === undefined || (equals === -1 && value.startsWith("--")) || value.length === 0) throw new Error(`missing value for --${name}`);
    flags[name] ??= [];
    flags[name].push(value);
    if (equals === -1) index += 1;
  }
  return flags;
}

function scalar(flags: Record<string, string[]>, name: string): string | undefined {
  const values = flags[name] ?? [];
  if (values.length > 1) throw new Error(`--${name} may be supplied at most once`);
  return values[0];
}

function parseArchitectureEditArgs(argv: string[]): ArchitectureAuthorInput {
  const flags = parseArchitectureFlags(argv);
  const componentId = scalar(flags, "component");
  const hasComponent = ["component-title", "component-responsibility", "boundary", "depends-on", "implementation"]
    .some((name) => (flags[name]?.length ?? 0) > 0);
  if (hasComponent && componentId === undefined) throw new Error("component fields require --component");
  const flowId = scalar(flags, "flow");
  const hasFlow = ["flow-title", "flow-trigger", "flow-step", "flow-component"].some((name) => (flags[name]?.length ?? 0) > 0);
  if (hasFlow && flowId === undefined) throw new Error("data-flow fields require --flow");
  const decisionId = scalar(flags, "decision");
  const hasDecision = ["decision-title", "decision-statement", "decision-rationale", "decision-status", "alternative"]
    .some((name) => (flags[name]?.length ?? 0) > 0);
  if (hasDecision && decisionId === undefined) throw new Error("decision fields require --decision");
  return {
    id: scalar(flags, "id"),
    title: scalar(flags, "title"),
    ...(componentId === undefined ? {} : {
      component: {
        id: componentId,
        title: scalar(flags, "component-title"),
        responsibility: scalar(flags, "component-responsibility"),
        boundaries: flags.boundary ?? [],
        dependsOn: flags["depends-on"] ?? [],
        implementation: flags.implementation ?? [],
      },
    }),
    ...(flowId === undefined ? {} : {
      dataFlow: {
        id: flowId,
        title: scalar(flags, "flow-title"),
        trigger: scalar(flags, "flow-trigger"),
        steps: flags["flow-step"] ?? [],
        components: flags["flow-component"] ?? [],
      },
    }),
    ...(decisionId === undefined ? {} : {
      decision: {
        id: decisionId,
        title: scalar(flags, "decision-title"),
        statement: scalar(flags, "decision-statement"),
        rationale: scalar(flags, "decision-rationale"),
        status: scalar(flags, "decision-status"),
        alternatives: flags.alternative ?? [],
      },
    }),
    removeComponents: flags["remove-component"] ?? [],
    removeDataFlows: flags["remove-flow"] ?? [],
    removeDecisions: flags["remove-decision"] ?? [],
    removeBoundaries: flags["remove-boundary"] ?? [],
    removeDependencies: flags["remove-dependency"] ?? [],
    removeImplementations: flags["remove-implementation"] ?? [],
    removeFlowSteps: flags["remove-flow-step"] ?? [],
    removeFlowComponents: flags["remove-flow-component"] ?? [],
    removeAlternatives: flags["remove-alternative"] ?? [],
    delete: flags.delete !== undefined,
  };
}

export function runArchitectureEdit(argv: string[]): number {
  if (handleHelpRequest("architecture-edit", argv)) return 0;
  try {
    const result = authorArchitecture(process.cwd(), parseArchitectureEditArgs(argv));
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(getCommandUsage("architecture-edit"));
    return 1;
  }
}

export function runArchitectureGenerate(argv: string[]): number {
  if (handleHelpRequest("architecture-generate", argv)) {
    return 0;
  }

  const parsed = parseDocumentGenerateArgs(argv);
  if (!parsed) {
    writeUsage(getCommandUsage("architecture-generate"));
    return 1;
  }

  try {
    const result = generateArchitectureDocument(process.cwd(), { check: parsed.check, outputPath: parsed.outputPath });
    writeJson(result);
    if (result.current) {
      return 0;
    }
    if (!result.documentExists) {
      writeError(`architecture document is missing: ${result.outputPath}; run architecture-generate to render it`);
      return 1;
    }
    writeError(
      `architecture document is stale: ${result.outputPath}; re-render it after changing ${result.staleSources.join(", ")}`,
    );
    return 1;
  } catch (error) {
    if (error instanceof DocumentSourceError) {
      writeError(error.message);
      return 1;
    }
    writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function runArchitectureStatus(argv: string[]): number {
  if (handleHelpRequest("architecture-status", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("architecture-status"));
    return 1;
  }

  try {
    const result = getArchitectureStatus(process.cwd());
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    if (error instanceof DocumentSourceError) {
      writeError(error.message);
      return 1;
    }
    writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
