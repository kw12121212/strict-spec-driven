#!/usr/bin/env node
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "dist", "index.js");

let passed = 0;
let failed = 0;

function pass(label: string): void {
  console.log(`  PASS ${label}`);
  passed += 1;
}

function fail(label: string, details = ""): void {
  console.log(`  FAIL ${label}${details ? ` (${details})` : ""}`);
  failed += 1;
}

function section(title: string): void {
  console.log(`\n${title}`);
}

function cli(args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("node", [CLI, ...args], { encoding: "utf8" });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

section("[1] entrypoint smoke test");

const noArgs = cli([]);
if (noArgs.status !== 0) {
  pass("no-arg invocation exits non-zero");
} else {
  fail("no-arg invocation exits non-zero", `got exit code ${noArgs.status}`);
}

if (noArgs.stderr.includes("Usage:")) {
  pass("no-arg invocation prints usage hint to stderr");
} else {
  fail("no-arg invocation prints usage hint to stderr", `stderr: ${noArgs.stderr.trim()}`);
}

const unknownCmd = cli(["unknown-subcommand"]);
if (unknownCmd.status !== 0) {
  pass("unknown subcommand exits non-zero");
} else {
  fail("unknown subcommand exits non-zero", `got exit code ${unknownCmd.status}`);
}

if (unknownCmd.stderr.includes("Usage:")) {
  pass("unknown subcommand prints usage hint to stderr");
} else {
  fail("unknown subcommand prints usage hint to stderr", `stderr: ${unknownCmd.stderr.trim()}`);
}

console.log("");
const total = passed + failed;
if (failed === 0) {
  console.log(`All ${total} tests passed.`);
} else {
  console.log(`${failed}/${total} tests failed.`);
  process.exit(1);
}
