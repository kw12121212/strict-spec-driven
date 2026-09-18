// Repository-maintenance editing commands for this repository's bundled YAML assets. Each command
// owns one inventory family; the shared module owns confinement, validation, and the transaction.
import {
  mutateBundledAsset,
  type BundledAssetEdit,
  type BundledAssetFamily,
} from "../bundled-asset-mutation.js";
import { handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeJson, writeUsage } from "./output.js";

type ParsedEditArgs = {
  assetName?: string;
  edits: BundledAssetEdit[];
  delete: boolean;
};

/**
 * Parse the shared editing flag set. `--set`/`--append` each open one edit that its paired value
 * flag closes, so the order the caller supplies edits in is the order they are applied.
 */
function parseEditArgs(argv: string[], expectsAssetName: boolean): ParsedEditArgs | { error: string } {
  const parsed: ParsedEditArgs = { edits: [], delete: false };
  let index = 0;

  if (expectsAssetName) {
    const first = argv[0];
    if (first !== undefined && !first.startsWith("--")) {
      parsed.assetName = first;
      index = 1;
    }
  }

  let pending: { kind: "set" | "append"; fieldPath: string } | undefined;
  for (; index < argv.length; index += 1) {
    const rawToken = argv[index] as string;
    // `--flag=value` is the repository's convention for a value that begins with a dash, which a
    // field edit genuinely needs: negative numbers and dash-leading strings are ordinary YAML.
    const separator = rawToken.startsWith("--") ? rawToken.indexOf("=") : -1;
    const token = separator === -1 ? rawToken : rawToken.slice(0, separator);
    const inlineValue = separator === -1 ? undefined : rawToken.slice(separator + 1);
    const takeValue = (): string | undefined => {
      if (inlineValue !== undefined) return inlineValue;
      const value = argv[index + 1];
      if (value === undefined) return undefined;
      index += 1;
      return value;
    };

    if (token === "--delete") {
      parsed.delete = true;
      continue;
    }
    if (token === "--set" || token === "--append") {
      if (pending) return { error: `${pending.kind === "set" ? "--set" : "--append"} '${pending.fieldPath}' is missing its value` };
      const fieldPath = takeValue();
      if (fieldPath === undefined) return { error: `${token} requires a field path` };
      pending = { kind: token === "--set" ? "set" : "append", fieldPath };
      continue;
    }
    if (token === "--value" || token === "--item") {
      if (!pending) return { error: `${token} must follow --set or --append` };
      const expected = pending.kind === "set" ? "--value" : "--item";
      if (token !== expected) return { error: `--${pending.kind} pairs with ${expected}, not ${token}` };
      const value = takeValue();
      if (value === undefined) return { error: `${token} requires a value` };
      parsed.edits.push(pending.kind === "set"
        ? { kind: "set", fieldPath: pending.fieldPath, value }
        : { kind: "append", fieldPath: pending.fieldPath, value });
      pending = undefined;
      continue;
    }
    if (token === "--create-empty-list") {
      const fieldPath = takeValue();
      if (fieldPath === undefined) return { error: "--create-empty-list requires a field path" };
      parsed.edits.push({ kind: "create-list", fieldPath });
      continue;
    }
    if (token === "--remove-entry") {
      const fieldPath = takeValue();
      if (fieldPath === undefined) return { error: "--remove-entry requires a field path" };
      parsed.edits.push({ kind: "remove", fieldPath });
      continue;
    }
    return { error: `unsupported argument: ${rawToken}` };
  }
  if (pending) return { error: `--${pending.kind} '${pending.fieldPath}' is missing its value` };
  return parsed;
}

function runBundledAssetEdit(
  commandName: string,
  family: BundledAssetFamily,
  argv: string[],
  options: { expectsAssetName: boolean },
): number {
  if (handleHelpRequest(commandName, argv)) return 0;
  const usage = getCommandUsage(commandName);

  const parsed = parseEditArgs(argv, options.expectsAssetName);
  if ("error" in parsed) {
    writeJson({
      family,
      valid: false,
      committed: false,
      changes: [],
      diagnostics: [{ artifactPath: `<${family}>`, phase: "planning", code: "usage-error", fieldPath: "$", message: parsed.error }],
    });
    writeUsage(usage);
    return 1;
  }
  if (options.expectsAssetName && !parsed.assetName) {
    writeUsage(usage);
    return 1;
  }

  const outcome = mutateBundledAsset({
    family,
    ...(parsed.assetName !== undefined ? { assetName: parsed.assetName } : {}),
    edits: parsed.edits,
    delete: parsed.delete,
  });
  writeJson({
    family: outcome.family,
    ...(outcome.assetPath ? { assetPath: outcome.assetPath } : {}),
    valid: outcome.valid,
    committed: outcome.committed,
    changes: outcome.changes,
    diagnostics: outcome.diagnostics,
  });
  return outcome.exitStatus;
}

export function runSchemaEdit(argv: string[]): number {
  return runBundledAssetEdit("schema-edit", "bundled-schema-assets", argv, { expectsAssetName: true });
}

export function runTemplateEdit(argv: string[]): number {
  return runBundledAssetEdit("template-edit", "bundled-scaffold-assets", argv, { expectsAssetName: true });
}

export function runSampleEdit(argv: string[]): number {
  return runBundledAssetEdit("sample-edit", "bundled-reference-examples", argv, { expectsAssetName: true });
}

export function runFixtureEdit(argv: string[]): number {
  return runBundledAssetEdit("fixture-edit", "validation-fixtures", argv, { expectsAssetName: true });
}

export function runInventoryEdit(argv: string[]): number {
  return runBundledAssetEdit("inventory-edit", "yaml-mutation-inventory", argv, { expectsAssetName: false });
}
