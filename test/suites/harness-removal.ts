import { spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { ROOT, TestContext, cli, loadDistModule, type CommandResult } from "../support/harness.js";

type ReferencesModule = { withoutRetirementSections(text: string): string };
type McpInventoryModule = { MCP_INVENTORY: unknown };

// Every probe token is assembled at runtime so this file never states the capability names it bans;
// the sweep's scope excludes test/, but a literal here would still read as a surviving reference.
const H = "harness";
const FORMER_COMMANDS = ["edit", "infer", "doctor", "plan", "start", "stop", "status", "logs", "scripts", "session"]
  .map((suffix) => `${H}-${suffix}`);
const FORMER_MCP_TOOLS = ["plan", "status", "logs", "edit", "start", "stop", "session_create", "session_mutate"]
  .map((suffix) => `${H}_${suffix}`);

/**
 * Tokens unique to the removed capability. The bare word is deliberately absent: agent-runtime
 * guidance ("the running harness"), the handoff rule, and the test runner under test/support all
 * use it for things this change keeps, so matching it would turn the proof into a report on them.
 */
const CAPABILITY_TOKENS: Array<{ category: string; token: string }> = [
  ...FORMER_COMMANDS.map((token) => ({ category: "command", token })),
  ...FORMER_MCP_TOOLS.map((token) => ({ category: "mcp-tool", token })),
  { category: "declaration", token: `${H}.yaml` },
  { category: "session-store", token: `${H}-sessions/` },
  { category: "mcp-resource", token: `strict://${H}` },
  { category: "mcp-prompt", token: `strict_${H}_investigation` },
  { category: "skill-section", token: `${H[0]!.toUpperCase()}${H.slice(1)} Guidance` },
  { category: "operator-doc", token: `${H.toUpperCase()}.md` },
  { category: "operator-doc", token: `${H.toUpperCase()}.zh.md` },
  { category: "operator-doc", token: ["DEBUG", "SESSIONS"].join("_") },
  { category: "operator-doc", token: ["DEBUG", "QUICKSTART"].join("_") },
  { category: "operator-doc", token: ["DEV", "SESSIONS"].join("_") },
];

/** Directories and top-level files whose content ships to an agent or operator. */
const GOVERNED_PREFIXES = ["src/", "skills/", "templates/", "examples/", "inventory/", "scripts/"];
const GOVERNED_TOP_LEVEL_EXTENSIONS = [".md", ".sh", ".ps1", ".json"];
/** The installer's retirement list, whose purpose is to name retired skill packages. */
const RETIREMENT_LIST = "retired-skills.json";

type CapabilityReference = { path: string; line: number; category: string; token: string };

/**
 * Every capability token in `text`, with the 1-based line of the original text it is on. Marked
 * retirement sections are skipped; the lines that survive are a subsequence of the original lines,
 * so each is mapped back to its original position rather than reported at its shifted index.
 */
function findCapabilityReferences(relativePath: string, text: string, references: ReferencesModule): CapabilityReference[] {
  const originalLines = text.split("\n");
  const keptLines = relativePath.endsWith(".md") ? references.withoutRetirementSections(text).split("\n") : originalLines;
  const found: CapabilityReference[] = [];
  let cursor = 0;
  for (const lineText of keptLines) {
    while (cursor < originalLines.length && originalLines[cursor] !== lineText) cursor += 1;
    for (const { category, token } of CAPABILITY_TOKENS) {
      if (lineText.includes(token)) found.push({ path: relativePath, line: cursor + 1, category, token });
    }
    cursor += 1;
  }
  return found;
}

/**
 * The governed files, listed from git rather than from the files this change edited, so a file the
 * change never touched is scanned just the same. The workflow state under .strict-spec-driven/ is
 * history — archived changes and the specs recording the removal — and is outside the scope.
 */
function listGovernedFiles(): string[] {
  const result = spawnSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "git ls-files failed");
  return result.stdout
    .split("\n")
    .filter((file) => file.length > 0 && existsSync(path.join(ROOT, file)) && statSync(path.join(ROOT, file)).isFile())
    .filter((file) =>
      GOVERNED_PREFIXES.some((prefix) => file.startsWith(prefix))
      || (!file.includes("/") && file !== RETIREMENT_LIST && GOVERNED_TOP_LEVEL_EXTENSIONS.some((extension) => file.endsWith(extension))));
}

function initProject(): string {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), "strict-harness-removal-"));
  const init = cli(["init"], { cwd: projectRoot });
  if (init.status !== 0) throw new Error(`init failed: ${init.stderr}`);
  return projectRoot;
}

/** Authors a change that passes ready and verify, through the same named arguments an agent uses. */
function authorValidChange(projectRoot: string, changeName: string): void {
  const steps: string[][] = [
    ["generate", changeName, "proposal", "--what", "Demo change", "--why", "Demo reason", "--in", "Demo scope", "--out", "Nothing else", "--unchanged", "Everything else"],
    ["generate", changeName, "design", "--approach", "Demo approach", "--decision", "no-spec-impact", "--decision-text", "No spec impact", "--rationale", "The demo change is purely technical"],
    [
      "generate", changeName, "tasks",
      "--implementation", "--task", "implement", "--text", "Implement", "--status", "complete",
      "--testing", "--task", "run-tests", "--text", "Run tests", "--command", "true", "--status", "complete",
      "--verification", "--task", "verify", "--text", "Verify", "--status", "complete",
      "--validation-task", "run-tests", "--unit-test-task", "run-tests",
    ],
    [
      "generate", changeName, "questions",
      ...["problem", "outcome", "trigger", "non-goals", "interpretation"]
        .flatMap((id) => ["--resolve", `requirement-${id}`, "--answer", "Answered", "--answered-by", "human"]),
    ],
  ];
  for (const step of steps) {
    const result = cli(step, { cwd: projectRoot });
    if (result.status !== 0) throw new Error(`${step.slice(0, 3).join(" ")} failed: ${result.stderr}${result.stdout}`);
  }
}

function sameResult(left: CommandResult, right: CommandResult): boolean {
  return left.status === right.status && left.stdout === right.stdout && left.stderr === right.stderr;
}

export async function runHarnessRemovalSuite(context: TestContext): Promise<void> {
  const references = await loadDistModule<ReferencesModule>("skills/references.js");
  const mcpInventory = await loadDistModule<McpInventoryModule>("mcp/inventory.js");

  context.section("[harness-removal] former commands fail as ordinary unknown commands");
  const unknown = cli(["definitely-not-a-strict-command"], { cwd: ROOT });
  context.assert(unknown.status !== 0, "an unregistered command exits non-zero");
  for (const command of FORMER_COMMANDS) {
    const result = cli([command], { cwd: ROOT });
    context.assert(
      sameResult(result, unknown),
      `${command} fails exactly as an unregistered command does, with no alias or retirement message`,
      `status ${result.status}, stderr ${result.stderr.slice(0, 200)}`,
    );
  }
  context.assert(!unknown.stderr.toLowerCase().includes(H), "the unknown-command usage names no removed command");

  context.section("[harness-removal] init and discovery expose no harness surface");
  const initRoot = initProject();
  try {
    const strictRoot = path.join(initRoot, ".strict-spec-driven");
    context.assert(!existsSync(path.join(strictRoot, `${H}.yaml`)), "init writes no harness declaration");
    context.assert(!existsSync(path.join(strictRoot, `${H}-sessions`)), "init writes no harness sessions directory");
  } finally {
    rmSync(initRoot, { recursive: true, force: true });
  }
  for (const command of ["schema-list", "template-list", "sample-list", "yaml-surface-list"]) {
    const result = cli([command], { cwd: ROOT });
    context.assert(
      result.status === 0 && !result.stdout.toLowerCase().includes(H),
      `${command} reports no harness schema, template, sample, or family`,
      result.stdout.split("\n").filter((line) => line.toLowerCase().includes(H)).join("; ") || result.stderr,
    );
  }
  context.assert(
    !JSON.stringify(mcpInventory.MCP_INVENTORY).toLowerCase().includes(H),
    "the MCP capability inventory lists no harness tool, resource, or prompt",
  );

  context.section("[harness-removal] residual harness files from an earlier version are ignored");
  const residualRoot = initProject();
  try {
    const changeName = "residual-demo";
    authorValidChange(residualRoot, changeName);
    const commands = [["check-workflow-state"], ["ready", changeName], ["verify", changeName]];
    const before = commands.map((args) => cli(args, { cwd: residualRoot }));
    context.assert(before.every((result) => result.status === 0), "the demo change is ready and verifies before residual files exist");

    const strictRoot = path.join(residualRoot, ".strict-spec-driven");
    writeFileSync(path.join(strictRoot, `${H}.yaml`), `schema: strict-spec-driven/${H}/v1\nartifact_type: ${H}\n`, "utf8");
    mkdirSync(path.join(strictRoot, `${H}-sessions`, "old-investigation"), { recursive: true });
    writeFileSync(path.join(strictRoot, `${H}-sessions`, "old-investigation", "session.yaml"), "artifact_type: stale\n", "utf8");
    mkdirSync(path.join(residualRoot, "scripts"), { recursive: true });
    writeFileSync(path.join(residualRoot, "scripts", FORMER_COMMANDS[3]!), "#!/bin/sh\n", "utf8");

    commands.forEach((args, index) => {
      const after = cli(args, { cwd: residualRoot });
      context.assert(
        sameResult(after, before[index]!) && !after.stdout.toLowerCase().includes(H),
        `${args[0]} succeeds exactly as before and reports nothing about residual harness files`,
        after.stdout.slice(0, 300),
      );
    });
  } finally {
    rmSync(residualRoot, { recursive: true, force: true });
  }

  context.section("[harness-removal] repository sweep proves no capability reference survives");
  // Positive case first: every matcher category fires on realistic input, through the same scanner.
  const categories = [...new Set(CAPABILITY_TOKENS.map((entry) => entry.category))];
  for (const category of categories) {
    const sample = CAPABILITY_TOKENS.find((entry) => entry.category === category)!.token;
    const findings = findCapabilityReferences("skills/example/SKILL.md", `Before.\nRun \`${sample}\` first.\n`, references);
    context.assert(
      findings.some((finding) => finding.category === category && finding.line === 2),
      `the sweep fires on a ${category} reference`,
    );
  }

  // Negative case: content inserted into real governed input is reported, so a green scan is not vacuous.
  const readmeText = readFileSync(path.join(ROOT, "README.md"), "utf8");
  const readmeWithInsertion = `${readmeText}\n## Appendix\n\nRun ${FORMER_COMMANDS[3]} to plan.\n`;
  const insertedFindings = findCapabilityReferences("README.md", readmeWithInsertion, references);
  const insertedLine = readmeWithInsertion.split("\n").findIndex((line) => line.includes(FORMER_COMMANDS[3]!) && line.startsWith("Run ")) + 1;
  context.assert(
    insertedFindings.length === 1 && insertedFindings[0]!.token === FORMER_COMMANDS[3] && insertedFindings[0]!.line === insertedLine,
    "a capability reference inserted into real README content is reported at its original line",
    JSON.stringify(insertedFindings),
  );

  // The retirement section is the one place a former name must appear, and it is excluded by the
  // marker the packaged-skill reference check already honours rather than by an allowlist.
  context.assert(
    readmeText.includes(FORMER_COMMANDS[3]!) && findCapabilityReferences("README.md", readmeText, references).length === 0,
    "the README upgrade note names the removed commands only inside its marked retirement section",
  );

  // Agent-runtime and test-runner uses of the word are retained deliberately and must not be reported.
  const retainedUsers = [
    "skills/strict-spec-auto/SKILL.md",
    "skills/strict-roadmap-recommend/SKILL.md",
    "src/skills/handoff.ts",
    "src/skills/content.ts",
  ];
  for (const relativePath of retainedUsers) {
    const text = readFileSync(path.join(ROOT, relativePath), "utf8");
    context.assert(
      text.toLowerCase().includes(H) && findCapabilityReferences(relativePath, text, references).length === 0,
      `${relativePath} keeps its agent-runtime harness wording without being reported`,
    );
  }
  context.assert(
    findCapabilityReferences("skills/x/SKILL.md", "however the running harness loads it\n", references).length === 0,
    "agent-runtime harness wording is not a capability reference",
  );

  const governedFiles = listGovernedFiles();
  context.assert(
    governedFiles.includes("README.md")
      && governedFiles.includes("install.sh")
      && governedFiles.includes("src/archive.ts")
      && governedFiles.some((file) => file.startsWith("skills/"))
      && !governedFiles.includes(RETIREMENT_LIST),
    "the sweep scope is listed from the repository rather than from the files this change edited",
  );
  const survivors = governedFiles.flatMap((file) => findCapabilityReferences(file, readFileSync(path.join(ROOT, file), "utf8"), references));
  context.assert(
    survivors.length === 0,
    `no harness capability reference survives in ${governedFiles.length} governed files`,
    `${survivors.length} survivor(s): ${survivors.map((survivor) => `${survivor.path}:${survivor.line} ${survivor.token}`).join(", ")}`,
  );
}
