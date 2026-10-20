/**
 * The dsh plugin built-in tooling host suite: exercises the host-side
 * provision with no dsh host involved — the bundled-skill provider against
 * fixture asset directories and against the repository's real skill
 * packages, the strict frontmatter reader over every shipped body, the
 * serve-time CLI token rewrite including its quoting and boundary branches,
 * the precedence rank that makes built-in copies win over external ones, the
 * host entry's switch wiring and config defaulting, and the built host
 * bundle's externals shape. The CLI asset and host entry are built in memory
 * through the plugin's own build helpers, so the suite adds no build
 * prerequisite beyond the ones the repository suites already carry.
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { ROOT, TestContext } from "../support/harness.js";
import {
  BUILTIN_TOOLING_PROVIDER_NAME,
  BUILTIN_TOOLING_RANK,
  CLI_TOKEN_PATTERN,
  buildCliInvocation,
  createBuiltinToolingProvider,
  listBundledSkills,
  parseSkillFrontmatter,
  quoteCommandPath,
  rewriteCliToken,
} from "../../plugins/dsh-strict-spec/src/host/builtinTooling.ts";
import {
  CLI_ASSET_PATH,
  buildHostEntry,
  bundledSkillAssetPath,
  listBundledSkillNames,
  planBuildOutputs,
  readBundledSkillBodies,
} from "../../plugins/dsh-strict-spec/scripts/build-client.ts";
import { Config, apply, inject } from "../../plugins/dsh-strict-spec/src/host.ts";

const PLUGIN_ROOT = path.join(ROOT, "plugins", "dsh-strict-spec");
const REPO_SKILLS_DIR = path.join(ROOT, "skills");

/**
 * Stateless bare-token probe: the exported pattern carries the /g flag for
 * its replace role, whose lastIndex would make repeated .test() calls
 * inconsistent, so each probe compiles a fresh non-global matcher.
 */
function hasBareCliToken(text: string): boolean {
  return new RegExp(CLI_TOKEN_PATTERN.source).test(text);
}

/** A valid frontmatter header the fixture skill bodies start from. */
function skillText(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  skill_id: probe\n  version: 1.0.0\n---\n\n${body}`;
}

/** Creates a fixture assets tree and returns its skills directory. */
function seedFixtureSkills(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "strict-host-assets-"));
  const skillsDir = path.join(dir, "skills");
  for (const name of ["alpha", "no-body", "unparsed", "bad-name", "no-description"]) {
    mkdirSync(path.join(skillsDir, name), { recursive: true });
  }
  writeFileSync(
    path.join(skillsDir, "alpha", "SKILL.md"),
    skillText(
      "alpha",
      "Alpha probe skill for the provider suite.",
      "Run the workflow:\n\n```yaml\ncheck: strict-spec-cli check-workflow-state\n```\n\nAlso `strict-spec-cli verify` in prose.\n",
    ),
  );
  writeFileSync(path.join(skillsDir, "unparsed", "SKILL.md"), "no frontmatter at all\n");
  writeFileSync(path.join(skillsDir, "bad-name", "SKILL.md"), skillText("Bad Name", "A name outside the grammar.", "body\n"));
  writeFileSync(path.join(skillsDir, "no-description", "SKILL.md"), "---\nname: no-description\n---\nbody\n");
  writeFileSync(path.join(skillsDir, "marketplace.json"), "{}\n");
  process.on("exit", () => {
    rmSync(dir, { recursive: true, force: true });
  });
  return skillsDir;
}

/** Probe runtime paths the fixture provider and its assertions share. */
const PROBE_EXEC = "/usr/local/bin/node";
const PROBE_CLI = "/opt/dsh-plugin-strict-spec/dist/cli/strict-spec-cli.js";

/** The provider closed over the fixture assets with probe runtime paths. */
function fixtureProvider(skillsDir: string): ReturnType<typeof createBuiltinToolingProvider> {
  return createBuiltinToolingProvider({
    skillsDir,
    cliPath: PROBE_CLI,
    execPath: PROBE_EXEC,
  });
}

/**
 * One host-entry wiring defect, by stable category. Derived from the entry's
 * own source text so the negative probes can mutate the real input.
 */
export type HostWiringFinding = { category: string; detail: string };

/**
 * Inspect the host entry's source for the wiring the provision depends on:
 * the skills service declared in the inject export, the registration gated on
 * the switch being explicitly false, and the schemastery Config defaulting
 * the switch to true. Pure over its input.
 */
export function inspectHostWiring(source: string): HostWiringFinding[] {
  const findings: HostWiringFinding[] = [];
  if (!/export const inject[^=]*=\s*\[[^\]]*"skills"/.test(source)) {
    findings.push({ category: "inject-declaration", detail: "the inject export does not declare the skills service" });
  }
  if (!/config\.builtinTooling === false/.test(source)) {
    findings.push({ category: "switch-gate", detail: "apply is not gated on config.builtinTooling === false returning early" });
  }
  if (!/Schema\.boolean\(\)\s*\n?\s*\.default\(true\)/.test(source)) {
    findings.push({ category: "config-default", detail: "the Config schema does not default builtinTooling to true" });
  }
  return findings;
}

/**
 * One built host-bundle shape defect, by stable category: the bundle must
 * import the Config schema module externally, never require the type-only
 * skill registry package at runtime, and never inline a shared dsh module.
 */
export type HostBundleFinding = { category: string; detail: string };

const HOST_EXTERNAL_IMPORT_PATTERN = /from\s*"(@deepseek-ai\/schemastery)"/;
const HOST_DSH_SKILL_REFERENCE = "@deepseek-ai/dsh-skill";
const HOST_INLINED_MARKERS: readonly string[] = ['Symbol.for("cordis.', 'Symbol.for("react.', "onRecoverableError"];

/** Inspect a built host entry for its externals shape. Pure over its input. */
export function inspectHostBundle(bundle: string): HostBundleFinding[] {
  const findings: HostBundleFinding[] = [];
  if (!HOST_EXTERNAL_IMPORT_PATTERN.test(bundle)) {
    findings.push({ category: "schema-external", detail: "the host bundle does not import @deepseek-ai/schemastery externally" });
  }
  if (bundle.includes(HOST_DSH_SKILL_REFERENCE)) {
    findings.push({ category: "type-only-reference", detail: "the host bundle references @deepseek-ai/dsh-skill, which must stay type-only" });
  }
  for (const marker of HOST_INLINED_MARKERS) {
    if (bundle.includes(marker)) {
      findings.push({ category: "inlined-shared-module", detail: `host bundle inlines a shared module (marker ${JSON.stringify(marker)})` });
    }
  }
  return findings;
}

export async function runDshPluginHostSuite(context: TestContext): Promise<void> {
  context.section("dsh plugin host: frontmatter reader");

  context.assert(
    parseSkillFrontmatter(skillText("alpha", "desc", "body\n")) !== undefined,
    "a well-formed frontmatter parses",
  );
  const parsed = parseSkillFrontmatter(skillText("alpha", "the description", "line one\nline two\n"));
  context.assert(parsed?.name === "alpha", "the reader returns the declared name");
  context.assert(parsed?.description === "the description", "the reader returns the declared description");
  context.assert(parsed?.body === "\nline one\nline two\n", "the body starts after the closing fence");
  context.assert(parseSkillFrontmatter("no fence\n") === undefined, "text without a frontmatter fence is rejected");
  context.assert(parseSkillFrontmatter("---\nname: open-fence\n") === undefined, "an unclosed fence is rejected");
  context.assert(parseSkillFrontmatter("---\ndescription: only\n---\nbody") === undefined, "a missing name is rejected");
  context.assert(parseSkillFrontmatter("---\nname: only\n---\nbody") === undefined, "a missing description is rejected");
  context.assert(parseSkillFrontmatter("---\nname: \ndescription: d\n---\nbody") === undefined, "an empty name is rejected");
  context.assert(
    parseSkillFrontmatter(skillText("Not-A-Name", "d", "body")) === undefined,
    "a name outside the kebab-case grammar is rejected",
  );
  context.assert(
    parseSkillFrontmatter("---\r\nname: crlf\r\ndescription: d\r\n---\r\nbody\r\n")?.name === "crlf",
    "CRLF frontmatter parses with the carriage returns stripped",
  );

  context.section("dsh plugin host: CLI token rewrite");

  const plainExec = PROBE_EXEC;
  const plainCli = PROBE_CLI;
  const plainInvocation = `${plainExec} ${plainCli}`;
  context.assert(quoteCommandPath(plainCli) === plainCli, "a safe path stays unquoted");
  context.assert(quoteCommandPath("/opt/my plugins/cli.js") === '"/opt/my plugins/cli.js"', "a path with a space quotes itself");
  context.assert(
    quoteCommandPath("/opt/$(boom)/cli.js") === '"/opt/$(boom)/cli.js"',
    "a path with shell-sensitive characters quotes itself",
  );
  context.assert(buildCliInvocation(plainExec, plainCli) === plainInvocation, "the invocation composes both paths");
  const rewritten = rewriteCliToken(
    "```yaml\ncheck: strict-spec-cli check-workflow-state\n```\nRun `strict-spec-cli verify` and strict-spec-driven paths stay.",
    plainInvocation,
  );
  context.assert(
    rewritten.includes(`check: ${plainInvocation} check-workflow-state`),
    "the rewrite turns a YAML command into the bundled invocation",
  );
  context.assert(
    rewritten.includes(`\`${plainInvocation} verify\``),
    "the rewrite turns a backticked prose command into the bundled invocation",
  );
  context.assert(
    !hasBareCliToken(rewritten),
    "no bare CLI token remains after the rewrite",
  );
  context.assert(
    rewritten.includes("strict-spec-driven paths stay"),
    "the longer strict-spec-driven token is never rewritten",
  );
  context.assert(
    !new RegExp(`(?<![\\w-])strict-spec-cli(?![\\w.-])`).test("dist/strict-spec-cli.js"),
    "a file-name reference to the CLI binary is outside the token pattern",
  );

  context.section("dsh plugin host: provider over fixture assets");

  const skillsDir = seedFixtureSkills();
  const records = await listBundledSkills(skillsDir);
  context.assert(
    records.length === 1 && records[0]!.name === "alpha",
    "only the skill with a parseable body lists, and non-directories are ignored",
    `records: ${JSON.stringify(records.map((record) => record.name))}`,
  );
  const provider = fixtureProvider(skillsDir);
  const candidates = await provider.list({});
  context.assert(candidates.length === 1, "the provider lists the intact skill alone");
  const candidate = candidates[0]!;
  context.assert(candidate.name === "alpha", "the candidate carries the frontmatter name");
  context.assert(candidate.description === "Alpha probe skill for the provider suite.", "the candidate carries the frontmatter description");
  context.assert(candidate.rank === BUILTIN_TOOLING_RANK, "the candidate carries the built-in precedence rank");
  context.assert(candidate.source === "bundled", "the candidate marks its origin as bundled");
  context.assert(candidate.provider === BUILTIN_TOOLING_PROVIDER_NAME, "the candidate names the plugin provider");
  context.assert(candidate.invocation.modelInvocable && candidate.invocation.userInvocable, "the candidate is model- and user-invocable");
  context.assert(candidate.locator === path.join(skillsDir, "alpha", "SKILL.md"), "the candidate's locator is its body file");
  const definition = await provider.get(candidate, {});
  context.assert(definition !== undefined, "the provider loads a listed candidate");
  context.assert(
    definition?.content.includes(plainInvocation),
    "the served body invokes the bundled CLI through the host node executable",
  );
  context.assert(!definition?.content.includes("strict-spec-cli check-workflow-state"), "the served body carries no bare CLI command");
  context.assert(!definition?.content.startsWith("---"), "the served body has its frontmatter stripped");
  context.assert(
    await provider.get({ ...candidate, locator: path.join(skillsDir, "gone", "SKILL.md") }, {}) === undefined,
    "a candidate whose file disappeared resolves to undefined",
  );
  context.assert(
    await provider.get({ ...candidate, name: "renamed" }, {}) === undefined,
    "a candidate whose stored name no longer matches its body resolves to undefined",
  );
  context.assert((await listBundledSkills(path.join(skillsDir, "does-not-exist"))).length === 0, "an unreadable assets directory lists nothing");

  context.section("dsh plugin host: precedence rank");

  // The pinned dsh line's filesystem skill roots occupy ranks 100 (project-dsh)
  // through 600 (bundled); the registry resolves duplicate names by lowest rank
  // within a layer, so the built-in rank must sit below the lowest root rank.
  context.assert(
    BUILTIN_TOOLING_RANK < 100,
    "the built-in rank beats every filesystem skill root rank of the pinned dsh line",
    `rank: ${BUILTIN_TOOLING_RANK}`,
  );

  context.section("dsh plugin host: repository skill sources");

  const skillNames = listBundledSkillNames();
  context.assert(skillNames.length >= 25, "the repository ships a full skill family", `count: ${skillNames.length}`);
  const bodies = readBundledSkillBodies();
  context.assert(
    JSON.stringify(skillNames) === JSON.stringify([...bodies.keys()]),
    "the build helper reads exactly the discovered skill packages",
  );
  for (const name of skillNames) {
    const source = readFileSync(path.join(REPO_SKILLS_DIR, name, "SKILL.md"), "utf8");
    const frontmatter = parseSkillFrontmatter(source);
    context.assert(frontmatter !== undefined, `the shipped ${name} body parses`);
    context.assert(frontmatter?.name === name, `the shipped ${name} body declares its own name`);
    context.assert((frontmatter?.description.length ?? 0) > 0, `the shipped ${name} body declares a description`);
    context.assert((frontmatter?.body.length ?? 0) > 0, `the shipped ${name} body carries instructions`);
    context.assert(bodies.get(name) === source, `the build helper ships ${name} byte-identically`);
    context.assert(bundledSkillAssetPath(name) === path.join("skills", name, "SKILL.md"), `the ${name} asset path nests under skills/`);
    if (hasBareCliToken(source)) {
      const rewrittenSource = rewriteCliToken(source, plainInvocation);
      context.assert(
        rewrittenSource.includes(plainInvocation),
        `the rewritten ${name} body carries the bundled invocation`,
      );
      context.assert(
        !hasBareCliToken(rewrittenSource),
        `the rewritten ${name} body leaves no bare CLI token`,
      );
    }
  }
  const protocolCarrier = rewriteCliToken(
    readFileSync(path.join(REPO_SKILLS_DIR, "strict-spec-auto", "SKILL.md"), "utf8"),
    plainInvocation,
  );
  context.assert(
    protocolCarrier.includes("yaml-authoring-protocol"),
    "the rewrite keeps the yaml-authoring-protocol pointer subcommand a served body states",
  );
  context.assert(
    protocolCarrier.includes(`${plainInvocation} verify`),
    "the rewrite keeps the artifact validation subcommand as a bundled invocation",
  );

  context.section("dsh plugin host: switch wiring and config defaulting");

  const hostSource = readFileSync(path.join(PLUGIN_ROOT, "src", "host.ts"), "utf8");
  context.assert(
    inspectHostWiring(hostSource).length === 0,
    "the host entry declares the skills service, gates on the switch, and defaults it on",
    `findings: ${JSON.stringify(inspectHostWiring(hostSource))}`,
  );
  const injectStripped = hostSource.replace('"skills"', '"other-service"');
  context.assert(
    inspectHostWiring(injectStripped).some((finding) => finding.category === "inject-declaration"),
    "the wiring check fires when the inject declaration drops the skills service",
  );
  const gateStripped = hostSource.replace("config.builtinTooling === false", "false");
  context.assert(
    inspectHostWiring(gateStripped).some((finding) => finding.category === "switch-gate"),
    "the wiring check fires when the switch gate is removed",
  );
  const defaultStripped = hostSource.replace(".default(true)", ".default(false)");
  context.assert(
    inspectHostWiring(defaultStripped).some((finding) => finding.category === "config-default"),
    "the wiring check fires when the Config default flips off",
  );

  const defaulted = (Config as (value: Record<string, unknown>) => { builtinTooling?: boolean })({});
  context.assert(defaulted.builtinTooling === true, "the Config schema defaults the switch to enabled");
  const disabled = (Config as (value: Record<string, unknown>) => { builtinTooling?: boolean })({ builtinTooling: false });
  context.assert(disabled.builtinTooling === false, "the Config schema keeps an explicit false");
  context.assert(inject.includes("skills"), "the entry's inject export declares the skills service");

  let registrations = 0;
  const fakeCtx = {
    skills: {
      registerProvider(create: () => unknown): () => void {
        registrations += 1;
        create();
        return () => {};
      },
    },
  } as unknown as Parameters<typeof apply>[0];
  apply(fakeCtx, { builtinTooling: false });
  context.assert(registrations === 0, "a disabled switch registers no provider");
  apply(fakeCtx);
  context.assert(registrations === 1, "an absent config keeps the default and registers the provider");
  apply(fakeCtx, { builtinTooling: true });
  context.assert(registrations === 2, "an enabled switch registers the provider");

  context.section("dsh plugin host: built host bundle shape");

  const hostBundle = await buildHostEntry();
  context.assert(
    inspectHostBundle(hostBundle).length === 0,
    "the built host entry imports the schema module externally and inlines no shared dsh module",
    `findings: ${JSON.stringify(inspectHostBundle(hostBundle))}`,
  );
  const schemaImportStripped = hostBundle.replace('from "@deepseek-ai/schemastery"', 'from "./inlined-schema.ts"');
  context.assert(
    inspectHostBundle(schemaImportStripped).some((finding) => finding.category === "schema-external"),
    "the host bundle check fires when the schema import is retargeted",
  );
  const withSkillReference = `${hostBundle}\nimport type { SkillProvider } from "@deepseek-ai/dsh-skill";\n`;
  context.assert(
    inspectHostBundle(withSkillReference).some((finding) => finding.category === "type-only-reference"),
    "the host bundle check fires when the registry package appears at runtime",
  );
  const withInlinedCordis = `${hostBundle}\nvar C={};/* Symbol.for("cordis.effect") */\n`;
  context.assert(
    inspectHostBundle(withInlinedCordis).some((finding) => finding.category === "inlined-shared-module"),
    "the host bundle check fires when a shared dsh module marker inlines",
  );

  context.section("dsh plugin host: bundled tooling build plan");

  context.assert(CLI_ASSET_PATH === path.join("cli", "strict-spec-cli.js"), "the CLI asset lives under cli/ in the bundle directory");
  if (existsSync(path.join(ROOT, "dist", "scripts", "strict-spec-driven.js"))) {
    const plan = await planBuildOutputs();
    const planPaths = plan.map((output) => output.path);
    const expectedSkillPaths = skillNames.map((name) => bundledSkillAssetPath(name));
    context.assert(
      planPaths.includes("client.js") && planPaths.includes("host.js") && planPaths.includes(CLI_ASSET_PATH),
      "the build plan writes the client bundle, the host entry, and the CLI asset",
      `paths: ${JSON.stringify(planPaths.slice(0, 5))}...`,
    );
    for (const skillPath of expectedSkillPaths) {
      context.assert(planPaths.includes(skillPath), `the build plan writes ${skillPath}`);
    }
    context.assert(
      planPaths.length === expectedSkillPaths.length + 3,
      "the build plan writes exactly the bundles, the CLI, and the skill bodies",
      `plan ${planPaths.length} vs expected ${expectedSkillPaths.length + 3}`,
    );
    for (const name of skillNames) {
      const output = plan.find((candidate) => candidate.path === bundledSkillAssetPath(name));
      context.assert(
        output?.text === readFileSync(path.join(REPO_SKILLS_DIR, name, "SKILL.md"), "utf8"),
        `the planned ${name} asset is byte-identical to its repository source`,
      );
    }
    const cliOutput = plan.find((candidate) => candidate.path === CLI_ASSET_PATH);
    const repoCli = readFileSync(path.join(ROOT, "dist", "scripts", "strict-spec-driven.js"), "utf8");
    context.assert(
      cliOutput?.text === repoCli,
      "the planned CLI asset is byte-identical to the repository build's own CLI bundle",
      `asset ${cliOutput?.text.length ?? 0} bytes vs repository ${repoCli.length} bytes`,
    );

    // Negative probes through the same predicate shapes the passing checks
    // call, over the real plan with synthetic defects added: a dropped skill
    // asset, an extra entry, and a mutated body must each be caught.
    const firstSkillPath = bundledSkillAssetPath(skillNames[0]!);
    const droppedSkillPaths = plan.filter((output) => output.path !== firstSkillPath).map((output) => output.path);
    context.assert(
      !droppedSkillPaths.includes(firstSkillPath),
      "the build-plan check reports a dropped skill asset",
    );
    const extraEntryCount = [...plan, { path: "stowaway.txt", text: "x" }].length;
    context.assert(
      extraEntryCount !== expectedSkillPaths.length + 3,
      "the build-plan check reports an entry beyond the bundles, CLI, and skill bodies",
    );
    const mutatedText = `${plan.find((candidate) => candidate.path === firstSkillPath)?.text ?? ""}\nsynthetic mutation\n`;
    context.assert(
      mutatedText !== readFileSync(path.join(REPO_SKILLS_DIR, skillNames[0]!, "SKILL.md"), "utf8"),
      "the build-plan check reports a skill asset that drifted from its repository source",
    );
  } else {
    context.assert(false, "the repository CLI bundle exists to compare the asset against (run bun run build)");
  }
}
