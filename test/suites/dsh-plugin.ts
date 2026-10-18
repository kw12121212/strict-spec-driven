import { readFileSync, readdirSync } from "fs";
import path from "path";
import yaml from "js-yaml";
import { ROOT, TestContext } from "../support/harness.js";
import {
  CLIENT_MODULE_ID,
  SHARED_EXTERNALS,
  STYLE_ELEMENT_ID,
  buildClientBundle,
  wrapModuleLoaderHandoff,
} from "../../plugins/dsh-strict-spec/scripts/build-client.ts";
import { en, zh } from "../../plugins/dsh-strict-spec/src/client/locales.ts";

const PLUGIN_ROOT = path.join(ROOT, "plugins", "dsh-strict-spec");

/**
 * One bundle-shape defect. Categories are stable so the negative and positive
 * probes can name the matcher they exercise.
 */
export type BundleFinding = { category: string; detail: string };

/**
 * Inlined-implementation markers, each grounded in the pinned shared package's
 * own published code rather than in anything this repository generates: react
 * (and react-dom, which inlines react) stamp `Symbol.for("react.…")` symbols,
 * cordis stamps `Symbol.for("cordis.…")` symbols, and react-dom's own
 * implementation carries the `onRecoverableError` option handler (a bare
 * "react-dom" substring would false-positive on a legitimate runtime require).
 * A bundle that inlined any of them would carry the marker; a correctly
 * externalized bundle never does.
 */
const INLINED_MARKERS: ReadonlyArray<{ moduleId: string; marker: string }> = [
  { moduleId: "react", marker: 'Symbol.for("react.' },
  { moduleId: "react-dom", marker: "onRecoverableError" },
  { moduleId: "@deepseek-ai/cordis", marker: 'Symbol.for("cordis.' },
];

/**
 * The runtime requires the client entry must issue: the production JSX
 * runtime subpath the shell's frozen module table shares, the shared store
 * module the discovery model's store exposure consumes, and the shared
 * primitives and virtualizer modules the tree and renderer components
 * consume.
 */
const REQUIRED_RUNTIME_REQUIRES: readonly string[] = [
  'require("react/jsx-runtime")',
  'require("@deepseek-ai/dsh-client-store")',
  'require("@deepseek-ai/dsh-client-ui-primitives")',
  'require("@tanstack/react-virtual")',
];

/**
 * Literal markers proving the bundled YAML parser is inlined: one stable
 * error-message literal js-yaml carries into any build, and the absence of a
 * runtime require for the parser package, which stays bundled because it is
 * not a module the host shares.
 */
const PARSER_INLINED_MARKERS: readonly string[] = ["duplicated mapping key"];
const PARSER_EXTERNAL_REQUIRE = 'require("js-yaml")';

/**
 * Inspect one built client bundle for wrapper, externals, and inlining shape.
 * Pure over its input: the suite runs it on the freshly built bundle and the
 * probes run it on mutated bundle text through this same function.
 */
export function inspectClientBundle(bundle: string): BundleFinding[] {
  const findings: BundleFinding[] = [];
  if (!bundle.startsWith("window.__ModuleLoader__.load({\n")) {
    findings.push({ category: "wrapper", detail: "bundle does not open with the window.__ModuleLoader__.load handoff" });
  }
  if (!bundle.includes(`id: ${JSON.stringify(CLIENT_MODULE_ID)},`)) {
    findings.push({ category: "wrapper", detail: `handoff id is not the package name ${CLIENT_MODULE_ID}` });
  }
  if (!bundle.includes("factory: (require) => {")) {
    findings.push({ category: "wrapper", detail: "handoff factory does not take the loader require" });
  }
  if (!bundle.includes("return module.exports;")) {
    findings.push({ category: "wrapper", detail: "factory does not return module.exports, so materialization yields undefined" });
  }
  for (const requireLiteral of REQUIRED_RUNTIME_REQUIRES) {
    if (!bundle.includes(requireLiteral)) {
      findings.push({ category: "shared-require", detail: `bundle never issues the runtime require ${requireLiteral}` });
    }
  }
  for (const { moduleId, marker } of INLINED_MARKERS) {
    if (bundle.includes(marker)) {
      findings.push({ category: "inlined-shared-module", detail: `bundle inlines shared module ${moduleId} (marker ${JSON.stringify(marker)})` });
    }
  }
  for (const marker of PARSER_INLINED_MARKERS) {
    if (!bundle.includes(marker)) {
      findings.push({ category: "parser-inline", detail: `bundle does not carry the bundled YAML parser (marker ${JSON.stringify(marker)} absent)` });
    }
  }
  if (bundle.includes(PARSER_EXTERNAL_REQUIRE)) {
    findings.push({ category: "parser-external", detail: "bundle requires the YAML parser at runtime instead of inlining it" });
  }
  return findings;
}

/** Sorted keys of a dictionary, for the zh/en parity check. */
function sortedKeys(dict: Record<string, string>): string[] {
  return Object.keys(dict).sort();
}

/** One CSS token-discipline defect found in a plugin CSS Module file. */
export type CssFinding = { category: "literal-color" | "literal-radius"; path: string; detail: string };

/** Matchers for literal colors and literal border radii in CSS Module text. */
const LITERAL_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const LITERAL_RADIUS_PATTERN = /border-radius\s*:[^;]*[0-9]/;

/**
 * Inspect CSS Module texts for literal color and radius declarations, the two
 * shapes the dsh-plugin-client css-modules-dsw-tokens rule forbids outside
 * token definitions. Pure over its input: the suite runs it over every plugin
 * CSS Module file discovered by scan, and the probes run synthetic defects
 * through this same function.
 */
export function inspectCssModules(files: ReadonlyArray<{ path: string; text: string }>): CssFinding[] {
  const findings: CssFinding[] = [];
  for (const file of files) {
    for (const line of file.text.split("\n")) {
      if (LITERAL_COLOR_PATTERN.test(line)) {
        findings.push({ category: "literal-color", path: file.path, detail: line.trim() });
      }
      if (LITERAL_RADIUS_PATTERN.test(line)) {
        findings.push({ category: "literal-radius", path: file.path, detail: line.trim() });
      }
    }
  }
  return findings;
}

export async function runDshPluginSuite(context: TestContext): Promise<void> {
  context.section("dsh plugin: bundle shape");

  const bundle = await buildClientBundle();
  const findings = inspectClientBundle(bundle);
  context.assert(findings.length === 0, "built client bundle passes the shape inspection", JSON.stringify(findings));
  context.assert(bundle.endsWith("});\n"), "bundle closes the ModuleLoader handoff");
  context.assert(bundle.includes(STYLE_ELEMENT_ID), "bundle carries the idempotent CSS style injection for module styles");

  context.section("dsh plugin: css module token discipline");

  // The scanned set derives from the filesystem, not from a hand list.
  const cssDir = path.join(PLUGIN_ROOT, "src", "client");
  const cssFiles = readdirSync(cssDir)
    .filter((name) => name.endsWith(".module.css"))
    .map((name) => ({ path: path.join(cssDir, name), text: readFileSync(path.join(cssDir, name), "utf8") }));
  context.assert(cssFiles.length > 0, "the plugin declares CSS Module files to scan");
  const cssFindings = inspectCssModules(cssFiles);
  context.assert(cssFindings.length === 0, "every plugin CSS Module file stays free of literal colors and radii", JSON.stringify(cssFindings));
  // Negative and positive proof for each matcher category through the same
  // inspect function over synthetic defects appended to the real input.
  const withColorDefect = [...cssFiles, { path: "synthetic-color.module.css", text: ".x { color: #ff0000; }" }];
  context.assert(
    inspectCssModules(withColorDefect).some((finding) => finding.category === "literal-color" && finding.path === "synthetic-color.module.css"),
    "literal-color matcher fires on a synthetic hex color",
  );
  const withRgbDefect = [...cssFiles, { path: "synthetic-rgb.module.css", text: ".x { background: rgba(0, 0, 0, 0.5); }" }];
  context.assert(
    inspectCssModules(withRgbDefect).some((finding) => finding.category === "literal-color" && finding.path === "synthetic-rgb.module.css"),
    "literal-color matcher fires on a synthetic rgb color",
  );
  const withRadiusDefect = [...cssFiles, { path: "synthetic-radius.module.css", text: ".x { border-radius: 8px; }" }];
  context.assert(
    inspectCssModules(withRadiusDefect).some((finding) => finding.category === "literal-radius" && finding.path === "synthetic-radius.module.css"),
    "literal-radius matcher fires on a synthetic pixel radius",
  );
  const tokenOnly = [{ path: "synthetic-token.module.css", text: ".x { border-radius: var(--dsw-radius-md); color: var(--dsw-alias-label-primary); }" }];
  context.assert(inspectCssModules(tokenOnly).length === 0, "token-only declarations pass the scan");

  // The externals list the build consumes and the module id it stamps must stay
  // the reviewed ones: every shared dsh module external, package name as id.
  const expectedExternals = [
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
  context.assert(
    JSON.stringify(SHARED_EXTERNALS) === JSON.stringify(expectedExternals),
    "shared externals list keeps every dsh shared module external",
    `actual: ${JSON.stringify(SHARED_EXTERNALS)}`,
  );
  context.assert(CLIENT_MODULE_ID === "dsh-plugin-strict-spec", "module id is the package name");

  // Negative and positive proof for every matcher category, driven through the
  // same inspect function over the real bundle with synthetic defects added.
  const wrapperStripped = bundle.replace("window.__ModuleLoader__.load({\n", "module.exports = ({\n");
  context.assert(
    inspectClientBundle(wrapperStripped).some((finding) => finding.category === "wrapper"),
    "wrapper matcher fires when the handoff opening is removed",
  );
  const idStripped = bundle.replace(`id: ${JSON.stringify(CLIENT_MODULE_ID)},`, 'id: "something-else",');
  context.assert(
    inspectClientBundle(idStripped).some((finding) => finding.category === "wrapper" && finding.detail.includes("package name")),
    "wrapper id matcher fires on a foreign module id",
  );
  const returnStripped = bundle.split("return module.exports;").join("");
  context.assert(
    inspectClientBundle(returnStripped).some((finding) => finding.category === "wrapper" && finding.detail.includes("module.exports")),
    "wrapper return matcher fires when the factory stops returning module.exports",
  );
  const requireStripped = bundle.split('require("react/jsx-runtime")').join('require("./inlined-react.tsx")');
  context.assert(
    inspectClientBundle(requireStripped).some((finding) => finding.category === "shared-require"),
    "shared-require matcher fires when the runtime require is retargeted",
  );
  for (const { moduleId, marker } of INLINED_MARKERS) {
    const withInlinedModule = `${bundle}\n// synthetic inlined copy for the probe\nvar R={};R.x=1;/* ${marker} */\n`;
    context.assert(
      inspectClientBundle(withInlinedModule).some((finding) => finding.category === "inlined-shared-module" && finding.detail.includes(moduleId)),
      `inlined-shared-module matcher fires for ${moduleId}`,
    );
  }
  const parserStripped = bundle.split("duplicated mapping key").join("an unrelated literal for the probe");
  context.assert(
    inspectClientBundle(parserStripped).some((finding) => finding.category === "parser-inline"),
    "parser-inline matcher fires when the bundled parser marker is absent",
  );
  const parserExternal = `${bundle}\nrequire("js-yaml");\n`;
  context.assert(
    inspectClientBundle(parserExternal).some((finding) => finding.category === "parser-external"),
    "parser-external matcher fires when the parser is required instead of inlined",
  );

  // The wrapper helper itself must stay the lazy-CJS shape the shell expects.
  const wrapped = wrapModuleLoaderHandoff("probe-id", "module.exports = 1;");
  context.assert(
    wrapped.startsWith("window.__ModuleLoader__.load({")
      && wrapped.includes("factory: (require) => {")
      && wrapped.includes("Object.defineProperty(exports, Symbol.toStringTag")
      && wrapped.includes("return module.exports;"),
    "wrapper helper keeps the closure-factory prelude and return",
  );

  context.section("dsh plugin: manifest, engines pin, and cordis patch");

  const manifest = JSON.parse(readFileSync(path.join(PLUGIN_ROOT, "package.json"), "utf8")) as {
    name?: string;
    private?: boolean;
    engines?: { dsh?: string };
    dsh?: { bundle?: { patch?: string }; client?: { platform?: string; inject?: string[] } };
    devDependencies?: Record<string, string>;
  };
  context.assert(manifest.name === "dsh-plugin-strict-spec", "package name is dsh-plugin-strict-spec");
  context.assert(manifest.private === true, "package is private");
  context.assert(
    manifest.engines?.dsh === ">=0.2.1-rc.2 <0.2.2",
    "engines.dsh is pinned to the 0.2.1 patch line from the pinned next-tag release",
    `actual: ${manifest.engines?.dsh ?? "absent"}`,
  );
  context.assert(manifest.dsh?.bundle?.patch === "./cordis.patch.yml", "dsh.bundle points at the cordis patch file");
  context.assert(manifest.dsh?.client?.platform === "web", "dsh.client platform is web");
  const inject = manifest.dsh?.client?.inject ?? [];
  context.assert(
    inject.includes("@deepseek-ai/dsh-client-store"),
    "the client inject list declares the shared store module the discovery model consumes",
    `inject: ${JSON.stringify(inject)}`,
  );
  for (const injected of inject) {
    context.assert(
      manifest.devDependencies?.[injected] !== undefined,
      `every injected shared module is a declared dev dependency (${injected})`,
    );
  }

  const patch = yaml.load(readFileSync(path.join(PLUGIN_ROOT, "cordis.patch.yml"), "utf8")) as Array<{
    insert?: Array<{ id?: string; name?: string }>;
  }>;
  const row = patch?.[0]?.insert?.[0];
  context.assert(row?.id === "ui-strict-spec" && row?.name === "dsh-plugin-strict-spec", "cordis patch inserts the package under id ui-strict-spec");

  context.section("dsh plugin: locale catalogs");

  const zhKeys = sortedKeys(zh);
  const enKeys = sortedKeys(en);
  context.assert(zhKeys.length > 0, "zh catalog declares keys");
  context.assert(
    JSON.stringify(zhKeys) === JSON.stringify(enKeys),
    "en catalog declares exactly the zh key set",
    `zh: ${JSON.stringify(zhKeys)} en: ${JSON.stringify(enKeys)}`,
  );
  context.assert(
    Object.values(zh).every((value) => value.length > 0) && Object.values(en).every((value) => value.length > 0),
    "every locale entry is a non-empty string",
  );
}
