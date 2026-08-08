import { parseYamlDocument } from "../../yaml.js";

export type RequirementStrength = "MUST" | "SHOULD" | "MAY";

export type ScenarioStepKind = "GIVEN" | "WHEN" | "THEN" | "AND";

export type StrictScenarioStep = Partial<Record<ScenarioStepKind, string>> & Record<string, string>;

export type StrictScenarios = Record<string, StrictScenarioStep[]>;

export type StrictRequirements = Record<string, {
  strength: RequirementStrength;
  statement: string;
  scenarios: StrictScenarios;
}>;

export type StrictRequirement = {
  id: string;
  strength: RequirementStrength;
  statement: string;
  scenarios: StrictScenarios;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asObject(value: unknown, description: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${description} must be a YAML mapping`);
  }
  return value;
}

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function toKebabCase(value: string): string {
  const collapsed = value
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return collapsed.length > 0 ? collapsed : "item";
}

export function makeUniqueId(baseId: string, usedIds: Set<string>): string {
  let candidate = baseId;
  let sequence = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${sequence}`;
    sequence += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

export function extractMarkdownFrontmatter(content: string): {
  frontmatter: Record<string, unknown> | null;
  body: string;
} {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: null, body: normalized };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    throw new Error("frontmatter is missing a closing '---' line");
  }

  const frontmatter = parseYamlDocument<unknown>(normalized.slice(4, endIndex));
  if (!isRecord(frontmatter)) {
    throw new Error("frontmatter must decode to a YAML mapping");
  }

  return {
    frontmatter,
    body: normalized.slice(endIndex + "\n---\n".length),
  };
}

export function parseRequirementStrength(statement: string, context: string): RequirementStrength {
  const match = statement.match(/\b(MUST|SHOULD|MAY)\b/);
  if (!match) {
    throw new Error(`${context} is missing an RFC 2119 keyword (MUST/SHOULD/MAY)`);
  }
  return match[1] as RequirementStrength;
}

export function extractMarkdownSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      if (currentHeading) {
        sections.set(currentHeading, currentLines.join("\n"));
      }
      currentHeading = headingMatch[1].trim();
      currentLines = [];
      continue;
    }

    if (currentHeading) {
      currentLines.push(line);
    }
  }

  if (currentHeading) {
    sections.set(currentHeading, currentLines.join("\n"));
  }

  return sections;
}

export function extractMarkdownHeading(content: string): string | null {
  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    const headingMatch = line.match(/^# (.+)$/);
    if (headingMatch) {
      return normalizeWhitespace(headingMatch[1]);
    }
  }
  return null;
}

export function splitFirstSentence(text: string): { first: string; rest: string } {
  const normalized = normalizeWhitespace(text);
  const sentenceBreaks = [". ", " — ", ": "];
  for (const marker of sentenceBreaks) {
    const index = normalized.indexOf(marker);
    if (index !== -1) {
      return {
        first: normalized.slice(0, index + (marker === ". " ? 1 : 0)).trim(),
        rest: normalized.slice(index + marker.length).trim(),
      };
    }
  }
  return {
    first: normalized,
    rest: "",
  };
}

export function parseMarkdownItems(
  sectionText: string,
  mode: "list" | "approach" = "list",
): string[] {
  const items: string[] = [];
  let current = "";
  let currentKind: "ordered" | "bullet" | "paragraph" | null = null;

  function flushCurrent(): void {
    const normalized = normalizeWhitespace(current);
    if (normalized.length > 0) {
      items.push(normalized);
    }
    current = "";
    currentKind = null;
  }

  for (const rawLine of sectionText.split("\n")) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith("<!--")) {
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (mode === "approach" && orderedMatch) {
      flushCurrent();
      current = orderedMatch[1];
      currentKind = "ordered";
      continue;
    }

    const bulletMatch = trimmed.match(/^- (.+)$/);
    if (bulletMatch) {
      if (mode === "approach" && currentKind === "ordered") {
        current = `${current} ${bulletMatch[1]}`.trim();
        continue;
      }
      flushCurrent();
      current = bulletMatch[1];
      currentKind = "bullet";
      continue;
    }

    if (!current) {
      current = trimmed;
      currentKind = "paragraph";
      continue;
    }

    current = `${current} ${trimmed}`.trim();
  }

  flushCurrent();
  return items;
}

export function parseScopeItems(sectionText: string): { inScope: string[]; outOfScope: string[] } {
  const inScope: string[] = [];
  const outOfScope: string[] = [];
  let currentTarget: "in" | "out" | null = null;
  let currentItem = "";

  function flushCurrent(): void {
    const normalized = normalizeWhitespace(currentItem);
    if (normalized.length === 0 || !currentTarget) {
      currentItem = "";
      return;
    }
    if (currentTarget === "in") {
      inScope.push(normalized);
    } else {
      outOfScope.push(normalized);
    }
    currentItem = "";
  }

  for (const rawLine of sectionText.split("\n")) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith("<!--")) {
      continue;
    }
    if (trimmed === "In scope:") {
      flushCurrent();
      currentTarget = "in";
      continue;
    }
    if (trimmed === "Out of scope:") {
      flushCurrent();
      currentTarget = "out";
      continue;
    }
    if (!currentTarget) {
      continue;
    }
    if (trimmed.startsWith("- ")) {
      flushCurrent();
      currentItem = trimmed.slice(2);
      continue;
    }
    currentItem = `${currentItem} ${trimmed}`.trim();
  }

  flushCurrent();
  return { inScope, outOfScope };
}

export function extractBacktickCommand(text: string): string | undefined {
  const match = text.match(/`([^`]+)`/);
  return match ? match[1].trim() : undefined;
}
