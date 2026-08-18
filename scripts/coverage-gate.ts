#!/usr/bin/env bun
// Coverage gate: runs the full build and test suite with subprocess V8
// coverage collection (NODE_V8_COVERAGE), aggregates the data with c8
// remapped through bundle source maps, computes line coverage over src/**
// (excluding generated src/embedded-templates.ts), and exits non-zero when
// the measured coverage falls below the supplied --threshold.
//
// c8's own --include filter matches the pre-remap bundle path and drops all
// remapped src/** data, so this script reads c8's unfiltered json-summary
// output and applies the src/** measurement scope itself.
//
// Modes:
//   bun scripts/coverage-gate.ts --threshold 60           # full run
//   bun scripts/coverage-gate.ts --threshold 60 --skip-build
//   bun scripts/coverage-gate.ts --threshold 60 --summary <coverage-summary.json> [--project-root <dir>]
//                                                         # check-only mode for tests
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, totalmem } from "node:os";
import path from "node:path";
import process from "node:process";

interface GateOptions {
  threshold: number;
  skipBuild: boolean;
  summaryFile: string | null;
  projectRoot: string;
}

interface LineCounts {
  total: number;
  covered: number;
}

function fail(message: string, code: number): never {
  console.error(`coverage-gate: ${message}`);
  process.exit(code);
}

function parseArgs(argv: string[]): GateOptions {
  const options: GateOptions = {
    threshold: 0,
    skipBuild: false,
    summaryFile: null,
    projectRoot: process.cwd(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--threshold") {
      index += 1;
      options.threshold = Number(argv[index]);
    } else if (argument.startsWith("--threshold=")) {
      options.threshold = Number(argument.slice("--threshold=".length));
    } else if (argument === "--skip-build") {
      options.skipBuild = true;
    } else if (argument === "--summary") {
      index += 1;
      options.summaryFile = argv[index] ?? "";
    } else if (argument.startsWith("--summary=")) {
      options.summaryFile = argument.slice("--summary=".length);
    } else if (argument === "--project-root") {
      index += 1;
      options.projectRoot = argv[index] ?? "";
    } else if (argument.startsWith("--project-root=")) {
      options.projectRoot = argument.slice("--project-root=".length);
    } else {
      fail(`unknown argument '${argument}'`, 2);
    }
  }
  if (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 100) {
    fail("--threshold must be a number between 0 and 100", 2);
  }
  if (options.summaryFile !== null && options.summaryFile.length === 0) {
    fail("--summary requires a file path", 2);
  }
  if (options.projectRoot.length === 0) {
    fail("--project-root requires a directory path", 2);
  }
  return options;
}

/**
 * Heap ceiling for the coverage report step, in megabytes.
 *
 * The report aggregates one V8 coverage file per spawned subprocess across the whole suite, which
 * on this project exceeds node's ~2 GB default and aborts with "Ineffective mark-compacts near heap
 * limit". That failure is indistinguishable at the call site from a broken gate, and it pushed each
 * caller to invent a NODE_OPTIONS override, so no two runs of a blocking gate were comparable. A
 * full run completed at 5 GB against a 34,824-line src/** projection; this is that measurement.
 */
const COVERAGE_REPORT_HEAP_CEILING_MB = 5120;

/** Never ask for more heap than the machine has; below this, node's own default is the better bet. */
const COVERAGE_REPORT_HEAP_FLOOR_MB = 2048;

/**
 * The heap actually requested, clamped to a fraction of system memory.
 *
 * Asking for a ceiling larger than the machine does not fail at startup — V8 accepts the flag and
 * grows until the kernel kills the process, which replaces one legible abort with a less legible
 * one. Clamping keeps the gate's failure mode on a small machine the same V8 abort it always was.
 */
function coverageReportHeapMb(): number {
  const affordable = Math.floor((totalmem() * 0.75) / (1024 * 1024));
  return Math.max(COVERAGE_REPORT_HEAP_FLOOR_MB, Math.min(COVERAGE_REPORT_HEAP_CEILING_MB, affordable));
}

function runStep(label: string, command: string, args: string[], env?: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { stdio: "inherit", env: env ?? process.env });
  if (result.status !== 0) {
    fail(`${label} failed with exit status ${result.status ?? "unknown"}`, 1);
  }
}

function readSummary(summaryPath: string): Record<string, unknown> {
  if (!existsSync(summaryPath)) {
    fail(`coverage summary not found at ${summaryPath}`, 2);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(summaryPath, "utf8"));
  } catch (error) {
    fail(`coverage summary at ${summaryPath} is not valid JSON: ${String(error)}`, 2);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`coverage summary at ${summaryPath} is not a JSON object`, 2);
  }
  return parsed as Record<string, unknown>;
}

function toSrcRelativePath(filePath: string, projectRoot: string): string | null {
  let relative = path.relative(projectRoot, path.resolve(filePath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  // The bundles' inline source maps resolve original sources relative to the
  // bundle location, so remapped src files appear under dist/scripts/src/**.
  const bundlePrefix = `dist${path.sep}scripts${path.sep}`;
  if (relative.startsWith(bundlePrefix)) {
    relative = relative.slice(bundlePrefix.length);
  }
  if (!relative.startsWith(`src${path.sep}`)) {
    return null;
  }
  if (relative === path.join("src", "embedded-templates.ts")) {
    return null;
  }
  return relative;
}

function collectSrcLineCounts(summary: Record<string, unknown>, projectRoot: string): LineCounts {
  const counts: LineCounts = { total: 0, covered: 0 };
  for (const [filePath, value] of Object.entries(summary)) {
    if (filePath === "total") {
      continue;
    }
    if (toSrcRelativePath(filePath, projectRoot) === null) {
      continue;
    }
    const lines = (value as { lines?: { total?: unknown; covered?: unknown } }).lines;
    if (
      lines === undefined ||
      typeof lines.total !== "number" ||
      typeof lines.covered !== "number" ||
      !Number.isFinite(lines.total) ||
      !Number.isFinite(lines.covered)
    ) {
      fail(`coverage summary entry for ${filePath} has no numeric lines.total/lines.covered`, 2);
    }
    counts.total += lines.total;
    counts.covered += lines.covered;
  }
  return counts;
}

function enforceThreshold(counts: LineCounts, threshold: number): never {
  if (counts.total === 0) {
    fail(
      "no src/** line coverage data found; check that the build emits source maps and tests ran with NODE_V8_COVERAGE",
      2,
    );
  }
  const measuredPct = Math.round((counts.covered / counts.total) * 10000) / 100;
  if (measuredPct < threshold) {
    console.error(
      `coverage-gate: FAIL - measured src/** line coverage ${measuredPct}% (${counts.covered}/${counts.total} lines) is below the required threshold ${threshold}%`,
    );
    process.exit(1);
  }
  console.log(
    `coverage-gate: PASS - measured src/** line coverage ${measuredPct}% (${counts.covered}/${counts.total} lines) meets the required threshold ${threshold}%`,
  );
  process.exit(0);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  if (options.summaryFile !== null) {
    const summary = readSummary(options.summaryFile);
    enforceThreshold(collectSrcLineCounts(summary, options.projectRoot), options.threshold);
  }

  const projectRoot = options.projectRoot;
  const c8Binary = path.join(projectRoot, "node_modules", "c8", "bin", "c8.js");
  if (!existsSync(c8Binary)) {
    fail("c8 is not installed; run 'bun install' first", 2);
  }

  if (!options.skipBuild) {
    runStep("build", "bun", ["run", "build"]);
  }

  const coverageDir = mkdtempSync(path.join(tmpdir(), "strict-coverage-v8-"));
  const reportDir = mkdtempSync(path.join(tmpdir(), "strict-coverage-report-"));
  try {
    runStep("test suite", "bun", ["test/run.ts"], {
      ...process.env,
      NODE_V8_COVERAGE: coverageDir,
    });
    runStep(
      "coverage report",
      "node",
      [
        `--max-old-space-size=${coverageReportHeapMb()}`,
        c8Binary,
        "report",
        "--temp-directory",
        coverageDir,
        "--reports-dir",
        reportDir,
        "--reporter",
        "json-summary",
      ],
    );
    const summary = readSummary(path.join(reportDir, "coverage-summary.json"));
    enforceThreshold(collectSrcLineCounts(summary, projectRoot), options.threshold);
  } finally {
    rmSync(coverageDir, { recursive: true, force: true });
    rmSync(reportDir, { recursive: true, force: true });
  }
}

main();
