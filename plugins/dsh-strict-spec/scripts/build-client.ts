/**
 * Bun-based client build for dsh-plugin-strict-spec.
 *
 * Emits two artifacts into dist/:
 *   - client.js: the browser bundle wrapped in the window.__ModuleLoader__
 *     closure-factory handoff, in the lazy-CJS shape the dsh module system
 *     expects: executing the bundle only registers the factory, and module
 *     side effects run at materialization. Every module the dsh shell shares
 *     through its frozen module table stays external, so the bundle never
 *     inlines a copy of React, Cordis, or any other shared module.
 *   - host.js: the empty cordis host entry the bundle patch inserts.
 *
 * dsh publishes no client build preset, so the wrapper and the externals list
 * are reproduced here by hand and the bundle-shape test in test/suites/
 * guards both against drift.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");

/**
 * Modules the dsh shell injects at load time. Inlining any of them would
 * create a second React instance or a second Cordis context whose hooks and
 * fibers do not match the host's, breaking slot rendering only at runtime.
 */
export const SHARED_EXTERNALS: readonly string[] = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "zod",
  "@tanstack/react-virtual",
  "@deepseek-ai/dsh-client-store",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-ui-dockkit",
];

/** The module id the shell addresses this bundle by: the package name. */
export const CLIENT_MODULE_ID = "dsh-plugin-strict-spec";

/**
 * Wraps one CommonJS bundle body in the ModuleLoader closure-factory handoff.
 * The prelude mirrors the shell's own bundles: `module`/`exports` bindings the
 * body assigns into, and an ESM-compatible toStringTag on the exports object.
 */
export function wrapModuleLoaderHandoff(id: string, cjsBody: string): string {
  return (
    `window.__ModuleLoader__.load({\n`
    + `\tid: ${JSON.stringify(id)},\n`
    + `\tfactory: (require) => {\n`
    + `\t\tvar module = { exports: {} };\n`
    + `\t\tvar exports = module.exports;\n`
    + `\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n`
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
  return wrapModuleLoaderHandoff(CLIENT_MODULE_ID, await output.text());
}

/** Builds the empty cordis host entry as a Node ESM module. */
export async function buildHostEntry(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [path.join(root, "src/host.ts")],
    target: "node",
    format: "esm",
    external: [...SHARED_EXTERNALS],
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

const distDir = path.join(root, "dist");

// Run as a script (`bun run build`), not when the test suite imports the
// build helpers: importing must build in memory only, never write dist/.
if (import.meta.main) {
  mkdirSync(distDir, { recursive: true });
  writeFileSync(path.join(distDir, "client.js"), await buildClientBundle());
  writeFileSync(path.join(distDir, "host.js"), await buildHostEntry());
  console.log(`built ${path.join(distDir, "client.js")} and ${path.join(distDir, "host.js")}`);
}
