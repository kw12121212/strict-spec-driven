import { generateChangeArtifact, isGeneratableArtifact } from "../propose-generation.js";
import { CHANGE_NAME_PATTERN } from "./argv.js";
import { writeError, writeJson, writeUsage } from "./output.js";

export function runGenerate(argv: string[]): number {
  const [changeName, artifact, inputFile, ...extraArgs] = argv;
  if (!changeName || !artifact || !inputFile || extraArgs.length > 0) {
    writeUsage("Usage: strict-spec-driven generate <change-name> <proposal|design|tasks|questions|delta-spec> <input-json>\n");
    return 1;
  }
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    writeError("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
    return 1;
  }
  if (!isGeneratableArtifact(artifact)) {
    writeError("artifact must be one of: proposal, design, tasks, questions, delta-spec");
    return 1;
  }

  try {
    writeJson(generateChangeArtifact(process.cwd(), changeName, artifact, inputFile));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(message);
    return 1;
  }
}
