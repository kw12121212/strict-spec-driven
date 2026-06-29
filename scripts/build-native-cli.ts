#!/usr/bin/env bun
import { spawnSync } from "child_process";
import { chmodSync, copyFileSync, mkdirSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

type Platform = NodeJS.Platform;
type Arch = NodeJS.Architecture;

type NativePlan = {
  target: string;
  executableName: string;
  entrypoint: string;
  outputPath: string;
  binDir: string | null;
  installPath: string | null;
  buildArgs: string[];
  binDirOnPath: boolean | null;
};

type NativeArgs = {
  dryRun: boolean;
  install: boolean;
  target?: string;
  platform?: Platform;
  arch?: Arch;
  binDir?: string;
  outputRoot?: string;
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(SCRIPT_DIR);
const DEFAULT_OUTPUT_ROOT = path.join(ROOT, "dist", "native");
const CLI_ENTRYPOINT = path.join(ROOT, "src", "strict-spec-cli.ts");

function normalizePathList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(path.delimiter).filter((entry) => entry.length > 0).map((entry) => path.resolve(entry));
}

function pathContainsDirectory(pathValue: string | undefined, directory: string): boolean {
  const resolved = path.resolve(directory);
  return normalizePathList(pathValue).some((entry) => {
    if (process.platform === "win32") {
      return entry.toLowerCase() === resolved.toLowerCase();
    }
    return entry === resolved;
  });
}

export function resolveNativeTarget(platform: Platform = process.platform, arch: Arch = process.arch): string {
  if (platform === "darwin" && arch === "x64") return "bun-darwin-x64";
  if (platform === "darwin" && arch === "arm64") return "bun-darwin-arm64";
  if (platform === "linux" && arch === "x64") return "bun-linux-x64";
  if (platform === "linux" && arch === "arm64") return "bun-linux-arm64";
  if (platform === "win32" && arch === "x64") return "bun-windows-x64";
  if (platform === "win32" && arch === "arm64") return "bun-windows-arm64";
  throw new Error(`unsupported native CLI target for platform '${platform}' and arch '${arch}'`);
}

export function executableNameForTarget(target: string): string {
  return target.startsWith("bun-windows-") ? "strict-spec-cli.exe" : "strict-spec-cli";
}

export function defaultUserBinDir(platform: Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA;
    if (localAppData && localAppData.trim().length > 0) {
      return path.join(localAppData, "strict-spec-driven", "bin");
    }
    const userProfile = env.USERPROFILE;
    if (userProfile && userProfile.trim().length > 0) {
      return path.join(userProfile, ".strict-spec-driven", "bin");
    }
    return path.join(os.homedir(), ".strict-spec-driven", "bin");
  }

  const xdgBinHome = env.XDG_BIN_HOME;
  if (xdgBinHome && xdgBinHome.trim().length > 0) return xdgBinHome;
  const home = env.HOME && env.HOME.trim().length > 0 ? env.HOME : os.homedir();
  return path.join(home, ".local", "bin");
}

export function createNativePlan(options: {
  platform?: Platform;
  arch?: Arch;
  target?: string;
  outputRoot?: string;
  binDir?: string | null;
  env?: NodeJS.ProcessEnv;
} = {}): NativePlan {
  const target = options.target ?? resolveNativeTarget(options.platform, options.arch);
  const executableName = executableNameForTarget(target);
  const outputRoot = options.outputRoot ?? DEFAULT_OUTPUT_ROOT;
  const outputPath = path.join(outputRoot, target, executableName);
  const binDir = options.binDir === undefined ? null : options.binDir;
  const installPath = binDir ? path.join(binDir, executableName) : null;
  return {
    target,
    executableName,
    entrypoint: CLI_ENTRYPOINT,
    outputPath,
    binDir,
    installPath,
    buildArgs: [
      "build",
      "--compile",
      `--target=${target}`,
      CLI_ENTRYPOINT,
      "--outfile",
      outputPath,
    ],
    binDirOnPath: binDir ? pathContainsDirectory(options.env?.PATH ?? process.env.PATH, binDir) : null,
  };
}

function parseArgs(argv: string[]): NativeArgs {
  const result: NativeArgs = {
    dryRun: false,
    install: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg === "--install") {
      result.install = true;
      continue;
    }
    if (arg === "--target" || arg === "--platform" || arg === "--arch" || arg === "--bin-dir" || arg === "--output-root") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      index += 1;
      if (arg === "--target") result.target = value;
      if (arg === "--platform") result.platform = value as Platform;
      if (arg === "--arch") result.arch = value as Arch;
      if (arg === "--bin-dir") result.binDir = value;
      if (arg === "--output-root") result.outputRoot = value;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun scripts/build-native-cli.ts [--install] [--dry-run] [--target <bun-target>] [--bin-dir <path>] [--output-root <path>]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

function run(): number {
  const args = parseArgs(process.argv.slice(2));
  const binDir = args.install ? (args.binDir ?? defaultUserBinDir()) : args.binDir ?? null;
  const plan = createNativePlan({
    target: args.target,
    platform: args.platform,
    arch: args.arch,
    outputRoot: args.outputRoot,
    binDir,
  });

  if (args.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return 0;
  }

  mkdirSync(path.dirname(plan.outputPath), { recursive: true });
  const build = spawnSync("bun", plan.buildArgs, { stdio: "inherit", cwd: ROOT });
  if (build.status !== 0) {
    return typeof build.status === "number" ? build.status : 1;
  }

  if (plan.installPath) {
    mkdirSync(path.dirname(plan.installPath), { recursive: true });
    copyFileSync(plan.outputPath, plan.installPath);
    if (!plan.executableName.endsWith(".exe")) {
      chmodSync(plan.installPath, 0o755);
    }
    if (plan.binDirOnPath) {
      console.log(`Installed ${plan.executableName} to ${plan.installPath}`);
    } else {
      console.log(`Installed ${plan.executableName} to ${plan.installPath}`);
      console.warn(`Warning: ${path.dirname(plan.installPath)} is not on PATH; add it before invoking strict-spec-cli by name.`);
    }
  } else {
    console.log(`Built ${plan.executableName} at ${plan.outputPath}`);
  }

  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    process.exit(run());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
