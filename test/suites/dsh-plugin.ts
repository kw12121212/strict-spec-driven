import { existsSync, readFileSync, readdirSync } from "fs";
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
import * as localeCatalogs from "../../plugins/dsh-strict-spec/src/client/locales.ts";

const PLUGIN_ROOT = path.join(ROOT, "plugins", "dsh-strict-spec");

/** One release-packaging or README defect, by stable category. */
export type ReleaseFinding = { category: string; detail: string };

/** The languages of every locale catalog the plugin ships, scanned from its locale module. */
export function shippedLocaleLanguages(): string[] {
  return Object.entries(localeCatalogs)
    .filter(([, value]) => typeof value === "object" && value !== null && "panel.title" in value)
    .map(([language]) => language)
    .sort();
}

/** The plugin README file a locale language documents in: English is the default README. */
export function readmeFileFor(language: string): string {
  return language === "en" ? "README.md" : `README.${language}.md`;
}

/**
 * Checks a files allowlist against the entries a packed tarball requires:
 * source, build-script, test-support, and dependency paths must never ship,
 * every required entry must be listed, and nothing else may be.
 */
export function packlistFindings(files: readonly string[], required: readonly string[]): ReleaseFinding[] {
  const findings: ReleaseFinding[] = [];
  for (const entry of files) {
    if (/^(src|scripts|test-support|node_modules)(\/|$)|^(tsconfig\.json|bun\.lock)$/.test(entry)) {
      findings.push({ category: "unshipped-source", detail: entry });
    } else if (!required.includes(entry)) {
      findings.push({ category: "unexpected", detail: entry });
    }
  }
  for (const entry of required) {
    if (!files.includes(entry)) {
      findings.push({ category: "missing", detail: entry });
    }
  }
  return findings;
}

/**
 * Checks one plugin README for the release content operators rely on: the
 * supported engines range, the link: and packed-tarball web installs, the
 * desktop profile install, the dsh host upgrade SOP with its version check,
 * the built-in tooling switch and its `builtinTooling` config key, and a
 * link to every other language's README.
 */
export function readmeFindings(text: string, enginesRange: string, counterparts: readonly string[]): ReleaseFinding[] {
  if (text.trim().length === 0) {
    return [{ category: "absent", detail: "README is missing or empty" }];
  }
  const findings: ReleaseFinding[] = [];
  if (enginesRange.length === 0 || !text.includes(enginesRange)) {
    findings.push({ category: "engines-range", detail: enginesRange });
  }
  if (!text.includes("dsh plugin --profile web add \"link:")) {
    findings.push({ category: "link-install", detail: "no link: web install command" });
  }
  if (!text.includes("npm pack")) {
    findings.push({ category: "tarball-install", detail: "no npm pack tarball install" });
  }
  if (!text.includes("dsh plugin --profile desktop add")) {
    findings.push({ category: "desktop-install", detail: "no desktop profile install command" });
  }
  if (!text.includes("dsh --version")) {
    findings.push({ category: "upgrade-sop", detail: "no dsh host upgrade SOP version check" });
  }
  if (!text.includes("builtinTooling")) {
    findings.push({ category: "builtin-tooling", detail: "no builtinTooling switch documented" });
  }
  for (const other of counterparts) {
    if (!text.includes(`](${other})`)) {
      findings.push({ category: "counterpart-link", detail: other });
    }
  }
  return findings;
}

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
 * runtime subpath the shell's frozen module table shares, react itself and
 * react-dom (both pulled by the inlined virtualizer and both resolvable
 * seed modules, proven by a real host load), the shared store module the
 * discovery model's store exposure consumes, and the shared primitives
 * module the tree and renderer components consume.
 */
const REQUIRED_RUNTIME_REQUIRES: readonly string[] = [
  'require("react")',
  'require("react/jsx-runtime")',
  'require("react-dom")',
  'require("@deepseek-ai/dsh-client-store")',
  'require("@deepseek-ai/dsh-client-ui-primitives")',
];

/**
 * Packages the entry consumes only through type-only imports for the
 * session, workspace, workspace-files, shortcuts, and sidebar-right faces,
 * plus the virtualizer the bundle inlines: their merges and code never
 * reach the host's frozen module table, so a runtime require for any of
 * them means a value import crept in and would ask the loader for a module
 * it does not share — the exact drift a real 0.2.1-rc.2 host load exposed
 * for the virtualizer.
 */
const TYPE_ONLY_PACKAGE_REQUIRES: readonly string[] = [
  'require("@deepseek-ai/dsh-api-session-controller")',
  'require("@deepseek-ai/dsh-api-workspace-controller")',
  'require("@deepseek-ai/dsh-api-workspace-files")',
  'require("@deepseek-ai/dsh-client-shortcuts")',
  'require("@deepseek-ai/dsh-client-ui-sidebar-right")',
  'require("@tanstack/react-virtual")',
];

/**
 * Every runtime require the bundle may issue: the seed-table modules the
 * host shares. The manifest's dsh.client.inject list declares these plus
 * the api controllers whose fibers provide the declared services, so a
 * require for any other bare specifier is a module the loader cannot
 * resolve.
 */
const REQUIRE_LITERAL_PATTERN = /require\("([^".][^"]*)"\)/g;

/**
 * Literal markers proving the virtualizer is inlined like the YAML parser:
 * the pinned host's boot wire declares no module-table row for
 * @tanstack/react-virtual, so the tree's viewport code must ride the
 * bundle instead of a runtime require.
 */
const VIRTUALIZER_INLINED_MARKERS: readonly string[] = ["getVirtualItems", "scrollToIndex"];

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
  for (const requireLiteral of TYPE_ONLY_PACKAGE_REQUIRES) {
    if (bundle.includes(requireLiteral)) {
      findings.push({ category: "type-only-require", detail: `bundle requires the type-only dependency at runtime: ${requireLiteral}` });
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
  for (const marker of VIRTUALIZER_INLINED_MARKERS) {
    if (!bundle.includes(marker)) {
      findings.push({ category: "virtualizer-inline", detail: `bundle does not carry the inlined virtualizer (marker ${JSON.stringify(marker)} absent)` });
    }
  }
  // Every runtime require left in the bundle must name a module the pinned
  // host shares (the externals list); a require for anything else — inside
  // or outside the manifest — can never resolve at load time.
  const sharedSet = new Set(SHARED_EXTERNALS);
  for (const match of bundle.matchAll(REQUIRE_LITERAL_PATTERN)) {
    if (!sharedSet.has(match[1])) {
      findings.push({ category: "unshared-require", detail: `bundle requires a module outside the shared externals list: require("${match[1]}")` });
    }
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
  // the reviewed ones: every dsh shared module external, package name as id,
  // and no entry for the virtualizer, which the pinned host does not share.
  const expectedExternals = [
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
  for (const requireLiteral of TYPE_ONLY_PACKAGE_REQUIRES) {
    const withTypeOnlyRequire = `${bundle}\n${requireLiteral};\n`;
    context.assert(
      inspectClientBundle(withTypeOnlyRequire).some((finding) => finding.category === "type-only-require" && finding.detail.includes(requireLiteral)),
      `type-only-require matcher fires when ${requireLiteral.slice(9, -1)} is required at runtime`,
    );
  }
  const withUnsharedRequire = `${bundle}\nrequire("some-unshared-package");\n`;
  context.assert(
    inspectClientBundle(withUnsharedRequire).some((finding) => finding.category === "unshared-require" && finding.detail.includes("some-unshared-package")),
    "unshared-require matcher fires when the bundle requires a module outside the shared externals list",
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
  const virtualizerStripped = bundle.split("getVirtualItems").join("anUnrelatedLiteralForTheProbe");
  context.assert(
    inspectClientBundle(virtualizerStripped).some((finding) => finding.category === "virtualizer-inline"),
    "virtualizer-inline matcher fires when the inlined viewport code marker is absent",
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
    dependencies?: Record<string, string>;
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
  context.assert(
    inject.includes("@deepseek-ai/dsh-client-ui-primitives"),
    "the client inject list declares the shared primitives module the tree rows consume",
    `inject: ${JSON.stringify(inject)}`,
  );
  for (const controller of [
    "@deepseek-ai/dsh-api-session-controller",
    "@deepseek-ai/dsh-api-workspace-controller",
    "@deepseek-ai/dsh-api-workspace-files",
  ]) {
    context.assert(
      inject.includes(controller),
      `the client inject list declares ${controller} so its services and remote namespace load before the entry activates`,
      `inject: ${JSON.stringify(inject)}`,
    );
  }
  context.assert(
    inject.includes("@deepseek-ai/dsh-client-ui-sidebar-right"),
    "the client inject list declares the sidebar-right module whose fibers provide the declared sidebarRightTabs service",
    `inject: ${JSON.stringify(inject)}`,
  );
  for (const injected of inject) {
    context.assert(
      manifest.devDependencies?.[injected] !== undefined,
      `every injected shared module is a declared dev dependency (${injected})`,
    );
  }
  context.assert(
    manifest.dependencies?.["@deepseek-ai/schemastery"] !== undefined,
    "the manifest declares @deepseek-ai/schemastery as the host entry's runtime dependency for the Config schema",
    `dependencies: ${JSON.stringify(Object.keys(manifest.dependencies ?? {}))}`,
  );
  context.assert(
    manifest.devDependencies?.["@deepseek-ai/dsh-skill"] !== undefined
      && manifest.dependencies?.["@deepseek-ai/dsh-skill"] === undefined,
    "the manifest keeps @deepseek-ai/dsh-skill a type-only devDependency outside runtime dependencies",
  );

  const patch = yaml.load(readFileSync(path.join(PLUGIN_ROOT, "cordis.patch.yml"), "utf8")) as Array<{
    insert?: Array<{ id?: string; name?: string }>;
  }>;
  const row = patch?.[0]?.insert?.[0];
  context.assert(row?.id === "ui-strict-spec" && row?.name === "dsh-plugin-strict-spec", "cordis patch inserts the package under id ui-strict-spec");

  // The plugin's dist/ is gitignored and npm's default packlist would ship the
  // sources, so the files allowlist alone decides what a packed tarball holds.
  // The required entries derive from sources independent of the allowlist:
  // the manifest's export targets, its declared bundle patch, and one README
  // per shipped locale catalog.
  const packed = (manifest as { files?: string[] }).files ?? [];
  const exportTargets = Object.values((manifest as { exports?: Record<string, string> }).exports ?? {});
  const languages = shippedLocaleLanguages();
  const requiredPacked = [
    ...new Set(exportTargets.map((target) => target.replace(/^\.\//, "").split("/")[0]!).filter((entry) => entry !== "package.json")),
    path.basename(manifest.dsh?.bundle?.patch ?? ""),
    ...languages.map(readmeFileFor),
  ];
  context.assert(
    languages.includes("en") && languages.includes("zh"),
    "the shipped locale catalogs resolve to the en and zh languages",
    `languages: ${JSON.stringify(languages)}`,
  );
  context.assert(
    packlistFindings(packed, requiredPacked).length === 0,
    "the files allowlist packs exactly the built bundle, the cordis patch, and one README per shipped locale",
    `findings: ${JSON.stringify(packlistFindings(packed, requiredPacked))}`,
  );
  // Each finding category fires on realistic input through the same function.
  for (const [probe, category, label] of [
    [[...packed, "src"], "unshipped-source", "a source directory added to the allowlist"],
    [[...packed, "test-support/static-render.ts"], "unshipped-source", "a test-support path added to the allowlist"],
    [packed.filter((entry) => entry !== "dist"), "missing", "the built dist removed from the allowlist"],
    [packed.filter((entry) => entry !== "README.zh.md"), "missing", "a locale README removed from the allowlist"],
    [[...packed, "CHANGELOG.md"], "unexpected", "an unrequired file added to the allowlist"],
  ] as const) {
    context.assert(
      packlistFindings([...probe], requiredPacked).some((finding) => finding.category === category),
      `the packlist check reports ${category} for ${label}`,
    );
  }

  context.section("dsh plugin: release README files");

  for (const language of languages) {
    const file = readmeFileFor(language);
    const readmePath = path.join(PLUGIN_ROOT, file);
    const text = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
    const counterparts = languages.filter((other) => other !== language).map(readmeFileFor);
    const enginesRange = manifest.engines?.dsh ?? "";
    context.assert(
      readmeFindings(text, enginesRange, counterparts).length === 0,
      `the ${language} plugin README documents the engines range, the link: and tarball web installs, the desktop install, the dsh host upgrade SOP, and links its counterparts`,
      `findings: ${JSON.stringify(readmeFindings(text, enginesRange, counterparts))}`,
    );
    if (language !== "en") {
      continue;
    }
    // Each matcher category fires when its content is removed from the real README.
    for (const [probe, category] of [
      ["", "absent"],
      [text.split(enginesRange).join(""), "engines-range"],
      [text.split("--profile web add \"link:").join("--profile web add \""), "link-install"],
      [text.split("npm pack").join("pack"), "tarball-install"],
      [text.split("--profile desktop add").join("--profile desktop"), "desktop-install"],
      [text.split("dsh --version").join("dsh -v"), "upgrade-sop"],
      [text.split("builtinTooling").join("builtin tooling"), "builtin-tooling"],
      [counterparts.reduce((stripped, other) => stripped.split(`](${other})`).join("]"), text), "counterpart-link"],
    ] as const) {
      context.assert(
        readmeFindings(probe, enginesRange, counterparts).some((finding) => finding.category === category),
        `the README check reports ${category} when that content is removed`,
      );
    }
  }

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
