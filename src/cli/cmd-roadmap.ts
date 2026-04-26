import { getRoadmapStatus, syncRoadmap } from "../roadmap.js";

export function runRoadmapStatus(argv: string[]): number {
  if (argv.length > 0) {
    process.stderr.write("Usage: strict-spec-driven roadmap-status\n");
    return 1;
  }

  const result = getRoadmapStatus(process.cwd());
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.valid ? 0 : 1;
}

export function runRoadmapSync(argv: string[]): number {
  if (argv.length > 0) {
    process.stderr.write("Usage: strict-spec-driven roadmap-sync\n");
    return 1;
  }

  const result = syncRoadmap(process.cwd());
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.valid ? 0 : 1;
}
