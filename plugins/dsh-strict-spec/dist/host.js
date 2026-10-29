// src/host.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path2 from "node:path";
import Schema from "@deepseek-ai/schemastery";

// src/host/builtinTooling.ts
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
var BUILTIN_TOOLING_PROVIDER_NAME = "strict-spec-plugin";
var BUILTIN_TOOLING_RANK = 600;
var SKILL_BODY_FILE = "SKILL.md";
var FRONTMATTER_FENCE = "---";
var SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var CLI_TOKEN_PATTERN = /(?<![\w-])strict-spec-cli(?![\w.-])/g;
var SAFE_UNQUOTED_PATTERN = /^[A-Za-z0-9_@%+=:,./-]+$/;
var INVOCATION = { modelInvocable: true, userInvocable: true };
function buildProvenanceMarker(pluginVersion) {
  return ` — built-in (dsh plugin ${pluginVersion})`;
}
function quoteCommandPath(value) {
  return SAFE_UNQUOTED_PATTERN.test(value) ? value : JSON.stringify(value);
}
function buildCliInvocation(execPath, cliPath) {
  return `${quoteCommandPath(execPath)} ${quoteCommandPath(cliPath)}`;
}
function rewriteCliToken(body, invocation) {
  return body.replace(CLI_TOKEN_PATTERN, invocation);
}
function parseSkillFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== FRONTMATTER_FENCE)
    return;
  let name;
  let description;
  let closeIndex = -1;
  for (let index = 1;index < lines.length; index += 1) {
    const line = lines[index];
    if (line === FRONTMATTER_FENCE) {
      closeIndex = index;
      break;
    }
    if (name === undefined && line.startsWith("name:")) {
      name = line.slice("name:".length).trim();
    } else if (description === undefined && line.startsWith("description:")) {
      description = line.slice("description:".length).trim();
    }
  }
  if (closeIndex < 0)
    return;
  if (name === undefined || name.length === 0 || !SKILL_NAME_PATTERN.test(name))
    return;
  if (description === undefined || description.length === 0)
    return;
  return { name, description, body: lines.slice(closeIndex + 1).join(`
`) };
}
async function listBundledSkills(skillsDir) {
  let entries;
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const records = [];
  for (const entry of entries) {
    if (!entry.isDirectory())
      continue;
    const filePath = path.join(skillsDir, entry.name, SKILL_BODY_FILE);
    let text;
    try {
      text = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const parsed = parseSkillFrontmatter(text);
    if (parsed === undefined)
      continue;
    records.push({ name: parsed.name, description: parsed.description, filePath });
  }
  records.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  return records;
}
function createBuiltinToolingProvider(assets) {
  const invocation = buildCliInvocation(assets.execPath, assets.cliPath);
  return {
    name: BUILTIN_TOOLING_PROVIDER_NAME,
    async list() {
      const records = await listBundledSkills(assets.skillsDir);
      return records.map((record) => ({
        name: record.name,
        description: `${record.description}${assets.provenanceMarker}`,
        invocation: INVOCATION,
        source: "bundled",
        provider: BUILTIN_TOOLING_PROVIDER_NAME,
        resourceBase: { kind: "directory", path: path.dirname(record.filePath) },
        rank: BUILTIN_TOOLING_RANK,
        locator: record.filePath
      }));
    },
    async get(candidate) {
      let text;
      try {
        text = await readFile(String(candidate.locator), "utf8");
      } catch {
        return;
      }
      const parsed = parseSkillFrontmatter(text);
      if (parsed === undefined || parsed.name !== candidate.name)
        return;
      return {
        name: parsed.name,
        description: `${parsed.description}${assets.provenanceMarker}`,
        invocation: INVOCATION,
        source: "bundled",
        provider: BUILTIN_TOOLING_PROVIDER_NAME,
        resourceBase: { kind: "directory", path: path.dirname(String(candidate.locator)) },
        content: rewriteCliToken(parsed.body, invocation)
      };
    }
  };
}

// src/host.ts
var inject = ["skills"];
var Config = Schema.object({
  builtinTooling: Schema.boolean().default(true).description("Serve the built-in strict skills and strict-spec-cli from this plugin.")
});
function readPluginVersion(distDir) {
  try {
    const manifest = JSON.parse(readFileSync(path2.join(distDir, "..", "package.json"), "utf8"));
    return manifest.version && manifest.version.length > 0 ? manifest.version : "unknown";
  } catch {
    return "unknown";
  }
}
function apply(ctx, config = {}) {
  if (config.builtinTooling === false)
    return;
  const distDir = path2.dirname(fileURLToPath(import.meta.url));
  ctx.skills.registerProvider(() => createBuiltinToolingProvider({
    skillsDir: path2.join(distDir, "skills"),
    cliPath: path2.join(distDir, "cli", "strict-spec-cli.js"),
    execPath: process.execPath,
    provenanceMarker: buildProvenanceMarker(readPluginVersion(distDir))
  }));
}
export {
  Config,
  apply,
  inject,
  readPluginVersion
};

