import { readFileSync } from "fs";
import { dump, load, type Mark, YAMLException } from "js-yaml";

export type YamlDiagnosticDetails = {
  errorType?: string;
  reason?: string;
  line?: number;
  column?: number;
  snippet?: string;
  offendingCharacter?: string;
};

export type YamlParseDetails = YamlDiagnosticDetails & {
  errorType: string;
  source?: string;
};

function describeCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function escapeCharacterForDisplay(value: string): string {
  switch (value) {
    case "\\":
      return "\\\\";
    case "'":
      return "\\'";
    case "\0":
      return "\\0";
    case "\b":
      return "\\b";
    case "\t":
      return "\\t";
    case "\n":
      return "\\n";
    case "\v":
      return "\\v";
    case "\f":
      return "\\f";
    case "\r":
      return "\\r";
    default:
      return value;
  }
}

function describeCharacterLabel(value: string): string | null {
  switch (value) {
    case "\0":
      return "null byte";
    case "\b":
      return "backspace";
    case "\t":
      return "tab";
    case "\n":
      return "newline";
    case "\v":
      return "vertical tab";
    case "\f":
      return "form feed";
    case "\r":
      return "carriage return";
    case " ":
      return "space";
    default:
      return null;
  }
}

function describeOffendingCharacter(mark: Mark | undefined): string | undefined {
  if (!mark || typeof mark.position !== "number" || mark.position < 0 || mark.position >= mark.buffer.length) {
    return undefined;
  }

  const character = mark.buffer.slice(mark.position, mark.position + 1);
  if (!character) {
    return undefined;
  }

  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    return undefined;
  }

  const label = describeCharacterLabel(character);
  const display = escapeCharacterForDisplay(character);
  return label
    ? `'${display}' (${label}, ${describeCodePoint(codePoint)})`
    : `'${display}' (${describeCodePoint(codePoint)})`;
}

function buildYamlParseDetails(error: YAMLException, source?: string): YamlParseDetails {
  return {
    errorType: error.name || "YAMLException",
    reason: typeof error.reason === "string" ? error.reason : undefined,
    line: typeof error.mark?.line === "number" ? error.mark.line + 1 : undefined,
    column: typeof error.mark?.column === "number" ? error.mark.column + 1 : undefined,
    snippet: typeof error.mark?.snippet === "string" && error.mark.snippet.trim().length > 0 ? error.mark.snippet : undefined,
    offendingCharacter: describeOffendingCharacter(error.mark),
    source,
  };
}

function formatLocation(details: Pick<YamlParseDetails, "line" | "column">): string | undefined {
  if (typeof details.line !== "number") {
    return undefined;
  }
  if (typeof details.column !== "number") {
    return `line ${details.line}`;
  }
  return `line ${details.line}, column ${details.column}`;
}

export function formatYamlParseSummary(input: YamlParseDetails | unknown): string {
  const details = isYamlParseDetails(input) ? input : getYamlParseDetails(input);
  if (!details) {
    return input instanceof Error ? input.message : String(input);
  }

  const parts: string[] = [];
  if (details.reason) {
    parts.push(details.reason);
  } else {
    parts.push("failed to parse YAML");
  }

  const location = formatLocation(details);
  if (location) {
    parts.push(location);
  }

  if (details.offendingCharacter) {
    parts.push(`offending character ${details.offendingCharacter}`);
  }

  return parts.join("; ");
}

function formatYamlParseMessage(details: YamlParseDetails): string {
  const summary = formatYamlParseSummary(details);
  if (details.source) {
    return `${details.source}: ${summary}`;
  }
  return summary;
}

function isYamlParseDetails(value: unknown): value is YamlParseDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.errorType === "string";
}

export class YamlParseError extends Error implements YamlParseDetails {
  readonly errorType: string;
  readonly reason?: string;
  readonly line?: number;
  readonly column?: number;
  readonly snippet?: string;
  readonly offendingCharacter?: string;
  readonly source?: string;

  constructor(details: YamlParseDetails) {
    super(formatYamlParseMessage(details));
    this.name = "YamlParseError";
    this.errorType = details.errorType;
    this.reason = details.reason;
    this.line = details.line;
    this.column = details.column;
    this.snippet = details.snippet;
    this.offendingCharacter = details.offendingCharacter;
    this.source = details.source;
  }
}

export function getYamlParseDetails(error: unknown): YamlParseDetails | null {
  if (error instanceof YamlParseError) {
    return {
      errorType: error.errorType,
      reason: error.reason,
      line: error.line,
      column: error.column,
      snippet: error.snippet,
      offendingCharacter: error.offendingCharacter,
      source: error.source,
    };
  }
  if (error instanceof YAMLException) {
    return buildYamlParseDetails(error);
  }
  return null;
}

export function getYamlDiagnosticDetails(error: unknown): YamlDiagnosticDetails | null {
  const details = getYamlParseDetails(error);
  if (!details) {
    return null;
  }
  return {
    errorType: details.errorType,
    reason: details.reason,
    line: details.line,
    column: details.column,
    snippet: details.snippet,
    offendingCharacter: details.offendingCharacter,
  };
}

export function parseYamlDocument<T>(input: string, options?: { source?: string }): T {
  try {
    return load(input) as T;
  } catch (error) {
    if (error instanceof YamlParseError) {
      throw error;
    }
    if (error instanceof YAMLException) {
      throw new YamlParseError(buildYamlParseDetails(error, options?.source));
    }
    throw error;
  }
}

export function stringifyYamlDocument(value: unknown): string {
  // lineWidth -1 disables js-yaml scalar line folding so long values stay on a
  // single physical line, keeping re-serialized artifacts stable to read and diff.
  return dump(value, { lineWidth: -1 });
}

export function parseYamlFile<T>(path: string): T {
  return parseYamlDocument<T>(readFileSync(path, "utf8"), { source: path });
}
