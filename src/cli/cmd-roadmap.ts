import { getRoadmapStatus, syncRoadmap } from "../roadmap.js";
import { writeJson, writeUsage } from "./output.js";

export function runRoadmapStatus(argv: string[]): number {
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-driven roadmap-status\n");
    return 1;
  }

  const result = getRoadmapStatus(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapSync(argv: string[]): number {
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-driven roadmap-sync\n");
    return 1;
  }

  const result = syncRoadmap(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}
