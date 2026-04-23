#!/usr/bin/env node
import { fileURLToPath } from "url";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";
import { compileSchema, createSchemaValidator } from "./validation.js";
import {
  findMissingRequiredScaffoldAssets,
  getBundledScaffoldPath,
  getRequiredBundledScaffoldAssets,
  loadBundledScaffoldYaml,
  readBundledScaffoldTemplate,
} from "./scaffold.js";

export const commands: Record<string, () => void> = {};
export { parseYamlDocument, stringifyYamlDocument };
export { compileSchema, createSchemaValidator };
export {
  getBundledScaffoldPath,
  readBundledScaffoldTemplate,
  loadBundledScaffoldYaml,
  getRequiredBundledScaffoldAssets,
  findMissingRequiredScaffoldAssets,
};

export function run(argv: string[]): number {
  const [subcommand] = argv;
  if (!subcommand || !(subcommand in commands)) {
    process.stderr.write("Usage: strict-spec-driven <command>\n");
    if (Object.keys(commands).length > 0) {
      process.stderr.write(`Commands: ${Object.keys(commands).join(", ")}\n`);
    }
    return 1;
  }
  commands[subcommand]();
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)));
}
