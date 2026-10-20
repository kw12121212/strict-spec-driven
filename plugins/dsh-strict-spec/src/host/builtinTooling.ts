/**
 * Built-in strict tooling for the dsh plugin host entry.
 *
 * The module is deliberately dsh-free at runtime: it shapes plain objects
 * against the `SkillProvider` contract of `@deepseek-ai/dsh-skill` through
 * type-only imports, because the provider is handed to the host-owned
 * `ctx.skills` service, which owns the registry. Everything the module needs
 * at runtime comes from its parameters — the bundled assets' absolute
 * locations and the running host's executable — so a suite can exercise the
 * whole provision against fixture directories without a dsh host.
 *
 * Two behaviors are contract-bearing rather than incidental:
 *
 * - Candidates are served at {@link BUILTIN_TOOLING_RANK}, the pinned dsh
 *   line's bundled band, so built-in copies are a fallback: within one
 *   registry layer every filesystem skill root rank (project 100 through user
 *   500) beats the bundled band and the external copy of a same-name skill
 *   wins, and across layers a preset's local discovery registers nearer than
 *   this deployment-level provider, so a session with an external copy runs
 *   the external tooling. Only a name no external root offers falls through
 *   to the built-in copy, which is what keeps zero-install machines working.
 *   The `source` field stays "bundled" because it is origin metadata, not
 *   precedence.
 * - Skill bodies are shipped byte-identical to the repository `skills/`
 *   packages and adapted only at serve time: every bare `strict-spec-cli`
 *   command token is rewritten into a direct invocation of the bundled CLI
 *   through the running host's node executable, so the repository packages
 *   remain the single authored source and no global install is required.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type {
  SkillCandidate,
  SkillDefinition,
  SkillProvider,
} from "@deepseek-ai/dsh-skill";

/** The provider's name in the host's `ctx.skills` registry. */
export const BUILTIN_TOOLING_PROVIDER_NAME = "strict-spec-plugin";

/**
 * Candidate rank of the pinned dsh line's bundled band: within one registry
 * layer the resolver picks the lowest rank for a duplicate name, and the
 * filesystem provider's roots occupy 100 (project-dsh) through 500
 * (user-agents), so the bundled band loses every same-layer duel against an
 * external copy. Across layers a preset's local discovery registers nearer
 * than this deployment-level provider, which makes external copies win there
 * too — the built-in copies serve only names no external root offers.
 */
export const BUILTIN_TOOLING_RANK = 600;

/** The file name a bundled skill package carries its body in. */
export const SKILL_BODY_FILE = "SKILL.md";

/** Frontmatter fence exactly as the repository skill packages declare it. */
const FRONTMATTER_FENCE = "---";

/** The kebab-case grammar the pinned registry accepts for a skill name. */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The bare `strict-spec-cli` token every authored skill body states its
 * commands with. The lookarounds keep the match from firing inside a longer
 * reference: a word or hyphen on either side marks an identifier, and a
 * trailing dot marks a file name such as `strict-spec-cli.js`, so only the
 * bare command token — followed by a space, end of line, or punctuation — is
 * rewritten.
 */
export const CLI_TOKEN_PATTERN = /(?<![\w-])strict-spec-cli(?![\w.-])/g;

/**
 * Characters that stay one shell word and one YAML plain scalar unquoted.
 * Anything else — spaces, quotes, `$`, backticks, braces, non-ASCII — makes
 * the path quote itself as a JSON string so the rewritten command line is
 * copy-runnable in a shell and stays readable in prose and YAML blocks.
 */
const SAFE_UNQUOTED_PATTERN = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** Invocation controls shared by every bundled candidate. */
const INVOCATION = { modelInvocable: true, userInvocable: true } as const;

/** Parsed frontmatter of one bundled skill body. */
export interface SkillFrontmatter {
  /** The kebab-case skill name the body declares. */
  readonly name: string;
  /** The single-line routing description the body declares. */
  readonly description: string;
  /** The instruction body after the closing fence. */
  readonly body: string;
}

/** The absolute locations and runtime facts the provision closes over. */
export interface BuiltinToolingAssets {
  /** Directory holding one `<name>/SKILL.md` per bundled skill. */
  readonly skillsDir: string;
  /** Absolute path of the bundled strict-spec-cli bundle. */
  readonly cliPath: string;
  /** Absolute path of the running host's node executable. */
  readonly execPath: string;
}

/** Quote one path for a command line, only when it needs quoting. */
export function quoteCommandPath(value: string): string {
  return SAFE_UNQUOTED_PATTERN.test(value) ? value : JSON.stringify(value);
}

/** Build the invocation that replaces the bare CLI token in served bodies. */
export function buildCliInvocation(execPath: string, cliPath: string): string {
  return `${quoteCommandPath(execPath)} ${quoteCommandPath(cliPath)}`;
}

/** Rewrite every bare CLI token in a skill body to the bundled invocation. */
export function rewriteCliToken(body: string, invocation: string): string {
  return body.replace(CLI_TOKEN_PATTERN, invocation);
}

/**
 * Read the strict frontmatter the repository skill packages declare: a fence,
 * single-line `name` and `description` string values, an ignored remainder
 * such as the metadata block, and a closing fence. Returns `undefined` for
 * anything else — no frontmatter, a missing or empty required value, or a
 * name outside the kebab-case grammar — so the caller's failure mode is
 * omitting the skill, never guessing at its identity.
 */
export function parseSkillFrontmatter(text: string): SkillFrontmatter | undefined {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== FRONTMATTER_FENCE) return undefined;
  let name: string | undefined;
  let description: string | undefined;
  let closeIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === FRONTMATTER_FENCE) {
      closeIndex = index;
      break;
    }
    // First declaration wins: the ignored remainder (the metadata block)
    // cannot override the identity fields above it.
    if (name === undefined && line.startsWith("name:")) {
      name = line.slice("name:".length).trim();
    } else if (description === undefined && line.startsWith("description:")) {
      description = line.slice("description:".length).trim();
    }
  }
  if (closeIndex < 0) return undefined;
  if (name === undefined || name.length === 0 || !SKILL_NAME_PATTERN.test(name)) return undefined;
  if (description === undefined || description.length === 0) return undefined;
  return { name, description, body: lines.slice(closeIndex + 1).join("\n") };
}

/** One bundled skill discovered in the plugin's assets. */
export interface BundledSkillRecord {
  /** Kebab-case skill name from the body's frontmatter. */
  readonly name: string;
  /** Routing description from the body's frontmatter. */
  readonly description: string;
  /** Absolute path of the bundled SKILL.md. */
  readonly filePath: string;
}

/**
 * List the bundled skills an assets directory holds. A directory without a
 * parseable SKILL.md is omitted; a skills directory that cannot be read at
 * all yields an empty list, so a broken or partial installation degrades to
 * offering nothing rather than failing the host.
 */
export async function listBundledSkills(skillsDir: string): Promise<readonly BundledSkillRecord[]> {
  let entries;
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const records: BundledSkillRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(skillsDir, entry.name, SKILL_BODY_FILE);
    let text: string;
    try {
      text = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const parsed = parseSkillFrontmatter(text);
    if (parsed === undefined) continue;
    records.push({ name: parsed.name, description: parsed.description, filePath });
  }
  records.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return records;
}

/**
 * Create the bundled-skill provider the host entry registers on `ctx.skills`
 * while the built-in tooling switch is enabled. `list()` reads the assets
 * directory on every call so a repaired installation recovers without a
 * host restart, and `get()` re-reads and re-parses the body so a file that
 * disappeared or broke since listing resolves to `undefined` instead of a
 * stale definition.
 */
export function createBuiltinToolingProvider(assets: BuiltinToolingAssets): SkillProvider {
  const invocation = buildCliInvocation(assets.execPath, assets.cliPath);
  return {
    name: BUILTIN_TOOLING_PROVIDER_NAME,
    async list(): Promise<readonly SkillCandidate[]> {
      const records = await listBundledSkills(assets.skillsDir);
      return records.map((record): SkillCandidate => ({
        name: record.name,
        description: record.description,
        invocation: INVOCATION,
        source: "bundled",
        provider: BUILTIN_TOOLING_PROVIDER_NAME,
        resourceBase: { kind: "directory", path: path.dirname(record.filePath) },
        rank: BUILTIN_TOOLING_RANK,
        locator: record.filePath,
      }));
    },
    async get(candidate: SkillCandidate): Promise<SkillDefinition | undefined> {
      let text: string;
      try {
        text = await readFile(String(candidate.locator), "utf8");
      } catch {
        return undefined;
      }
      const parsed = parseSkillFrontmatter(text);
      if (parsed === undefined || parsed.name !== candidate.name) return undefined;
      return {
        name: parsed.name,
        description: parsed.description,
        invocation: INVOCATION,
        source: "bundled",
        provider: BUILTIN_TOOLING_PROVIDER_NAME,
        resourceBase: { kind: "directory", path: path.dirname(String(candidate.locator)) },
        content: rewriteCliToken(parsed.body, invocation),
      };
    },
  };
}
