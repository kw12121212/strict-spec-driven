#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.join(thisDir, "..", "strict-spec-cli.js"),
  path.join(thisDir, "..", "dist", "strict-spec-cli.js"),
];

const cliPath = candidates.find((candidate) => existsSync(candidate));
if (!cliPath) {
  console.error("Error: strict CLI entrypoint not found. Run `bun run build` first.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (typeof result.status === "number") {
  process.exit(result.status);
}
process.exit(1);
