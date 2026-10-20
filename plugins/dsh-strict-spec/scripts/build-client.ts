/**
 * Bun-based client build for dsh-plugin-strict-spec.
 *
 * Emits four artifact kinds into dist/:
 *   - client.js: the browser bundle wrapped in the window.__ModuleLoader__
 *     closure-factory handoff, in the lazy-CJS shape the dsh module system
 *     expects: executing the bundle only registers the factory, and module
 *     side effects run at materialization. Every module the dsh shell shares
 *     through its frozen module table stays external, so the bundle never
 *     inlines a copy of React, Cordis, or any other shared module.
 *   - host.js: the cordis host entry the bundle patch inserts, which stays
 *     external against every dsh module it reads at runtime.
 *   - skills/<name>/SKILL.md: the repository skill packages' bodies, copied
 *     byte-identically so the plugin serves exactly the authored text and
 *     the repository packages stay the single authored source.
 *   - cli/strict-spec-cli.js: the strict-spec-cli bundled from the
 *     repository source with the same node ESM bundling the repository build
 *     uses, so the plugin carries its own CLI with no global install.
 *
 * dsh publishes no client build preset, so the wrapper and the externals list
 * are reproduced here by hand and the bundle-shape test in test/suites/
 * guards both against drift. CSS Module styles the components import ride
 * the wrapper as an injected <style> element, keeping the bundle one file.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");

/**
 * Modules the dsh shell injects at load time. Inlining any of them would
 * create a second React instance or a second Cordis context whose hooks and
 * fibers do not match the host's, breaking slot rendering only at runtime.
 *
 * `@tanstack/react-virtual` is deliberately absent: the pinned host shares
 * no module-table row for it (verified against `__DSH_BOOT__` of a real
 * 0.2.1-rc.2 web boot), so the virtualizer inlines into the bundle like
 * the YAML parser instead of staying external.
 */
export const SHARED_EXTERNALS: readonly string[] = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "zod",
  "@deepseek-ai/dsh-client-store",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-ui-dockkit",
];

/**
 * Modules the host entry must not inline. `@deepseek-ai/schemastery` is read
 * at runtime for the Config schema and resolves from the plugin's declared
 * dependency, the same convention the pinned line's own host plugins follow.
 * `@deepseek-ai/dsh-skill` is type-only in the host entry — its imports are
 * erased — and stays external so an accidental runtime import can never
 * silently inline a second registry identity into the bundle.
 */
export const HOST_EXTERNALS: readonly string[] = [
  ...SHARED_EXTERNALS,
  "@deepseek-ai/schemastery",
  "@deepseek-ai/dsh-skill",
];

/** The module id the shell addresses this bundle by: the package name. */
export const CLIENT_MODULE_ID = "dsh-plugin-strict-spec";

/** The id of the bundle's injected style element, unique to this plugin. */
export const STYLE_ELEMENT_ID = "dsh-plugin-strict-spec-styles";

/**
 * Wraps one CommonJS bundle body in the ModuleLoader closure-factory handoff.
 * The prelude mirrors the shell's own bundles: `module`/`exports` bindings the
 * body assigns into, and an ESM-compatible toStringTag on the exports object.
 * When the build emitted CSS Module styles, they ride the factory as one
 * idempotent <style> injection, because the host serves this bundle as a
 * single file and loads no plugin stylesheet of its own.
 */
export function wrapModuleLoaderHandoff(id: string, cjsBody: string, cssText = ""): string {
  const styleInjection = cssText.length === 0
    ? ""
    : `if (typeof document !== "undefined" && !document.getElementById(${JSON.stringify(STYLE_ELEMENT_ID)})) {\n`
      + `\t\tvar style = document.createElement("style");\n`
      + `\t\tstyle.id = ${JSON.stringify(STYLE_ELEMENT_ID)};\n`
      + `\t\tstyle.textContent = ${JSON.stringify(cssText)};\n`
      + `\t\tdocument.head.appendChild(style);\n`
      + `\t}\n`;
  return (
    `window.__ModuleLoader__.load({\n`
    + `\tid: ${JSON.stringify(id)},\n`
    + `\tfactory: (require) => {\n`
    + `\t\tvar module = { exports: {} };\n`
    + `\t\tvar exports = module.exports;\n`
    + `\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n`
    + styleInjection
    + `${cjsBody}\n`
    + `\t\treturn module.exports;\n`
    + `\t},\n`
    + `});\n`
  );
}

/** Builds the browser client bundle and returns its wrapped text. */
export async function buildClientBundle(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [path.join(root, "src/client.ts")],
    target: "browser",
    format: "cjs",
    external: [...SHARED_EXTERNALS],
    // Production mode keeps the JSX transform on react/jsx-runtime — the exact
    // subpath the shell's frozen module table shares — instead of the dev one.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    minify: true,
  });
  if (!result.success) {
    const messages = result.logs.map((log) => String(log)).join("\n");
    throw new Error(`client bundle build failed:\n${messages}`);
  }
  const output = result.outputs.find((candidate) => candidate.kind === "entry-point");
  if (!output) {
    throw new Error("client bundle build produced no entry-point output");
  }
  // CSS Module imports emit their compiled styles as asset outputs; the
  // served bundle is one file, so the styles ride the factory wrapper.
  const cssChunks: string[] = [];
  for (const candidate of result.outputs) {
    if (candidate.kind === "asset" && candidate.path.endsWith(".css")) {
      cssChunks.push(await candidate.text());
    }
  }
  return wrapModuleLoaderHandoff(CLIENT_MODULE_ID, await output.text(), cssChunks.join("\n"));
}

/** Builds the cordis host entry as a Node ESM module. */
export async function buildHostEntry(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [path.join(root, "src/host.ts")],
    target: "node",
    format: "esm",
    external: [...HOST_EXTERNALS],
  });
  if (!result.success) {
    const messages = result.logs.map((log) => String(log)).join("\n");
    throw new Error(`host entry build failed:\n${messages}`);
  }
  const output = result.outputs.find((candidate) => candidate.kind === "entry-point");
  if (!output) {
    throw new Error("host entry build produced no entry-point output");
  }
  return `${await output.text()}\n`;
}

/** The repository root the skill sources and the CLI entry live in. */
export const REPO_ROOT = path.resolve(root, "..", "..");

/** The dist-relative path one bundled skill body is served from. */
export function bundledSkillAssetPath(skillName: string): string {
  return path.join("skills", skillName, "SKILL.md");
}

/**
 * List the repository skill packages by name, derived from the skills/
 * directory itself so a package added there ships without touching this
 * script. Non-directories such as marketplace.json are skipped.
 */
export function listBundledSkillNames(repoRoot: string = REPO_ROOT): string[] {
  return readdirSync(path.join(repoRoot, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Read every repository skill body byte-identically for shipping. */
export function readBundledSkillBodies(repoRoot: string = REPO_ROOT): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const name of listBundledSkillNames(repoRoot)) {
    bodies.set(name, readFileSync(path.join(repoRoot, "skills", name, "SKILL.md"), "utf8"));
  }
  return bodies;
}

/** The dist-relative path the bundled CLI asset is written to. */
export const CLI_ASSET_PATH = path.join("cli", "strict-spec-cli.js");

/**
 * Serializes CLI asset builds: the build temporarily changes the process
 * working directory, so a second build started while one is in flight would
 * resolve its paths against the wrong root. Every call chains onto the
 * previous build's promise, keeping the global-state window exclusive.
 */
let cliBuildChain: Promise<unknown> = Promise.resolve();

/**
 * Bundle the strict-spec-cli from the repository source with the same node
 * ESM bundling the repository build uses for its own dist CLI bundle, so the
 * plugin carries exactly the CLI the repository ships. The bundler writes
 * module paths into the bundle relative to the process working directory,
 * so the build temporarily changes into the repository root — the directory
 * the repository build itself runs from — keeping the emitted bundle
 * byte-identical to dist/scripts/strict-spec-driven.js regardless of where
 * this script runs from.
 */
export function buildCliAsset(): Promise<string> {
  const build = cliBuildChain.then(async () => {
    const previousCwd = process.cwd();
    process.chdir(REPO_ROOT);
    try {
      const result = await Bun.build({
        entrypoints: [path.join(REPO_ROOT, "src", "strict-spec-cli.ts")],
        target: "node",
        format: "esm",
      });
      if (!result.success) {
        const messages = result.logs.map((log) => String(log)).join("\n");
        throw new Error(`strict-spec-cli asset build failed:\n${messages}`);
      }
      const output = result.outputs.find((candidate) => candidate.kind === "entry-point");
      if (!output) {
        throw new Error("strict-spec-cli asset build produced no entry-point output");
      }
      // Returned exactly as the bundler emits it, so the shipped CLI asset
      // stays byte-identical to the repository build's own CLI bundle and the
      // suite can compare the two.
      return output.text();
    } finally {
      process.chdir(previousCwd);
    }
  });
  cliBuildChain = build.catch(() => undefined);
  return build;
}

const distDir = path.join(root, "dist");

/** One file the build writes into dist/, by dist-relative path. */
export interface BuildOutput {
  /** Dist-relative file path, using forward slashes. */
  readonly path: string;
  /** Exact file text to write. */
  readonly text: string;
}

/**
 * Plan every file the build writes into dist/: the client bundle, the host
 * entry, every repository skill body byte-identically, and the bundled CLI.
 * The script's write loop only materializes this plan, so the suite can
 * prove the shipped asset set — including the built-in tooling — in memory
 * without ever writing dist/.
 */
export async function planBuildOutputs(): Promise<BuildOutput[]> {
  const outputs: BuildOutput[] = [
    { path: "client.js", text: await buildClientBundle() },
    { path: "host.js", text: await buildHostEntry() },
  ];
  for (const [name, body] of readBundledSkillBodies()) {
    outputs.push({ path: bundledSkillAssetPath(name), text: body });
  }
  outputs.push({ path: CLI_ASSET_PATH, text: await buildCliAsset() });
  return outputs;
}

// Run as a script (`bun run build`), not when the test suite imports the
// build helpers: importing must build in memory only, never write dist/.
if (import.meta.main) {
  const outputs = await planBuildOutputs();
  mkdirSync(distDir, { recursive: true });
  for (const output of outputs) {
    const target = path.join(distDir, output.path);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, output.text);
  }
  const skillCount = outputs.filter((output) => output.path.endsWith("SKILL.md")).length;
  console.log(`built ${outputs.length} files (${skillCount} bundled skill bodies) into ${distDir}`);
}
