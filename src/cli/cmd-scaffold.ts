import {
  findMissingRequiredChangeTemplateAssets,
  findMissingRequiredScaffoldAssets,
  initializeStrictChangeScaffold,
  initializeStrictScaffold,
} from "../scaffold.js";
import { CHANGE_NAME_PATTERN, handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeErr, writeError, writeOut, writeUsage } from "./output.js";

export function runInit(argv: string[] = []): number {
  if (handleHelpRequest("init", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("init"));
    return 1;
  }

  const missingAssets = findMissingRequiredScaffoldAssets();
  if (missingAssets.length > 0) {
    writeError("missing bundled scaffold assets required by init:");
    for (const assetPath of missingAssets) {
      writeErr(`- ${assetPath}\n`);
    }
    return 1;
  }

  const result = initializeStrictScaffold(process.cwd());

  for (const warning of result.warnings) {
    writeErr(`${warning}\n`);
  }
  writeOut(`Initialized ${result.rootDir}\n`);
  writeOut(`Created ${result.created.length} scaffold file(s).\n`);
  writeOut(`Skipped ${result.skipped.length} existing scaffold file(s).\n`);
  return 0;
}

export function runPropose(argv: string[]): number {
  const [changeName, ...extraArgs] = argv;
  if (handleHelpRequest("propose", argv)) {
    return 0;
  }
  if (!changeName || extraArgs.length > 0) {
    writeUsage(getCommandUsage("propose"));
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    writeError("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }

  const missingAssets = findMissingRequiredChangeTemplateAssets();
  if (missingAssets.length > 0) {
    writeError("missing bundled change templates required by propose:");
    for (const assetPath of missingAssets) {
      writeErr(`- ${assetPath}\n`);
    }
    return 1;
  }

  try {
    const result = initializeStrictChangeScaffold(process.cwd(), changeName);
    writeOut(`Created strict change scaffold at ${result.changeDir}/\n`);
    writeOut("Planning artifacts:\n");
    for (const artifactPath of result.planningArtifacts) {
      writeOut(`- ${artifactPath}\n`);
    }
    writeOut(`- ${result.specsDir}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}
