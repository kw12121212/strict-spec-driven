import {
  findMissingRequiredChangeTemplateAssets,
  findMissingRequiredScaffoldAssets,
  initializeStrictChangeScaffold,
  initializeStrictScaffold,
} from "../scaffold.js";
import { CHANGE_NAME_PATTERN } from "./argv.js";

export function runInit(): number {
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

export function runPropose(argv: string[]): number {
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
