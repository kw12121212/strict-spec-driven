/**
 * Host entry of dsh-plugin-strict-spec: the cordis plugin row the bundle
 * patch inserts. It owns the plugin's one host-side capability, the built-in
 * strict tooling provision: while the single `builtinTooling` switch is
 * enabled (its default), the entry registers the bundled-skill provider onto
 * the host's `ctx.skills` registry, which serves the strict skill packages
 * from the plugin's own dist assets, rewrites their CLI commands to the
 * bundled strict-spec-cli, and marks each built-in catalog entry with a
 * provenance suffix naming the plugin and its version. While the switch is
 * disabled the entry applies nothing, so the plugin is exactly the read-only
 * viewer. The entry never mutates workflow files and never writes outside
 * its own package.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";
import { buildProvenanceMarker, createBuiltinToolingProvider } from "./host/builtinTooling.ts";

/** The host-owned skill registry the built-in tooling registers onto. */
export const inject = ["skills"];

/** Built-in tooling configuration: one master switch, on by default. */
export interface Config {
  /**
   * Enable the built-in strict skill and CLI provision. Skills and CLI are
   * one provision — the served skill bodies are the bundled CLI's only
   * session entry point — so one switch governs both, and turning it off
   * leaves the viewer-only plugin and hands precedence back to any external
   * installation.
   */
  builtinTooling?: boolean;
}

/** Validated configuration schema for the plugin row's config. */
export const Config = Schema.object({
  builtinTooling: Schema.boolean()
    .default(true)
    .description("Serve the built-in strict skills and strict-spec-cli from this plugin."),
});

/**
 * Read the installed plugin's version from the package.json beside dist, so
 * the provenance marker reports the version actually serving. A missing,
 * unparsable, or version-less manifest degrades to a marker naming the
 * version unknown rather than failing the provision. Exported for the host
 * suite's degradation cases.
 */
export function readPluginVersion(distDir: string): string {
  try {
    const manifest = JSON.parse(readFileSync(path.join(distDir, "..", "package.json"), "utf8")) as { version?: string };
    return manifest.version && manifest.version.length > 0 ? manifest.version : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Register the built-in tooling behind its switch. The bundled assets are
 * resolved relative to this module — the built host.js sits inside dist/
 * beside the `skills/` and `cli/` assets the build writes — and the CLI
 * invocation closes over the running host's own node executable
 * (`process.execPath`), so neither PATH lookups nor a global install are
 * involved. Disposing the fiber unregisters the provider and invalidates
 * skill catalogs, which is what restores external copies after the switch
 * turns off.
 *
 * @param ctx - host root context carrying the skills service.
 * @param config - validated plugin row config; absence keeps the default on.
 */
export function apply(ctx: Context, config: Config = {}): void {
  if (config.builtinTooling === false) return;
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  ctx.skills.registerProvider(() =>
    createBuiltinToolingProvider({
      skillsDir: path.join(distDir, "skills"),
      cliPath: path.join(distDir, "cli", "strict-spec-cli.js"),
      execPath: process.execPath,
      provenanceMarker: buildProvenanceMarker(readPluginVersion(distDir)),
    }),
  );
}
