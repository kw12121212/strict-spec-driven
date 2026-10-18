/**
 * The workspace-files port: the only seam the discovery model uses to reach
 * the Session workspace.
 *
 * The interface mirrors the wire contract of the pinned dsh release's
 * `remote.workspaceFiles` namespace — every method takes the sessionId first,
 * because the Host derives the workspace root from it; `list` speaks
 * workspace-relative paths and reports direct children only, cut to the entry
 * cap with a `truncated` flag and no paging; `readBytes` without a range
 * returns the complete file under the complete-file cap; and `changes` yields
 * watch frames for one file or one directory's direct entries and is not
 * recursive. Expressing that seam as a plugin-owned interface keeps every
 * model module free of dsh imports, so the whole model runs under
 * `bun test/run.ts` against a scripted fake while the client passes the real
 * remote face through `createRemotePort` unchanged.
 */

/** One direct child of a listed workspace directory, as the wire reports it. */
export interface DirectoryEntry {
  /** Basename inside the listed directory. */
  readonly name: string;
  /** What the child resolves to: file, directory, or anything else. */
  readonly type: "file" | "directory" | "other";
  /** Byte size, present only for a regular file whose backend reports it. */
  readonly size?: number;
}

/** Direct children of one workspace directory, cut to the host entry cap. */
export interface DirectoryListing {
  /** The listed directory as a workspace-relative path; empty for the root. */
  readonly path: string;
  /** Direct children in the backend's stable name order. */
  readonly entries: readonly DirectoryEntry[];
  /** Whether the entry cap dropped children from `entries`; list has no paging. */
  readonly truncated: boolean;
}

/** One page of a workspace text file: lines joined by `\n`, 1-based offset. */
export interface TextPage {
  /** First line of the page, as requested. */
  readonly offset: number;
  /** The page's lines joined by `\n`, without a terminator after the last one. */
  readonly text: string;
  /** How many lines the page holds. */
  readonly lines: number;
  /** Whether the page includes the file's last line. */
  readonly eof: boolean;
}

/** One byte window of a workspace file; `data` holds the read bytes raw. */
export interface ByteWindow {
  /** First byte of the window, as requested. */
  readonly offset: number;
  /** Native file bytes; the complete file when no range was requested. */
  readonly data: Uint8Array;
  /** Whether the window includes the file's last byte. */
  readonly eof: boolean;
}

/** A filesystem invalidation of one watched target, as the wire reports it. */
export type FileChange =
  | { readonly absolutePath: string; readonly version: string }
  | { readonly absolutePath: string; readonly absent: true };

/** One frame of a watch generation: readiness, then invalidations. */
export type WatchFrame =
  | { readonly kind: "ready" }
  | { readonly kind: "change"; readonly change: FileChange };

/** A line window one `read` may request. */
export interface TextRange {
  readonly offset?: number;
  readonly limit?: number;
}

/** A byte window one `readBytes` may request. */
export interface ByteRange {
  readonly offset?: number;
  readonly length?: number;
}

/** Target resolution and optional byte range for one binary read. */
export interface ByteReadOptions {
  readonly range?: ByteRange;
}

/**
 * The `workspaceFiles` methods the discovery model calls, each taking the
 * sessionId first and naming files by workspace-relative paths.
 */
export interface WorkspaceFilesPort {
  /** List the direct children of one workspace directory. */
  list(sessionId: string, path: string, signal?: AbortSignal): Promise<DirectoryListing>;
  /** Read one page of lines from a workspace text file. */
  read(sessionId: string, path: string, range?: TextRange, signal?: AbortSignal): Promise<TextPage>;
  /** Read a byte window, or the complete file when no range is given. */
  readBytes(sessionId: string, path: string, options?: ByteReadOptions, signal?: AbortSignal): Promise<ByteWindow>;
  /** Watch one file or one directory's direct entries; not recursive. */
  changes(sessionId: string, path: string, signal?: AbortSignal): AsyncIterable<WatchFrame>;
}

/**
 * The wire's result envelope, mirrored structurally: every generated
 * workspace-files method resolves to ok-with-value or fails-with-error, and
 * the Remote face folds carrier failures into the error branch, so the port
 * adapter unwraps instead of catching.
 */
export type RemoteOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code?: string; readonly message?: string } };

/**
 * The structural slice of the generated client remote the port adapts. The
 * shapes are the wire's own — `read`'s range and `readBytes`' options are
 * required objects on the wire, where the host dereferences them without a
 * guard, and every method resolves the wire's result envelope — so a real
 * `ctx.remote` satisfies them without any dsh import in this module.
 */
export interface RemoteWorkspaceFilesFace {
  readonly workspaceFiles: {
    list(sessionId: string, path: string, signal?: AbortSignal): Promise<RemoteOutcome<DirectoryListing>>;
    read(sessionId: string, path: string, range: TextRange, signal?: AbortSignal): Promise<RemoteOutcome<TextPage>>;
    readBytes(sessionId: string, path: string, options: ByteReadOptions, signal?: AbortSignal): Promise<RemoteOutcome<ByteWindow>>;
    changes(sessionId: string, path: string, signal?: AbortSignal): AsyncIterable<WatchFrame>;
  };
}

/**
 * Unwraps one wire outcome: the ok branch's value resolves, the error
 * branch's failure throws carrying its code, which is what
 * workspaceFileErrorCode reads. Only assembly faults reject on the wire
 * itself, and those keep their own throw shape.
 */
function unwrapOutcome<T>(outcome: RemoteOutcome<T>): T {
  if (outcome.ok) {
    return outcome.value;
  }
  throw outcome.error;
}

/**
 * Adapts the generated client remote face to the model's port, normalizing
 * omitted option objects to the empty objects the wire requires and the
 * wire's result envelope to plain values and thrown failures: a call that
 * passes no range or options still reaches the host as `{}`, never as
 * `undefined`, and a failed call rejects with the failure the model's
 * error-code reader expects.
 */
export function createRemotePort(remote: RemoteWorkspaceFilesFace): WorkspaceFilesPort {
  return {
    list: async (sessionId, path, signal) => unwrapOutcome(await remote.workspaceFiles.list(sessionId, path, signal)),
    read: async (sessionId, path, range, signal) => unwrapOutcome(await remote.workspaceFiles.read(sessionId, path, range ?? {}, signal)),
    readBytes: async (sessionId, path, options, signal) => unwrapOutcome(await remote.workspaceFiles.readBytes(sessionId, path, options ?? {}, signal)),
    changes: (sessionId, path, signal) => remote.workspaceFiles.changes(sessionId, path, signal),
  };
}

/**
 * The error code of a failed workspace-files call, when the thrown error
 * carries one. Callers branch on the code — `not-found`, `outside-workspace`,
 * `watch-unsupported`, `too-large`, `not-text`, `not-regular-file`,
 * `not-directory` — never on message text.
 */
export function workspaceFileErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) {
      return code;
    }
  }
  return undefined;
}
