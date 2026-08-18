import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { getAllCommandMetadata } from "./cli/command-metadata.js";
import { readYamlMutationInventoryDocument } from "./yaml-mutation-surface.js";

/**
 * The CLI-only YAML mutation policy, applied to every AI-facing surface that can describe or
 * perform a repository-owned YAML write. The policy itself is stated by the
 * `cli-owns-repository-yaml-mutations` technical standard; this module is the one place that
 * decides what violates it, so validate-skills and the maintenance check cannot drift apart.
 */

/** A named policy category. The id appears verbatim in diagnostics and findings. */
export type PolicyCategory =
  | "direct-file-edit"
  | "shell-or-heredoc-yaml-write"
  | "raw-yaml-payload"
  | "hand-edit-fallback"
  | "missing-command-mapping"
  | "undeclared-mutation-flag"
  | "unregistered-source-writer";

export type PolicyMatch = {
  /** Repository-relative path of the offending file. */
  file: string;
  /** 1-indexed line the match starts on. */
  line: number;
  category: PolicyCategory;
  /** The matched text, trimmed to keep a diagnostic readable. */
  excerpt: string;
  /** What the author should do instead. */
  replacement: string;
};

/**
 * A match that was found but deliberately not reported, kept so a false negative is diagnosable:
 * a surface that stops being flagged can be traced to the exemption that silenced it rather than
 * to a pattern someone quietly narrowed.
 */
export type PolicySuppression = PolicyMatch & { suppressedBy: string };

export type PolicyScanResult = {
  matches: PolicyMatch[];
  suppressions: PolicySuppression[];
};

const MAX_EXCERPT_LENGTH = 120;

function excerptOf(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= MAX_EXCERPT_LENGTH ? collapsed : `${collapsed.slice(0, MAX_EXCERPT_LENGTH - 1)}…`;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

/**
 * Characters that stay inside one sentence. A bare `[^.]` would also exclude the dots inside
 * `.strict-spec-driven/config.yaml`, so the guard rejects only a period that ends a sentence —
 * one followed by whitespace or a closing bracket — and lets a path's own dots through. Prose
 * wraps, so a single newline is inside the sentence and a blank line ends it; stopping at every
 * newline would read a prohibition whose "do not" sits on the previous line as an instruction.
 */
const SAME_SENTENCE = String.raw`(?:(?!\.[\s)\]])(?!\n\n)[\s\S])`;

/**
 * A surface may forbid these constructs; none may instruct one. The distinction is the direction
 * of the sentence, so each pattern targets an imperative write aimed at a YAML path rather than
 * the bare words, and `isProhibition` filters the clauses that forbid it.
 */
const FORBIDDEN_WRITE_INSTRUCTIONS: {
  category: PolicyCategory;
  label: string;
  pattern: RegExp;
  replacement: string;
}[] = [
  {
    category: "direct-file-edit",
    label: "apply_patch on YAML",
    pattern: new RegExp(String.raw`apply_patch${SAME_SENTENCE}{0,80}\.ya?ml`, "gi"),
    replacement: "invoke the artifact's owning strict CLI command with named arguments",
  },
  {
    category: "shell-or-heredoc-yaml-write",
    label: "heredoc into YAML",
    pattern: /<<\s*'?EOF'?[^\n]{0,80}\.ya?ml/gi,
    replacement: "invoke the artifact's owning strict CLI command with named arguments",
  },
  {
    category: "shell-or-heredoc-yaml-write",
    label: "shell redirect into YAML",
    pattern: /(?:cat|echo|printf)\s[^\n|]{0,80}>\s*[^\s|]*\.ya?ml/gi,
    replacement: "invoke the artifact's owning strict CLI command with named arguments",
  },
  {
    category: "hand-edit-fallback",
    label: "fallback to direct editing",
    pattern: new RegExp(
      String.raw`(?:fall\s?back|otherwise|instead)${SAME_SENTENCE}{0,60}(?:edit|write)${SAME_SENTENCE}{0,40}\.ya?ml`,
      "gi",
    ),
    replacement:
      "stop and report the missing capability; the no-direct-edit-fallback boundary allows no fallback",
  },
  {
    category: "raw-yaml-payload",
    label: "constructed payload file",
    pattern: /(?:create|write|build)\s+(?:a\s+)?(?:temporary\s+)?(?:YAML|JSON)\s+payload\s+file/gi,
    replacement: "pass the artifact's semantic values as named CLI arguments instead of a payload file",
  },
];

/**
 * A surface is expected to forbid these constructs, so a match counts only when the surrounding
 * clause is not itself a prohibition. Without this the protocol's own "do not create JSON payload
 * files" wording would be read as an instruction to create one.
 */
const NEGATION_BEFORE = new RegExp(
  String.raw`\b(?:do not|don't|never|no|without|rather than|instead of|not)\b${SAME_SENTENCE}{0,120}$`,
  "i",
);

export function isProhibition(text: string, matchIndex: number): boolean {
  return NEGATION_BEFORE.test(text.slice(sentenceStart(text, matchIndex), matchIndex));
}

/**
 * Start of the sentence containing `index`. Only a period that ends a sentence counts, so a path
 * such as `.strict-spec-driven/config.yaml` earlier in the clause does not truncate the window the
 * negation guard reads and turn a prohibition into a reported instruction. A blank line also ends
 * the window: a negation in an earlier paragraph says nothing about this one.
 */
function sentenceStart(text: string, index: number): number {
  for (let i = index - 1; i > 0; i--) {
    if (text[i - 1] === "." && /[\s)\]]/.test(text[i])) return i;
    if (text[i] === "\n" && text[i - 1] === "\n") return i;
  }
  return 0;
}

/**
 * Marker an author writes on a line that documents a human editing YAML by hand. Human manual
 * editing is outside the policy — it targets AI mutation workflows — so the marker keeps a
 * truthful note about it from reading as an instruction to the agent.
 */
export const HUMAN_MANUAL_EDIT_MARKER = "human-manual-edit";

/** Read-only lookups that appear in `cli_owners` but write nothing. */
const INVENTORY_INSPECTOR_COMMANDS = new Set(["lesson-list", "lesson-show", "lesson-status"]);

/**
 * Flags every command accepts through the shared help path rather than its own metadata entry.
 * They are not mutation arguments, so a skill naming them is not describing an undocumented write.
 */
export const GLOBAL_FLAGS = new Set(["--help", "--json"]);

export type PolicyRegistry = {
  /** CLI commands the inventory records as owning at least one cli-owned mutation operation. */
  mutatingOwnerCommands: Set<string>;
  /**
   * Source paths the inventory registers as permitted writers. The inventory records a writer in
   * either of two places — a family's `direct_write_paths` or a `mutation_surfaces` entry's
   * `path_patterns` — so both are read; taking only the first would report every CLI-owned writer
   * as unregistered.
   */
  registeredWriterPaths: Set<string>;
  /** Every artifact kind the inventory registers, so guidance can be checked against real kinds. */
  artifactKinds: Set<string>;
  /** The validation command each artifact kind declares, without the CLI prefix. */
  validationCommandByKind: Map<string, string>;
  /** Every flag the command metadata registry declares, as `--flag`. */
  declaredFlags: Set<string>;
  /** Flags declared per command, so a prose flag is checked against the command it names. */
  declaredFlagsByCommand: Map<string, Set<string>>;
};

let cachedRegistry: PolicyRegistry | undefined;

/**
 * Derives the policy's reference sets from the checked-in mutation inventory and the command
 * metadata registry. Both are independent of the guidance text the policy governs, so deleting a
 * skill's protocol section cannot reclassify it as exempt.
 */
export function loadPolicyRegistry(): PolicyRegistry {
  if (cachedRegistry !== undefined) return cachedRegistry;

  const inventory = readYamlMutationInventoryDocument();
  const families = (inventory.artifact_families ?? {}) as Record<
    string,
    {
      operations?: Record<string, string>;
      cli_owners?: string[];
      direct_write_paths?: string[];
      validation_command?: string;
    }
  >;

  const mutatingOwnerCommands = new Set<string>();
  const registeredWriterPaths = new Set<string>();
  const artifactKinds = new Set(Object.keys(families));
  const validationCommandByKind = new Map<string, string>();
  for (const [kind, family] of Object.entries(families)) {
    const operations = family.operations ?? {};
    const hasCliOwnedOperation = ["create", "update", "named_remove", "delete"].some(
      (operation) => operations[operation] === "cli-owned",
    );
    for (const writerPath of family.direct_write_paths ?? []) {
      registeredWriterPaths.add(writerPath);
    }
    if (family.validation_command) validationCommandByKind.set(kind, family.validation_command);
    if (!hasCliOwnedOperation) continue;
    for (const owner of family.cli_owners ?? []) {
      if (!INVENTORY_INSPECTOR_COMMANDS.has(owner)) mutatingOwnerCommands.add(owner);
    }
  }

  const mutationSurfaces = (inventory.mutation_surfaces ?? {}) as Record<string, { path_patterns?: string[] }>;
  for (const surface of Object.values(mutationSurfaces)) {
    for (const pattern of surface.path_patterns ?? []) {
      registeredWriterPaths.add(pattern);
    }
  }

  const declaredFlags = new Set<string>();
  const declaredFlagsByCommand = new Map<string, Set<string>>();
  for (const metadata of getAllCommandMetadata()) {
    const perCommand = new Set<string>();
    for (const flag of metadata.flags) {
      declaredFlags.add(flag.name);
      perCommand.add(flag.name);
    }
    declaredFlagsByCommand.set(metadata.name, perCommand);
  }

  cachedRegistry = {
    mutatingOwnerCommands,
    registeredWriterPaths,
    artifactKinds,
    validationCommandByKind,
    declaredFlags,
    declaredFlagsByCommand,
  };
  return cachedRegistry;
}

/** Clears the memoized registry so a test can observe a changed inventory. */
export function resetPolicyRegistryCache(): void {
  cachedRegistry = undefined;
}

/** The heading that delimits a skill's authoring-protocol section, shared by every check on it. */
export const AUTHORING_PROTOCOL_HEADING = "## CLI-Only YAML Authoring Protocol";

/**
 * The protocol section names owning commands, so classifying from the whole file would be
 * circular: deleting the section could drop a skill's only command mention and reclassify it as
 * read-only. Membership is decided from the body with the section removed.
 */
export function bodyWithoutProtocolSection(skillText: string): string {
  const start = skillText.indexOf(AUTHORING_PROTOCOL_HEADING);
  if (start === -1) return skillText;
  const next = skillText.indexOf("\n## ", start + AUTHORING_PROTOCOL_HEADING.length);
  return skillText.slice(0, start) + (next === -1 ? "" : skillText.slice(next + 1));
}

/**
 * migrate creates `.strict-spec-driven/` YAML but the inventory registers it only against
 * legacy-migration-input, the one family it reads rather than writes.
 */
const MUTATION_CAPABLE_EXCEPTIONS = new Set(["strict-spec-migrate"]);

/** Whether a bundled skill directs a repository-owned YAML mutation, decided from the inventory. */
export function isMutationCapableSkill(skillName: string, skillText: string): boolean {
  if (MUTATION_CAPABLE_EXCEPTIONS.has(skillName)) return true;
  const body = bodyWithoutProtocolSection(skillText);
  const { mutatingOwnerCommands } = loadPolicyRegistry();
  return [...mutatingOwnerCommands].some((command) =>
    new RegExp(`strict-spec-cli\\s+${command}(?![a-z0-9-])`).test(body),
  );
}

function lineContainsExemption(text: string, matchIndex: number): string | undefined {
  const lineStart = text.lastIndexOf("\n", matchIndex) + 1;
  const lineEndRaw = text.indexOf("\n", matchIndex);
  const line = text.slice(lineStart, lineEndRaw === -1 ? text.length : lineEndRaw);
  if (line.includes(HUMAN_MANUAL_EDIT_MARKER)) return `${HUMAN_MANUAL_EDIT_MARKER} marker`;
  return undefined;
}

/**
 * Scans prose for instructions that mutate repository-owned YAML outside the CLI. Suppressions are
 * returned rather than dropped, so an exemption that hides a real violation stays visible.
 */
export function scanTextForPolicyViolations(file: string, text: string): PolicyScanResult {
  const matches: PolicyMatch[] = [];
  const suppressions: PolicySuppression[] = [];

  for (const { category, pattern, replacement } of FORBIDDEN_WRITE_INSTRUCTIONS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const found: PolicyMatch = {
        file,
        line: lineOf(text, match.index),
        category,
        excerpt: excerptOf(match[0]),
        replacement,
      };
      if (isProhibition(text, match.index)) {
        suppressions.push({ ...found, suppressedBy: "clause forbids the construct rather than instructing it" });
        continue;
      }
      const exemption = lineContainsExemption(text, match.index);
      if (exemption !== undefined) {
        suppressions.push({ ...found, suppressedBy: exemption });
        continue;
      }
      // Two patterns can describe the same construct — a heredoc is also a shell redirect — and one
      // location deserves one finding, so a repeat at the same line and category is dropped.
      if (matches.some((existing) => existing.line === found.line && existing.category === found.category)) continue;
      matches.push(found);
    }
  }

  return { matches, suppressions };
}

/**
 * An invocation's arguments may wrap, so a continuation line that begins with a flag is folded
 * back onto its invocation. Without the fold the scan would either stop at the line break and miss
 * the wrapped flags, or run past it and attribute one command's flags to an unrelated command
 * mentioned earlier.
 */
function foldWrappedInvocations(text: string): string {
  return text.replace(/\n[ \t]*(--[a-z])/g, " $1");
}

/** Flags a mutation-capable skill names in prose, as `--flag`, paired with the command they follow. */
export function findProseMutationFlags(text: string): { command: string; flag: string; index: number }[] {
  const found: { command: string; flag: string; index: number }[] = [];
  const folded = foldWrappedInvocations(text);
  const invocation = /strict-spec-cli[^\S\n]+([a-z][a-z0-9-]*)((?:[^\S\n]+(?:--[a-z][a-z0-9-]*|[^\s`]+))*)/g;
  for (const match of folded.matchAll(invocation)) {
    if (match.index === undefined) continue;
    const command = match[1];
    for (const flagMatch of (match[2] ?? "").matchAll(/--[a-z][a-z0-9-]*/g)) {
      if (GLOBAL_FLAGS.has(flagMatch[0])) continue;
      found.push({ command, flag: flagMatch[0], index: match.index });
    }
  }
  return found;
}

/**
 * Repository-owned YAML write calls in a source file. The policy is about writing YAML, so the
 * scan looks for a write whose target is a YAML path or a YAML serializer result rather than for
 * filesystem calls in general.
 */
const SOURCE_YAML_WRITE_PATTERN = /writeFileSync\s*\([^)]{0,200}?(?:\.ya?ml|stringifyYamlDocument)/gs;

/**
 * Reports source modules that write repository-owned YAML without being registered in the mutation
 * inventory's `direct_write_paths`. Registration — not the shape of the call — is the gate: a
 * registered writer and a bypass use identical filesystem primitives, so only the inventory can
 * tell them apart, and the inventory's own staleness check keeps the allowlist honest.
 */
export function scanSourceForUnregisteredWriters(rootDir: string, relativeDir: string): PolicyScanResult {
  const matches: PolicyMatch[] = [];
  const suppressions: PolicySuppression[] = [];
  const { registeredWriterPaths } = loadPolicyRegistry();

  for (const relativeFile of listTypeScriptSources(rootDir, relativeDir)) {
    const absolute = path.join(rootDir, relativeFile);
    let text: string;
    try {
      text = readFileSync(absolute, "utf8");
    } catch {
      continue;
    }

    SOURCE_YAML_WRITE_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(SOURCE_YAML_WRITE_PATTERN)) {
      if (match.index === undefined) continue;
      const found: PolicyMatch = {
        file: relativeFile,
        line: lineOf(text, match.index),
        category: "unregistered-source-writer",
        excerpt: excerptOf(match[0]),
        replacement: `route the write through the artifact's CLI mutation command, or register ${relativeFile} under the owning family's direct_write_paths in inventory/yaml-mutation-surfaces.yaml`,
      };
      if (registeredWriterPaths.has(relativeFile)) {
        suppressions.push({ ...found, suppressedBy: "registered in inventory direct_write_paths" });
        continue;
      }
      matches.push(found);
    }
  }

  return { matches, suppressions };
}

function listTypeScriptSources(rootDir: string, relativeDir: string): string[] {
  const absolute = path.join(rootDir, relativeDir);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return [];

  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relativeEntry = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptSources(rootDir, relativeEntry));
      continue;
    }
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) files.push(relativeEntry);
  }
  return files;
}

/** Directories whose contents are outside the policy, with the reason each one is exempt. */
export const EXEMPT_PATH_PREFIXES: { prefix: string; reason: string }[] = [
  { prefix: "test/fixtures/", reason: "intentionally invalid test fixture" },
  { prefix: "dist/", reason: "compiled output" },
  { prefix: "node_modules/", reason: "external dependency" },
  { prefix: ".strict-spec-driven/changes/archive/", reason: "archived change, kept as historical record" },
];

export function exemptPathReason(relativeFile: string): string | undefined {
  const posixPath = relativeFile.split(path.sep).join("/");
  return EXEMPT_PATH_PREFIXES.find((entry) => posixPath.startsWith(entry.prefix))?.reason;
}

/** Generated documents are rendered, never hand-authored, so their text is not a policy surface. */
export const GENERATED_DOCUMENT_BANNER = "Generated file — do not edit by hand.";

export function isGeneratedDocument(text: string): boolean {
  return text.slice(0, 400).includes(GENERATED_DOCUMENT_BANNER);
}
