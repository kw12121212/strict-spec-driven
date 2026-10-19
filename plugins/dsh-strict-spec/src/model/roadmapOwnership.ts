/**
 * The archived-milestone ownership resolver: reads the roadmap archive's
 * planned-change files to list the planned changes an archived milestone
 * owns.
 *
 * The archive contract keeps archived entries unread while they are only
 * listed, so the loaded tree carries no declared facts for them; the
 * planned-change design this implements therefore resolves an archived
 * milestone's owned entries by reading the archived planned-change files
 * when — and only when — such a milestone is open. This is code reporting
 * on archived history itself, not a consumer deciding whether an active
 * dependency target is satisfied. An unreadable or unparsable archived file
 * simply contributes no entry: the milestone stays readable, exactly as an
 * unreadable tree document keeps its filename label.
 */
import { loadDocument } from "./loader.ts";
import { WORKFLOW_ROOT } from "./nodes.ts";
import { workspaceFileErrorCode } from "./port.ts";
import type { WorkspaceFilesPort } from "./port.ts";

/** The roadmap archive directory that holds archived planned-change files. */
const ARCHIVED_PLANNED_CHANGES_DIR = `${WORKFLOW_ROOT}/roadmap/archive/planned-changes`;

/** One planned change an archived milestone owns, as a listing row presents it. */
export interface OwnedPlannedChangeEntry {
  /** Workspace path of the archived planned-change file. */
  readonly path: string;
  /** The declared planned-change id, when the read file declares one. */
  readonly id?: string;
  /** The row's display label: the archived file's name, per archive labeling. */
  readonly label: string;
  /** The declared status, when the read file declares one. */
  readonly status?: string;
}

/** The ownership listing state of the open archived roadmap milestone. */
export interface MilestoneOwnershipState {
  /** `idle` when no archived milestone is open; `error` when the archive listing failed. */
  readonly status: "idle" | "loading" | "ready" | "error";
  /** The milestone id the recorded entries were resolved for. */
  readonly milestoneId?: string;
  /** The owned entries resolved from the archived planned-change files. */
  readonly owned: readonly OwnedPlannedChangeEntry[];
  /** Whether the archive listing was cut short by the host's entry cap. */
  readonly truncated: boolean;
}

/** The initial, no-open-archived-milestone ownership state. */
export function initialMilestoneOwnershipState(): MilestoneOwnershipState {
  return { status: "idle", owned: [], truncated: false };
}

/** The basename of one workspace path, mirroring the archive labeling rule. */
function basename(workspacePath: string): string {
  const parts = workspacePath.split("/");
  return parts[parts.length - 1] || workspacePath;
}

/** Reads the milestone field one parsed planned change declares, when present. */
function declaredMilestone(data: unknown): string | undefined {
  if (typeof data === "object" && data !== null && "planned_change" in data) {
    const plannedChange = (data as Record<string, unknown>).planned_change;
    if (typeof plannedChange === "object" && plannedChange !== null) {
      const milestone = (plannedChange as Record<string, unknown>).milestone;
      if (typeof milestone === "string" && milestone.trim().length > 0) {
        return milestone;
      }
    }
  }
  return undefined;
}

/** Reads the declared id and status of one parsed planned change. */
function declaredIdentity(data: unknown): { readonly id?: string; readonly status?: string } {
  const identity: { id?: string; status?: string } = {};
  if (typeof data !== "object" || data === null) {
    return identity;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.status === "string" && record.status.trim().length > 0) {
    identity.status = record.status;
  }
  const plannedChange = record.planned_change;
  if (typeof plannedChange === "object" && plannedChange !== null) {
    const id = (plannedChange as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim().length > 0) {
      identity.id = id;
    }
  }
  return identity;
}

/**
 * Resolves the planned changes an archived milestone owns: lists the roadmap
 * archive's planned-change directory, reads each file, and keeps the ones
 * whose declared milestone names the open milestone. A listing the host
 * refuses with not-found or not-directory yields no entries — an archive
 * without planned changes is an empty history, not a failure — while any
 * other listing failure reports the error state, and a file that fails to
 * read or parse contributes no entry.
 */
export async function resolveArchivedPlannedChangeOwners(
  port: WorkspaceFilesPort,
  sessionId: string,
  milestoneId: string,
): Promise<{ readonly owned: readonly OwnedPlannedChangeEntry[]; readonly truncated: boolean; readonly failed: boolean }> {
  let listing;
  try {
    listing = await port.list(sessionId, ARCHIVED_PLANNED_CHANGES_DIR);
  } catch (error) {
    const code = workspaceFileErrorCode(error);
    if (code === "workspace-file/not-found" || code === "workspace-file/not-directory" || code === "workspace-file/outside-workspace") {
      return { owned: [], truncated: false, failed: false };
    }
    return { owned: [], truncated: false, failed: true };
  }
  const owned: OwnedPlannedChangeEntry[] = [];
  for (const entry of listing.entries) {
    if (entry.type !== "file") {
      continue;
    }
    const entryPath = `${ARCHIVED_PLANNED_CHANGES_DIR}/${entry.name}`;
    const result = await loadDocument(port, sessionId, entryPath);
    if (!result.ok || result.artifactType !== "planned_change") {
      continue;
    }
    if (declaredMilestone(result.data) !== milestoneId) {
      continue;
    }
    const identity = declaredIdentity(result.data);
    owned.push({ path: entryPath, id: identity.id, label: basename(entryPath), status: identity.status });
  }
  return { owned, truncated: listing.truncated, failed: false };
}
