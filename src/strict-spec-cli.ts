#!/usr/bin/env node
import { fileURLToPath } from "url";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";
import { compileSchema, createSchemaValidator } from "./validation.js";
import {
  findMissingRequiredChangeTemplateAssets,
  findMissingRequiredScaffoldAssets,
  getBundledScaffoldPath,
  getRequiredBundledChangeTemplateAssets,
  getRequiredBundledScaffoldAssets,
  initializeStrictChangeScaffold,
  initializeStrictScaffold,
  loadBundledScaffoldYaml,
  readBundledScaffoldTemplate,
} from "./scaffold.js";
import { applyTask, readChangeTasks, writeChangeTasks } from "./apply.js";

export type CommandHandler = (argv: string[]) => number | void;
export const commands: Record<string, CommandHandler> = {};
const CHANGE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export { parseYamlDocument, stringifyYamlDocument };
export { compileSchema, createSchemaValidator };
export {
  getBundledScaffoldPath,
  readBundledScaffoldTemplate,
  loadBundledScaffoldYaml,
  getRequiredBundledScaffoldAssets,
  findMissingRequiredScaffoldAssets,
  getRequiredBundledChangeTemplateAssets,
  findMissingRequiredChangeTemplateAssets,
  initializeStrictScaffold,
  initializeStrictChangeScaffold,
};
export { applyTask, readChangeTasks, writeChangeTasks };

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

function runPropose(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (!changeName || extraArgs.length > 0) {
    process.stderr.write("Usage: strict-spec-driven propose <change-name>\n");
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    process.stderr.write("Error: change name must be kebab-case (lowercase letters, numbers, and hyphens)\n");
    return 1;
  }

  const missingAssets = findMissingRequiredChangeTemplateAssets();
  if (missingAssets.length > 0) {
    process.stderr.write("Error: missing bundled change templates required by propose:\n");
    for (const assetPath of missingAssets) {
      process.stderr.write(`- ${assetPath}\n`);
    }
    return 1;
  }

  try {
    const result = initializeStrictChangeScaffold(process.cwd(), changeName);
    process.stdout.write(`Created strict change scaffold at ${result.changeDir}/\n`);
    process.stdout.write("Planning artifacts:\n");
    for (const artifactPath of result.planningArtifacts) {
      process.stdout.write(`- ${artifactPath}\n`);
    }
    process.stdout.write(`- ${result.specsDir}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }
}

commands.init = () => runInit();
commands.propose = (argv) => runPropose(argv);

function runApply(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (!changeName || extraArgs.length > 0) {
    process.stderr.write("Usage: strict-spec-driven apply <change-name>\n");
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    process.stderr.write("Error: change name must be kebab-case (lowercase letters, numbers, and hyphens)\n");
    return 1;
  }

  try {
    const tasksYaml = readChangeTasks(process.cwd(), changeName);
    const { result, updatedYaml } = applyTask(tasksYaml);
    writeChangeTasks(process.cwd(), changeName, updatedYaml);
    process.stdout.write(JSON.stringify(result) + "\n");
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }
}

commands.apply = (argv) => runApply(argv);

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
