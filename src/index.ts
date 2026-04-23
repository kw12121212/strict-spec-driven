#!/usr/bin/env node
import { fileURLToPath } from "url";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";
import { compileSchema, createSchemaValidator } from "./validation.js";
import {
  findMissingRequiredScaffoldAssets,
  getBundledScaffoldPath,
  getRequiredBundledScaffoldAssets,
  initializeStrictScaffold,
  loadBundledScaffoldYaml,
  readBundledScaffoldTemplate,
} from "./scaffold.js";

export type CommandHandler = (argv: string[]) => number | void;
export const commands: Record<string, CommandHandler> = {};
export { parseYamlDocument, stringifyYamlDocument };
export { compileSchema, createSchemaValidator };
export {
  getBundledScaffoldPath,
  readBundledScaffoldTemplate,
  loadBundledScaffoldYaml,
  getRequiredBundledScaffoldAssets,
  findMissingRequiredScaffoldAssets,
  initializeStrictScaffold,
};

function runInit(): number {
  const missingAssets = findMissingRequiredScaffoldAssets();
  if (missingAssets.length > 0) {
    process.stderr.write("Error: missing bundled scaffold assets required by init:\n");
    for (const assetPath of missingAssets) {
      process.stderr.write(`- ${assetPath}\n`);
    }
    return 1;
  }

  const result = initializeStrictScaffold(process.cwd());

  for (const warning of result.warnings) {
    process.stderr.write(`${warning}\n`);
  }
  process.stdout.write(`Initialized ${result.rootDir}\n`);
  process.stdout.write(`Created ${result.created.length} scaffold file(s).\n`);
  process.stdout.write(`Skipped ${result.skipped.length} existing scaffold file(s).\n`);
  return 0;
}

commands.init = () => runInit();

export function run(argv: string[]): number {
  const [subcommand, ...subcommandArgs] = argv;
  if (!subcommand || !(subcommand in commands)) {
    process.stderr.write("Usage: strict-spec-driven <command>\n");
    if (Object.keys(commands).length > 0) {
      process.stderr.write(`Commands: ${Object.keys(commands).join(", ")}\n`);
    }
    return 1;
  }
  const status = commands[subcommand](subcommandArgs);
  return typeof status === "number" ? status : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)));
}
