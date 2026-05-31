import { formatRoadmapOverview, getRoadmapStatus, recommendRoadmapChange, syncRoadmap } from "../roadmap.js";
import { isHelpRequest } from "./argv.js";
import { writeHelp, writeJson, writeOut, writeUsage } from "./output.js";

export function runRoadmapStatus(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven roadmap-status\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-driven roadmap-status\n");
    return 1;
  }

  const result = getRoadmapStatus(process.cwd());
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapOverview(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven roadmap-overview\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-driven roadmap-overview\n");
    return 1;
  }

  const result = getRoadmapStatus(process.cwd());
  writeOut(formatRoadmapOverview(result));
  return result.valid ? 0 : 1;
}

export function runRoadmapSync(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven roadmap-sync [--materialize-planned-changes]\n");
    return 0;
  }
  const materializePlannedChanges = argv.length === 1 && argv[0] === "--materialize-planned-changes";
  if (argv.length > 0 && !materializePlannedChanges) {
    writeUsage("Usage: strict-spec-driven roadmap-sync [--materialize-planned-changes]\n");
    return 1;
  }

  const result = syncRoadmap(process.cwd(), { materializePlannedChanges });
  writeJson(result);
  return result.valid ? 0 : 1;
}

export function runRoadmapRecommend(argv: string[]): number {
  if (isHelpRequest(argv)) {
    writeHelp("Usage: strict-spec-driven roadmap-recommend\n");
    return 0;
  }
  if (argv.length > 0) {
    writeUsage("Usage: strict-spec-driven roadmap-recommend\n");
    return 1;
  }

  const result = recommendRoadmapChange(process.cwd());
  writeJson(result);
  return result.status === "recommended" ? 0 : 1;
}
