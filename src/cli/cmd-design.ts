import { generateDesignDocument, getDesignSystemStatus, initializeDesignSystemArtifact } from "../design-system.js";
import { authorDesignSystem, type DesignSystemAuthorInput } from "../design-system-author.js";
import { DocumentSourceError } from "../document-render.js";
import { handleHelpRequest, parseDocumentGenerateArgs } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeUsage } from "./output.js";
import { withRerenderedDocuments } from "./generated-document-rerender.js";

const DESIGN_EDIT_FLAGS = new Set([
  "id", "title", "token-group", "token", "token-value", "token-property", "component", "component-title",
  "component-description", "component-token", "implementation", "snapshot", "overview", "do", "dont",
  "remove-token", "remove-component", "remove-component-token", "remove-implementation", "remove-snapshot", "remove-do", "remove-dont",
]);

function parseDesignFlags(argv: string[]): Record<string, string[]> {
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
    if (!DESIGN_EDIT_FLAGS.has(name)) throw new Error(`unsupported argument --${name}`);
    const value = equals === -1 ? argv[index + 1] : token.slice(equals + 1);
    if (value === undefined || (equals === -1 && value.startsWith("--")) || value.length === 0) throw new Error(`missing value for --${name}`);
    flags[name] ??= [];
    flags[name].push(value);
    if (equals === -1) index += 1;
  }
  return flags;
}

function singleDesignValue(flags: Record<string, string[]>, name: string): string | undefined {
  const values = flags[name] ?? [];
  if (values.length > 1) throw new Error(`--${name} may be supplied at most once`);
  return values[0];
}

function parseDesignEditArgs(argv: string[]): DesignSystemAuthorInput {
  const flags = parseDesignFlags(argv);
  const tokenGroup = singleDesignValue(flags, "token-group");
  const tokenName = singleDesignValue(flags, "token");
  const hasToken = ["token-value", "token-property"].some((name) => (flags[name]?.length ?? 0) > 0);
  if ((tokenGroup !== undefined || tokenName !== undefined || hasToken) && (tokenGroup === undefined || tokenName === undefined)) {
    throw new Error("token authoring requires --token-group and --token");
  }
  const componentId = singleDesignValue(flags, "component");
  const hasComponent = ["component-title", "component-description", "component-token", "implementation", "snapshot"]
    .some((name) => (flags[name]?.length ?? 0) > 0);
  if (hasComponent && componentId === undefined) throw new Error("component fields require --component");
  return {
    id: singleDesignValue(flags, "id"),
    title: singleDesignValue(flags, "title"),
    ...(tokenGroup === undefined || tokenName === undefined ? {} : {
      token: { group: tokenGroup, name: tokenName, value: singleDesignValue(flags, "token-value"), properties: flags["token-property"] ?? [] },
    }),
    ...(componentId === undefined ? {} : {
      component: {
        id: componentId,
        title: singleDesignValue(flags, "component-title"),
        description: singleDesignValue(flags, "component-description"),
        tokens: flags["component-token"] ?? [],
        implementation: flags.implementation ?? [],
        snapshots: flags.snapshot ?? [],
      },
    }),
    overview: singleDesignValue(flags, "overview"),
    dos: flags.do ?? [],
    donts: flags.dont ?? [],
    removeTokens: flags["remove-token"] ?? [],
    removeComponents: flags["remove-component"] ?? [],
    removeComponentTokens: flags["remove-component-token"] ?? [],
    removeImplementations: flags["remove-implementation"] ?? [],
    removeSnapshots: flags["remove-snapshot"] ?? [],
    removeDos: flags["remove-do"] ?? [],
    removeDonts: flags["remove-dont"] ?? [],
    delete: flags.delete !== undefined,
  };
}

export function runDesignEdit(argv: string[]): number {
  if (handleHelpRequest("design-edit", argv)) return 0;
  try {
    const result = withRerenderedDocuments(process.cwd(), authorDesignSystem(process.cwd(), parseDesignEditArgs(argv)));
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    writeUsage(getCommandUsage("design-edit"));
    return 1;
  }
}

export function runDesignInit(argv: string[]): number {
  if (handleHelpRequest("design-init", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("design-init"));
    return 1;
  }

  try {
    writeJson(withRerenderedDocuments(process.cwd(), initializeDesignSystemArtifact(process.cwd())));
    return 0;
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function runDesignGenerate(argv: string[]): number {
  if (handleHelpRequest("design-generate", argv)) {
    return 0;
  }

  const parsed = parseDocumentGenerateArgs(argv);
  if (!parsed) {
    writeUsage(getCommandUsage("design-generate"));
    return 1;
  }

  try {
    const result = generateDesignDocument(process.cwd(), { check: parsed.check, outputPath: parsed.outputPath });
    writeJson(result);
    if (result.current) {
      return 0;
    }
    if (!result.documentExists) {
      writeError(`design document is missing: ${result.outputPath}; run design-generate to render it`);
      return 1;
    }
    writeError(
      `design document is stale: ${result.outputPath}; re-render it after changing ${result.staleSources.join(", ")}`,
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

export function runDesignStatus(argv: string[]): number {
  if (handleHelpRequest("design-status", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("design-status"));
    return 1;
  }

  try {
    const result = getDesignSystemStatus(process.cwd());
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
