const ROADMAP_INDEX_SCHEMA_FILE = "templates/strict-spec-driven/schemas/roadmap-index.yaml";
const ROADMAP_MILESTONE_SCHEMA_FILE = "templates/strict-spec-driven/schemas/roadmap-milestone.yaml";
const SPEC_INDEX_SCHEMA_FILE = "templates/strict-spec-driven/schemas/spec-index.yaml";
const STRICT_WORKFLOW_DIR = ".strict-spec-driven";

const DECLARED_ROADMAP_STATUSES = ["proposed", "active", "blocked", "complete"] as const;
type DeclaredRoadmapStatus = (typeof DECLARED_ROADMAP_STATUSES)[number];
type DeclaredPlannedChangeStatus = "planned" | "complete";

type StrictRoadmapIndexEntry = {
  title: string;
  path: string;
  status: DeclaredRoadmapStatus;
};

export type StrictRoadmapIndexArtifact = {
  schema: "strict-spec-driven/roadmap-index/v2";
  schema_version: 2;
  artifact_type: "roadmap_index";
  schema_file: string;
  milestones: Record<string, StrictRoadmapIndexEntry>;
};

type StrictPlannedChangeEntry = {
  status: DeclaredPlannedChangeStatus;
  summary: string;
  details: string;
  depends_on: string[];
};

export type StrictRoadmapMilestoneArtifact = {
  schema: "strict-spec-driven/roadmap-milestone/v2";
  schema_version: 2;
  artifact_type: "roadmap_milestone";
  schema_file: string;
  milestone: Record<string, { title: string }>;
  goal: string;
  scope: { in: string[]; out: string[] };
  done_criteria: string[];
  planned_changes: Record<string, StrictPlannedChangeEntry>;
  dependencies: string[];
  risks: string[];
  status: DeclaredRoadmapStatus;
  notes: string[];
  details?: string;
};

export type StrictSpecsIndexArtifact = {
  schema: "strict-spec-driven/spec-index/v1";
  schema_version: 1;
  artifact_type: "spec_index";
  schema_file: string;
  specs: Array<{ id: string; title: string; path: string }>;
};

export type ConversionSuccess<T> = { ok: true; artifact: T };
export type ConversionFailure = { ok: false; reason: string; recommendation: string };
export type ConversionResult<T> = ConversionSuccess<T> | ConversionFailure;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toKebabCase(value: string): string {
  const collapsed = value
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return collapsed.length > 0 ? collapsed : "item";
}

function extractMarkdownHeading(content: string): string | null {
  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    const match = line.match(/^# (.+)$/);
    if (match) {
      return normalizeWhitespace(match[1]);
    }
  }
  return null;
}

function extractMarkdownSections(content: string): Map<string, string> {
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

function parseMarkdownBulletList(sectionText: string): string[] {
  const items: string[] = [];
  let current = "";

  for (const rawLine of sectionText.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("<!--")) {
      continue;
    }
    const bulletMatch = trimmed.match(/^- (.+)$/);
    if (bulletMatch) {
      if (current) {
        items.push(normalizeWhitespace(current));
      }
      current = bulletMatch[1];
      continue;
    }
    if (current) {
      current = `${current} ${trimmed}`.trim();
    }
  }

  if (current) {
    items.push(normalizeWhitespace(current));
  }

  return items;
}

function parseSectionText(sectionText: string): string {
  return normalizeWhitespace(
    sectionText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("<!--"))
      .join(" "),
  );
}

function normalizeDeclaredRoadmapStatus(raw: string): DeclaredRoadmapStatus {
  const normalized = raw.trim().toLowerCase();
  if ((DECLARED_ROADMAP_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as DeclaredRoadmapStatus;
  }
  return "proposed";
}

function parsePlannedChangeEntries(sectionText: string): Record<string, StrictPlannedChangeEntry> {
  const entries: Record<string, StrictPlannedChangeEntry> = {};

  for (const rawLine of sectionText.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("<!--")) {
      continue;
    }
    const match = trimmed.match(/^- `([^`]+)` - Declared: (\w+) - (.+)$/);
    if (!match) {
      continue;
    }
    const [, id, rawStatus, summary] = match;
    const declaredStatus: DeclaredPlannedChangeStatus = rawStatus === "complete" ? "complete" : "planned";
    entries[id.trim()] = {
      status: declaredStatus,
      summary: normalizeWhitespace(summary),
      details: "Migration placeholder: add technical and design context for this planned change.",
      depends_on: [],
    };
  }

  return entries;
}

function parseDeclaredStatusFromSection(sectionText: string): DeclaredRoadmapStatus | null {
  for (const rawLine of sectionText.split("\n")) {
    const trimmed = rawLine.trim();
    const match = trimmed.match(/^- Declared:\s*(.+)$/);
    if (match) {
      return normalizeDeclaredRoadmapStatus(match[1]);
    }
  }
  return null;
}

function toFourDigitId(id: string): string {
  const match = id.match(/^(\d+)-/);
  if (!match) return id;
  const digits = match[1].padStart(4, "0");
  return `${digits}${id.slice(match[1].length)}`;
}

export function convertRoadmapIndex(markdown: string): ConversionResult<StrictRoadmapIndexArtifact> {
  try {
    const sections = extractMarkdownSections(markdown);
    const milestonesText = sections.get("Milestones") ?? "";
    const milestones: Record<string, StrictRoadmapIndexEntry> = {};

    for (const rawLine of milestonesText.split("\n")) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("<!--")) {
        continue;
      }
      const match = trimmed.match(/^- \[([^\]]+)\]\(([^)]+)\) - (.+) - (\w+)$/);
      if (!match) {
        continue;
      }
      const [, linkText, href, title, rawStatus] = match;
      const rawId = linkText.trim().replace(/\.md$/i, "");
      const id = toFourDigitId(rawId);
      const strictPath = `roadmap/${href.trim().replace(/\.md$/i, ".yaml")}`.replace(/milestones\/\d+-/, (match) => match.replace(/\d+/, (digits) => digits.padStart(4, "0")));
      const status = normalizeDeclaredRoadmapStatus(rawStatus);
      milestones[id] = {
        title: normalizeWhitespace(title),
        path: strictPath,
        status,
      };
    }

    return {
      ok: true,
      artifact: {
        schema: "strict-spec-driven/roadmap-index/v2",
        schema_version: 2,
        artifact_type: "roadmap_index",
        schema_file: ROADMAP_INDEX_SCHEMA_FILE,
        milestones,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `Legacy roadmap index uses an unsupported Markdown shape: ${message}`,
      recommendation:
        "Review the roadmap INDEX.md structure and ensure the ## Milestones section contains valid link-list entries before treating the migration as complete.",
    };
  }
}

export function convertRoadmapMilestone(
  markdown: string,
  filename: string,
): ConversionResult<StrictRoadmapMilestoneArtifact> {
  try {
    const rawId = filename.replace(/\.md$/i, "");
    const id = toFourDigitId(rawId);
    const title = extractMarkdownHeading(markdown);
    if (!title) {
      return {
        ok: false,
        reason: `Milestone '${filename}' is missing a top-level '# <title>' heading.`,
        recommendation:
          "Add a top-level heading to the milestone file and ensure all required sections are present before migrating.",
      };
    }

    const sections = extractMarkdownSections(markdown);

    const goalText = sections.get("Goal");
    if (!goalText) {
      return {
        ok: false,
        reason: `Milestone '${filename}' is missing a required '## Goal' section.`,
        recommendation:
          "Add a '## Goal' section describing the milestone objective and rerun migration.",
      };
    }
    const goal = parseSectionText(goalText);
    if (!goal) {
      return {
        ok: false,
        reason: `Milestone '${filename}' has an empty '## Goal' section.`,
        recommendation:
          "Provide a goal description in the '## Goal' section and rerun migration.",
      };
    }

    const statusText = sections.get("Status");
    if (!statusText) {
      return {
        ok: false,
        reason: `Milestone '${filename}' is missing a required '## Status' section.`,
        recommendation:
          "Add a '## Status' section with a '- Declared: <status>' line and rerun migration.",
      };
    }
    const declaredStatus = parseDeclaredStatusFromSection(statusText);
    if (declaredStatus === null) {
      return {
        ok: false,
        reason: `Milestone '${filename}' has a '## Status' section with no recognizable '- Declared: <status>' line.`,
        recommendation:
          "Add a '- Declared: <proposed|active|blocked|complete>' line to the Status section and rerun migration.",
      };
    }

    const scopeIn = parseMarkdownBulletList(sections.get("In Scope") ?? "");
    const scopeOut = parseMarkdownBulletList(sections.get("Out of Scope") ?? "");
    const doneCriteria = parseMarkdownBulletList(sections.get("Done Criteria") ?? "");
    const plannedChanges = parsePlannedChangeEntries(sections.get("Planned Changes") ?? "");
    const dependencies = parseMarkdownBulletList(sections.get("Dependencies") ?? "");
    const risks = parseMarkdownBulletList(sections.get("Risks") ?? "");
    const notes = parseMarkdownBulletList(sections.get("Notes") ?? "");
    const detailsText = parseSectionText(sections.get("Details") ?? "");

    const milestoneKeyed: Record<string, { title: string }> = {};
    milestoneKeyed[id] = { title };

    return {
      ok: true,
      artifact: {
        schema: "strict-spec-driven/roadmap-milestone/v2",
        schema_version: 2,
        artifact_type: "roadmap_milestone",
        schema_file: ROADMAP_MILESTONE_SCHEMA_FILE,
        milestone: milestoneKeyed,
        goal,
        scope: { in: scopeIn, out: scopeOut },
        done_criteria: doneCriteria,
        planned_changes: plannedChanges,
        dependencies,
        risks,
        status: declaredStatus,
        notes,
        ...(detailsText ? { details: detailsText } : {}),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `Milestone '${filename}' uses an unsupported Markdown shape: ${message}`,
      recommendation:
        "Review the milestone file structure and ensure all required sections are present before treating the migration as complete.",
    };
  }
}

export function convertSpecsIndex(markdown: string): ConversionResult<StrictSpecsIndexArtifact> {
  try {
    const specs: Array<{ id: string; title: string; path: string }> = [];

    for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("<!--") || trimmed.startsWith("#")) {
        continue;
      }
      const match = trimmed.match(/^- \[([^\]]+)\]\(([^)]+)\) - (.+)$/);
      if (!match) {
        continue;
      }
      const [, , href, title] = match;
      const hrefNorm = href.trim();
      const id = toKebabCase(hrefNorm.replace(/\.md$/i, "").replace(/\//g, "-"));
      const strictPath = `${STRICT_WORKFLOW_DIR}/specs/${hrefNorm.replace(/\.md$/i, ".yaml")}`;
      specs.push({ id, title: normalizeWhitespace(title), path: strictPath });
    }

    return {
      ok: true,
      artifact: {
        schema: "strict-spec-driven/spec-index/v1",
        schema_version: 1,
        artifact_type: "spec_index",
        schema_file: SPEC_INDEX_SCHEMA_FILE,
        specs,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `Legacy specs index uses an unsupported Markdown shape: ${message}`,
      recommendation:
        "Review the specs INDEX.md structure and ensure entries follow the '- [path.md](path.md) - Title' format before treating the migration as complete.",
    };
  }
}
