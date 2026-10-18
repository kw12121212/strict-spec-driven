/**
 * The document loader: reads one strict document completely and parses it
 * with the plugin's bundled YAML parser.
 *
 * A complete read prefers `readBytes` with no range — one round trip that
 * returns the whole file under the host's complete-file cap — and decodes the
 * bytes as UTF-8 itself. A byte read the cap refuses (`too-large`) falls back
 * to `read` line pages walked until eof; both paths converge on the same
 * string handed to the parser, so parse behavior never depends on which path
 * served the bytes. The result is either parsed data or a failure: a parse
 * error located by 1-based line and column, or a read error classified by the
 * workspace-files error code.
 */
import { load } from "js-yaml";
import type { DocumentLoadResult, LocatedParseError, ReadError } from "./nodes.ts";
import { workspaceFileErrorCode } from "./port.ts";
import type { WorkspaceFilesPort } from "./port.ts";
import { declaredArtifactType } from "./classifier.ts";

/** A UTF-8 decoder that refuses invalid byte sequences instead of replacing them. */
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

/** Maps one thrown js-yaml error to a parse error located by 1-based position. */
function toLocatedParseError(error: unknown): LocatedParseError {
  const mark = (error as { mark?: { line?: unknown; column?: unknown } | null } | null)?.mark;
  const line = typeof mark?.line === "number" && mark.line >= 0 ? mark.line + 1 : 1;
  const column = typeof mark?.column === "number" && mark.column >= 0 ? mark.column + 1 : 1;
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "parse", message, line, column };
}

/** Maps one thrown workspace-files error to a read error classified by code. */
function toReadError(error: unknown): ReadError {
  return { kind: "read", code: workspaceFileErrorCode(error) ?? "unknown" };
}

/**
 * Reads the complete file through paged `read` until eof. Pages carry lines
 * joined by `\n` without a terminator after the last one, so consecutive
 * pages concatenate over one newline.
 */
async function readAllPages(
  port: WorkspaceFilesPort,
  sessionId: string,
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const parts: string[] = [];
  let offset = 1;
  for (;;) {
    const page = await port.read(sessionId, path, { offset }, signal);
    if (page.lines > 0) {
      parts.push(page.text);
      offset += page.lines;
    } else if (!page.eof) {
      // A page that holds no lines and no eof would loop forever; treat the
      // walk as failed rather than hanging on a misbehaving backend.
      throw new Error("workspace read page reported neither lines nor eof");
    }
    if (page.eof) {
      return parts.length === 0 ? "" : parts.join("\n");
    }
  }
}

/**
 * Loads one strict document: reads the complete file — `readBytes` without a
 * range decoded as UTF-8, falling back to paged `read` until eof when the
 * byte read is refused as too large — and parses the text with the bundled
 * parser. Returns the parsed data with its declared artifact_type, or a
 * located parse error or classified read error.
 */
export async function loadDocument(
  port: WorkspaceFilesPort,
  sessionId: string,
  path: string,
  signal?: AbortSignal,
): Promise<DocumentLoadResult> {
  let text: string;
  try {
    const window = await port.readBytes(sessionId, path, {}, signal);
    try {
      text = utf8Decoder.decode(window.data);
    } catch {
      // The byte read carries no text gating; invalid UTF-8 surfaces here.
      return { ok: false, error: { kind: "read", code: "workspace-file/not-text" } satisfies ReadError };
    }
  } catch (byteError) {
    if (workspaceFileErrorCode(byteError) !== "workspace-file/too-large") {
      return { ok: false, error: toReadError(byteError) };
    }
    try {
      text = await readAllPages(port, sessionId, path, signal);
    } catch (pageError) {
      return { ok: false, error: toReadError(pageError) };
    }
  }
  try {
    const data = load(text);
    return { ok: true, data, artifactType: declaredArtifactType(data) };
  } catch (parseError) {
    return { ok: false, error: toLocatedParseError(parseError) };
  }
}
