/**
 * The dsh plugin discovery model suite: exercises the read-only model —
 * traversal, classifier, label deriver, document loader, and refresh
 * coordinator — against a scripted workspace-files fake and against a
 * snapshot of this repository's real .strict-spec-driven/ directory.
 *
 * The scripted fake reproduces the pinned dsh wire contract the port
 * mirrors: direct-children listings with a truncated flag and no paging,
 * complete-file byte reads, line pages, and non-recursive per-target watch
 * streams that reject on abort. Every case runs without a dsh host, per the
 * plugin client conventions.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { ROOT, TestContext } from "../support/harness.js";
import type { ByteWindow, DirectoryEntry, DirectoryListing, TextPage, WatchFrame, WorkspaceFilesPort } from "../../plugins/dsh-strict-spec/src/model/port.ts";
import { createRemotePort, workspaceFileErrorCode } from "../../plugins/dsh-strict-spec/src/model/port.ts";
import { FAMILY_ORDER } from "../../plugins/dsh-strict-spec/src/model/nodes.ts";
import type { DocumentNode, TreeState } from "../../plugins/dsh-strict-spec/src/model/nodes.ts";
import { createViewerStores } from "../../plugins/dsh-strict-spec/src/model/store.ts";
import type { ViewerStores } from "../../plugins/dsh-strict-spec/src/model/store.ts";
import { parentDirectory, taskCompletion } from "../../plugins/dsh-strict-spec/src/model/taskCompletion.ts";
import { createTabSurfaces } from "../../plugins/dsh-strict-spec/src/model/tab.ts";
import {
  computePickerCatalog,
  createPageController,
  createPageSelectionStore,
  createSessionCatalogPort,
  resolveShownSession,
} from "../../plugins/dsh-strict-spec/src/model/picker.ts";
import type { SessionsListSnapshot, WorkspacesListSnapshot } from "../../plugins/dsh-strict-spec/src/model/picker.ts";

const SESSION_ID = "session-model-test";
const WORKFLOW_ROOT = ".strict-spec-driven";

/** Seeds the minimal workspace the page-controller cases drive. */
function seedPickerControllerWorkspace(fake: FakeWorkspaceFiles): void {
  fake.writeFile(`${WORKFLOW_ROOT}/config.yaml`, "schema: strict-spec-driven/config/v1\nartifact_type: workflow_config\n");
  fake.writeFile(`${WORKFLOW_ROOT}/specs/INDEX.yaml`, "artifact_type: spec_index\n");
}

/**
 * Wraps the fake's port so one Session's first workflow-root listing blocks
 * until released, making a stale load deterministically slower than the
 * active one.
 */
function createGatedPort(fake: FakeWorkspaceFiles, sessionId: string): { port: WorkspaceFilesPort; fake: FakeWorkspaceFiles; release(): void } {
  let resolveGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    resolveGate = resolve;
  });
  let gated = true;
  const port: WorkspaceFilesPort = {
    list: (sid, path, signal) =>
      gated && sid === sessionId && path === WORKFLOW_ROOT
        ? gate.then(() => fake.port.list(sid, path, signal))
        : fake.port.list(sid, path, signal),
    read: (sid, path, range, signal) => fake.port.read(sid, path, range, signal),
    readBytes: (sid, path, options, signal) => fake.port.readBytes(sid, path, options, signal),
    changes: (sid, path, signal) => fake.port.changes(sid, path, signal),
  };
  return { port, fake, release: () => {
    gated = false;
    resolveGate();
  } };
}

/** One in-memory workspace entry: a file with content or a directory. */
type FakeEntry = { kind: "file"; content: string } | { kind: "dir"; children: Map<string, FakeEntry> };

/** A fake workspace-files port with call instrumentation and watch queues. */
export class FakeWorkspaceFiles {
  readonly root: FakeEntry = { kind: "dir", children: new Map() };
  readonly listCalls: string[] = [];
  readonly listCounts = new Map<string, number>();
  readonly readCalls: Array<{ path: string; offset: number }> = [];
  readonly readBytesCalls: string[] = [];
  readonly truncatedDirs = new Set<string>();
  readonly listFailures = new Set<string>();
  readonly readBytesRefused = new Set<string>();
  readonly watchModes = new Map<string, "unsupported" | "fail">();
  readonly openWatches = new Set<string>();
  private readonly queues = new Map<string, Array<WatchFrame>>();
  private readonly abortWaiters = new Map<string, Array<() => void>>();

  /** Writes one file at a workspace-relative path, creating directories. */
  writeFile(filePath: string, content: string): void {
    const parts = filePath.split("/");
    const name = parts.pop() as string;
    let dir = this.root;
    for (const part of parts) {
      let child = dir.children.get(part);
      if (child === undefined || child.kind !== "dir") {
        child = { kind: "dir", children: new Map() };
        dir.children.set(part, child);
      }
      dir = child;
    }
    dir.children.set(name, { kind: "file", content });
  }

  /** Removes one file at a workspace-relative path, as a deletion would. */
  removeFile(filePath: string): void {
    const parts = filePath.split("/");
    const name = parts.pop() as string;
    let dir = this.root;
    for (const part of parts) {
      const child = dir.children.get(part);
      if (child === undefined || child.kind !== "dir") {
        return;
      }
      dir = child;
    }
    dir.children.delete(name);
  }

  /** Emits one change frame on the watch of one path. */
  emit(path: string, version: string): void {
    this.framesOf(path).push({ kind: "change", change: { absolutePath: `/ws/${path}`, version } });
    this.wake(path);
  }

  /** Emits one absence frame on the watch of one path. */
  emitAbsent(path: string): void {
    this.framesOf(path).push({ kind: "change", change: { absolutePath: `/ws/${path}`, absent: true } });
    this.wake(path);
  }

  /** The frames queued for one watched path. */
  private framesOf(path: string): Array<WatchFrame> {
    let frames = this.queues.get(path);
    if (frames === undefined) {
      frames = [];
      this.queues.set(path, frames);
    }
    return frames;
  }

  /** Wakes every waiter of one watched path. */
  private wake(path: string): void {
    for (const wake of this.abortWaiters.get(path) ?? []) {
      wake();
    }
    this.abortWaiters.set(path, []);
  }

  /** The port face the model consumes. */
  readonly port: WorkspaceFilesPort = {
    list: async (_sessionId, dirPath): Promise<DirectoryListing> => {
      if (this.listFailures.has(dirPath)) {
        throw { code: "workspace-file/not-found", path: dirPath };
      }
      this.listCalls.push(dirPath);
      this.listCounts.set(dirPath, (this.listCounts.get(dirPath) ?? 0) + 1);
      const dir = this.resolveDir(dirPath);
      const entries: DirectoryEntry[] = [...dir.children.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, child]) => ({
          name,
          type: child.kind === "dir" ? ("directory" as const) : ("file" as const),
          size: child.kind === "file" ? child.content.length : undefined,
        }));
      return { path: dirPath, entries, truncated: this.truncatedDirs.has(dirPath) };
    },
    readBytes: async (_sessionId, filePath): Promise<ByteWindow> => {
      this.readBytesCalls.push(filePath);
      if (this.readBytesRefused.has(filePath)) {
        throw { code: "workspace-file/too-large", path: filePath };
      }
      const file = this.resolveFile(filePath);
      return { offset: 0, data: new TextEncoder().encode(file.content), eof: true };
    },
    read: async (_sessionId, filePath, range): Promise<TextPage> => {
      const offset = range?.offset ?? 1;
      this.readCalls.push({ path: filePath, offset });
      const file = this.resolveFile(filePath);
      const split = file.content.split("\n");
      if (split[split.length - 1] === "") {
        split.pop();
      }
      const allLines = split;
      const limit = range?.limit ?? 5;
      const slice = allLines.slice(offset - 1, offset - 1 + limit);
      const eof = offset - 1 + slice.length >= allLines.length;
      return { offset, text: slice.join("\n"), lines: slice.length, eof };
    },
    changes: async function* (this: FakeWorkspaceFiles, _sessionId, watchedPath, signal): AsyncIterable<WatchFrame> {
      const mode = this.watchModes.get(watchedPath);
      if (mode === "unsupported") {
        throw { code: "workspace-file/watch-unsupported", path: watchedPath };
      }
      this.openWatches.add(watchedPath);
      let aborted = false;
      const onAbort = (): void => {
        aborted = true;
        for (const wake of this.abortWaiters.get(watchedPath) ?? []) {
          wake();
        }
        this.abortWaiters.set(watchedPath, []);
      };
      signal?.addEventListener("abort", onAbort);
      try {
        yield { kind: "ready" };
        for (;;) {
          const frames = this.framesOf(watchedPath);
          const frame = frames.shift();
          if (frame !== undefined) {
            yield frame;
            continue;
          }
          await new Promise<void>((resolve, reject) => {
            const waiters = this.abortWaiters.get(watchedPath) ?? [];
            waiters.push(resolve);
            this.abortWaiters.set(watchedPath, waiters);
            if (aborted) {
              reject(new Error("aborted"));
            }
          });
        }
      } finally {
        signal?.removeEventListener("abort", onAbort);
        this.openWatches.delete(watchedPath);
      }
    }.bind(this) as WorkspaceFilesPort["changes"],
  };

  /** Resolves one directory path, throwing not-found or not-directory wire errors. */
  private resolveDir(dirPath: string): FakeEntry {
    const entry = this.resolve(dirPath);
    if (entry === undefined) {
      throw { code: "workspace-file/not-found", path: dirPath };
    }
    if (entry.kind !== "dir") {
      throw { code: "workspace-file/not-directory", path: dirPath };
    }
    return entry;
  }

  /** Resolves one file path, throwing the not-found wire error. */
  private resolveFile(filePath: string): { kind: "file"; content: string } {
    const entry = this.resolve(filePath);
    if (entry === undefined) {
      throw { code: "workspace-file/not-found", path: filePath };
    }
    if (entry.kind !== "file") {
      throw { code: "workspace-file/not-regular-file", path: filePath };
    }
    return entry;
  }

  /** Walks the in-memory tree to one path. */
  private resolve(target: string): FakeEntry | undefined {
    if (target === "") {
      return this.root;
    }
    let current: FakeEntry | undefined = this.root;
    for (const part of target.split("/")) {
      if (current === undefined || current.kind !== "dir") {
        return undefined;
      }
      current = current.children.get(part);
    }
    return current;
  }
}

/** Yields once so unawaited watch pumps start before assertions read them. */
async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Finds one node by id in a tree state. */
function nodeById(state: TreeState, id: string): DocumentNode | undefined {
  const walk = (nodes: readonly DocumentNode[]): DocumentNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) {
        return node;
      }
      const child = node.children === undefined ? undefined : walk(node.children);
      if (child !== undefined) {
        return child;
      }
    }
    return undefined;
  };
  return walk(state.families);
}

/** Writes the fixture tree every taxonomy case shares. */
function seedFixtureTree(fake: FakeWorkspaceFiles): void {
  fake.writeFile(`${WORKFLOW_ROOT}/config.yaml`, "schema: x\nartifact_type: workflow_config\n");
  fake.writeFile(`${WORKFLOW_ROOT}/architecture.yaml`, "artifact_type: architecture\narchitecture:\n  id: a\n  title: The Architecture\n");
  fake.writeFile(`${WORKFLOW_ROOT}/roadmap/INDEX.yaml`, "artifact_type: roadmap_index\n");
  fake.writeFile(
    `${WORKFLOW_ROOT}/roadmap/milestones/foundation.yaml`,
    "artifact_type: roadmap_milestone\nmilestone:\n  m1:\n    title: Foundation Milestone\n",
  );
  fake.writeFile(`${WORKFLOW_ROOT}/roadmap/planned-changes/first-step.yaml`, "artifact_type: planned_change\nplanned_change:\n  id: first-step\n");
  fake.writeFile(`${WORKFLOW_ROOT}/roadmap/archive/2026-01-01-old.yaml`, "artifact_type: roadmap_milestone\nmilestone:\n  m0:\n    title: Old\n");
  fake.writeFile(`${WORKFLOW_ROOT}/changes/great-change/proposal.yaml`, "artifact_type: change_proposal\nchange:\n  id: great-change\n");
  fake.writeFile(`${WORKFLOW_ROOT}/changes/archive/2026-01-02-gone/proposal.yaml`, "artifact_type: change_proposal\nchange:\n  id: gone\n");
  fake.writeFile(`${WORKFLOW_ROOT}/scenes/INDEX.yaml`, "artifact_type: scenes_index\n");
  fake.writeFile(`${WORKFLOW_ROOT}/scenes/viewer/browse.yaml`, "artifact_type: scene\nscene:\n  id: browse\n  title: An operator browses\n");
  fake.writeFile(`${WORKFLOW_ROOT}/specs/INDEX.yaml`, "artifact_type: spec_index\n");
  fake.writeFile(`${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`, "artifact_type: main_spec\nspec:\n  id: viewer\n  title: Viewer Behavior\n");
  fake.writeFile(`${WORKFLOW_ROOT}/specs/viewer/widget.yaml`, "artifact_type: widget_widget\nwidget: {}\n");
  fake.writeFile(`${WORKFLOW_ROOT}/tech/INDEX.yaml`, "artifact_type: tech_index\n");
  fake.writeFile(`${WORKFLOW_ROOT}/tech/client.yaml`, "artifact_type: main_tech\nstandard:\n  id: client\n  title: Client Conventions\n");
  fake.writeFile(`${WORKFLOW_ROOT}/lessons/INDEX.yaml`, "artifact_type: lessons_index\n");
  fake.writeFile(`${WORKFLOW_ROOT}/lessons/tooling/learned.yaml`, "artifact_type: lesson\nlesson:\n  id: learned\n  title: A lesson learned\n");
}

/** Creates the stores over one fake workspace and loads it. */
async function loadFakeWorkspace(fake: FakeWorkspaceFiles): Promise<ViewerStores> {
  const stores = createViewerStores(fake.port);
  await stores.actions.loadWorkspace(SESSION_ID);
  await settle();
  return stores;
}

/** A node-fs-backed port over one real directory, with read instrumentation. */
function createNodeFsPort(rootDir: string): WorkspaceFilesPort & { readBytesPaths: string[] } {
  const readBytesPaths: string[] = [];
  const resolveReal = (workspacePath: string): string => path.join(rootDir, workspacePath);
  return {
    readBytesPaths,
    list: async (_sessionId, dirPath): Promise<DirectoryListing> => {
      let names;
      try {
        names = readdirSync(resolveReal(dirPath), { withFileTypes: true });
      } catch {
        throw { code: "workspace-file/not-found", path: dirPath };
      }
      const entries: DirectoryEntry[] = names
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? ("directory" as const) : entry.isFile() ? ("file" as const) : ("other" as const),
          size: entry.isFile() ? statSync(path.join(resolveReal(dirPath), entry.name)).size : undefined,
        }));
      return { path: dirPath, entries, truncated: false };
    },
    readBytes: async (_sessionId, filePath): Promise<ByteWindow> => {
      readBytesPaths.push(filePath);
      return { offset: 0, data: readFileSync(resolveReal(filePath)), eof: true };
    },
    read: async (_sessionId, filePath, range): Promise<TextPage> => {
      const content = readFileSync(resolveReal(filePath), "utf8");
      const offset = range?.offset ?? 1;
      const split = content.split("\n");
      if (split[split.length - 1] === "") {
        split.pop();
      }
      const allLines = split;
      const slice = allLines.slice(offset - 1, offset - 1 + (range?.limit ?? allLines.length));
      return { offset, text: slice.join("\n"), lines: slice.length, eof: offset - 1 + slice.length >= allLines.length };
    },
    changes: async function* (_sessionId, _watchedPath, signal): AsyncIterable<WatchFrame> {
      yield { kind: "ready" };
      await new Promise<void>((resolve) => {
        signal?.addEventListener("abort", () => resolve());
      });
    },
  };
}

export async function runDshPluginModelSuite(context: TestContext): Promise<void> {
  context.section("dsh plugin model: family taxonomy from a fixture tree");

  {
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    const stores = await loadFakeWorkspace(fake);
    const state = stores.tree.getSnapshot();
    context.assert(state.status === "ready", "fixture workspace loads to ready");
    const presentFamilies = state.families.map((family) => family.family);
    context.assert(
      JSON.stringify(presentFamilies) === JSON.stringify(["config", "architecture", "roadmap", "changes", "scenes", "specs", "tech", "lessons"]),
      "families appear in the fixed order with absent sops and design-system omitted",
      `actual: ${JSON.stringify(presentFamilies)}`,
    );
    context.assert(state.families[0].children?.[0].label === "config.yaml", "config keeps the filename fallback label");
    const documents = state.documents;
    context.assert(documents[`${WORKFLOW_ROOT}/architecture.yaml`]?.label === "The Architecture", "architecture label comes from its declared title");
    context.assert(documents[`${WORKFLOW_ROOT}/roadmap/milestones/foundation.yaml`]?.label === "Foundation Milestone", "milestone label comes from the declared milestone title");
    context.assert(documents[`${WORKFLOW_ROOT}/roadmap/planned-changes/first-step.yaml`]?.label === "first-step", "planned-change label comes from the declared id");
    context.assert(documents[`${WORKFLOW_ROOT}/changes/great-change/proposal.yaml`]?.label === "great-change", "change proposal label comes from the declared change id");
    context.assert(documents[`${WORKFLOW_ROOT}/scenes/viewer/browse.yaml`]?.label === "An operator browses", "scene label comes from the declared scene title");
    context.assert(documents[`${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`]?.label === "Viewer Behavior", "spec label comes from the declared spec title");
    context.assert(documents[`${WORKFLOW_ROOT}/lessons/tooling/learned.yaml`]?.label === "A lesson learned", "lesson label comes from the declared lesson title");
    context.assert(documents[`${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`]?.known === true, "a known artifact_type is recorded as known");

    // Re-expansion: every family root collapses and expands again to the same
    // children, the single-file families included, whose synthetic family
    // path names no directory on disk.
    const childFacts = (node: DocumentNode | undefined): string =>
      JSON.stringify((node?.children ?? []).map((child) => [child.path, child.label, child.loaded]));
    for (const family of state.families) {
      const before = childFacts(nodeById(stores.tree.getSnapshot(), family.id));
      stores.actions.collapseNode(SESSION_ID, family.id);
      await stores.actions.expandNode(SESSION_ID, family.id);
      await settle();
      const reexpanded = nodeById(stores.tree.getSnapshot(), family.id);
      const after = childFacts(reexpanded);
      context.assert(
        reexpanded?.loaded === true && after === before,
        `the ${family.family} family expands again to the same children, labels, and archive deferral after collapsing`,
        `before: ${before}, after: ${after}`,
      );
    }
    stores.actions.dispose();
  }

  {
    // A single-file family re-expands too, Design system included, and a
    // family whose source left the workspace while collapsed stays collapsed
    // rather than turning into an empty group.
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    fake.writeFile(`${WORKFLOW_ROOT}/design-system.yaml`, "artifact_type: design_system\n");
    const stores = await loadFakeWorkspace(fake);
    const designId = `${WORKFLOW_ROOT}/design-system`;
    stores.actions.collapseNode(SESSION_ID, designId);
    await stores.actions.expandNode(SESSION_ID, designId);
    await settle();
    context.assert(
      (nodeById(stores.tree.getSnapshot(), designId)?.children ?? []).some((child) => child.path === `${WORKFLOW_ROOT}/design-system.yaml`),
      "the design-system family expands again to its document after collapsing",
    );
    const configId = `${WORKFLOW_ROOT}/config`;
    stores.actions.collapseNode(SESSION_ID, configId);
    fake.removeFile(`${WORKFLOW_ROOT}/config.yaml`);
    await stores.actions.expandNode(SESSION_ID, configId);
    await settle();
    const vanished = nodeById(stores.tree.getSnapshot(), configId);
    context.assert(
      vanished?.loaded === false && (vanished.children?.length ?? 0) === 0,
      "a family whose source was deleted while collapsed stays collapsed instead of expanding empty",
      `loaded: ${String(vanished?.loaded)}`,
    );
    stores.actions.dispose();
  }

  context.section("dsh plugin model: opening a document reveals it in the tree");

  {
    // Every collapsed group above an opened document expands — a deferred
    // archive, a collapsed directory group, and a collapsed single-file
    // family alike — so the tree can move to the document's row.
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    const stores = await loadFakeWorkspace(fake);
    const archivedPath = `${WORKFLOW_ROOT}/roadmap/archive/2026-01-01-old.yaml`;
    context.assert(nodeById(stores.tree.getSnapshot(), archivedPath) === undefined, "the archived document starts unlisted inside the deferred roadmap archive");
    await stores.actions.openDocument(SESSION_ID, archivedPath);
    await settle();
    context.assert(
      nodeById(stores.tree.getSnapshot(), `${WORKFLOW_ROOT}/roadmap/archive`)?.loaded === true
        && nodeById(stores.tree.getSnapshot(), archivedPath) !== undefined,
      "opening a document inside the collapsed roadmap archive expands the archive and lists the document",
    );

    const specGroup = `${WORKFLOW_ROOT}/specs/viewer`;
    const specPath = `${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`;
    stores.actions.collapseNode(SESSION_ID, specGroup);
    stores.actions.collapseNode(SESSION_ID, `${WORKFLOW_ROOT}/config`);
    await stores.actions.openDocument(SESSION_ID, specPath);
    await stores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/config.yaml`);
    await settle();
    context.assert(
      nodeById(stores.tree.getSnapshot(), specPath) !== undefined,
      "opening a document under a collapsed directory group expands the group and lists the document",
    );
    context.assert(
      nodeById(stores.tree.getSnapshot(), `${WORKFLOW_ROOT}/config.yaml`) !== undefined,
      "opening the document of a collapsed single-file family expands the family and lists the document",
    );

    const before = JSON.stringify(stores.tree.getSnapshot().families);
    await stores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/specs/nowhere/missing.yaml`);
    await settle();
    context.assert(
      JSON.stringify(stores.tree.getSnapshot().families) === before,
      "opening a path the tree cannot hold leaves the tree unchanged",
    );
    stores.actions.dispose();
  }

  {
    // A reveal whose archive listing lands after a Session switch never
    // grafts the previous workspace's archive entries into the new tree.
    const fakeA = new FakeWorkspaceFiles();
    seedFixtureTree(fakeA);
    fakeA.writeFile(`${WORKFLOW_ROOT}/roadmap/archive/2026-a.yaml`, "artifact_type: roadmap_milestone\n");
    const fakeB = new FakeWorkspaceFiles();
    seedFixtureTree(fakeB);
    let releaseArchive!: () => void;
    const archiveGate = new Promise<void>((resolve) => {
      releaseArchive = resolve;
    });
    const archiveDir = `${WORKFLOW_ROOT}/roadmap/archive`;
    const route = (sid: string): WorkspaceFilesPort => (sid === "session-a" ? fakeA.port : fakeB.port);
    const port: WorkspaceFilesPort = {
      list: (sid, dirPath, signal) =>
        sid === "session-a" && dirPath === archiveDir
          ? archiveGate.then(() => fakeA.port.list(sid, dirPath, signal))
          : route(sid).list(sid, dirPath, signal),
      read: (sid, filePath, range, signal) => route(sid).read(sid, filePath, range, signal),
      readBytes: (sid, filePath, options, signal) => route(sid).readBytes(sid, filePath, options, signal),
      changes: (sid, watchedPath, signal) => route(sid).changes(sid, watchedPath, signal),
    };
    const stores = createViewerStores(port);
    await stores.actions.loadWorkspace("session-a");
    await settle();
    void stores.actions.openDocument("session-a", `${archiveDir}/2026-a.yaml`);
    await settle();
    await stores.actions.loadWorkspace("session-b");
    await settle();
    releaseArchive();
    await settle();
    context.assert(
      nodeById(stores.tree.getSnapshot(), `${archiveDir}/2026-a.yaml`) === undefined
        && nodeById(stores.tree.getSnapshot(), archiveDir)?.loaded === false,
      "a reveal listing that lands after a Session switch leaves the new Session's archive collapsed and free of the old entries",
    );
    stores.actions.dispose();
  }

  context.section("dsh plugin model: unknown artifact type fallback");

  {
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    const stores = await loadFakeWorkspace(fake);
    const record = stores.tree.getSnapshot().documents[`${WORKFLOW_ROOT}/specs/viewer/widget.yaml`];
    context.assert(record !== undefined, "a file with an unknown artifact_type is still listed");
    context.assert(record?.label === "widget.yaml", "the unknown-artifact fallback labels from the file name", `actual: ${record?.label}`);
    context.assert(record?.known === false, "the unknown artifact_type is recorded as not known");
    context.assert(record?.artifactType === "widget_widget", "the declared artifact_type stays visible for the view");
    stores.actions.dispose();
  }

  context.section("dsh plugin model: archive deferral, unread collapsed, and truncation");

  {
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    const stores = await loadFakeWorkspace(fake);
    const changeArchiveId = `${WORKFLOW_ROOT}/changes/archive`;
    const roadmapArchiveId = `${WORKFLOW_ROOT}/roadmap/archive`;
    const changeArchive = nodeById(stores.tree.getSnapshot(), changeArchiveId);
    const roadmapArchive = nodeById(stores.tree.getSnapshot(), roadmapArchiveId);
    context.assert(changeArchive !== undefined && roadmapArchive !== undefined, "both archive groups exist in the tree");
    context.assert(changeArchive?.loaded === false && (changeArchive?.children?.length ?? 0) === 0, "the change archive is deferred and unread");
    context.assert(roadmapArchive?.loaded === false && (roadmapArchive?.children?.length ?? 0) === 0, "the roadmap archive is deferred and unread");
    context.assert(
      !fake.listCalls.some((call) => call.startsWith(`${changeArchiveId}/`) || call.startsWith(`${roadmapArchiveId}/`)),
      "no archive directory was listed before expansion",
    );
    context.assert(
      !fake.readBytesCalls.some((call) => call.startsWith(`${changeArchiveId}/`) || call.startsWith(`${roadmapArchiveId}/`)),
      "no archived file content was read before expansion",
    );

    await stores.actions.expandNode(SESSION_ID, changeArchiveId);
    await settle();
    const expanded = nodeById(stores.tree.getSnapshot(), changeArchiveId);
    context.assert(expanded?.loaded === true && (expanded?.children?.length ?? 0) === 1, "expanding the archive lists its entries");
    const archivedDoc = stores.tree.getSnapshot().documents[`${changeArchiveId}/2026-01-02-gone/proposal.yaml`];
    context.assert(archivedDoc !== undefined, "archived entries become documents after expansion");
    context.assert(archivedDoc?.label === "proposal.yaml", "archived entries are labeled from file names alone", `actual: ${archivedDoc?.label}`);
    context.assert(archivedDoc?.archived === true, "archived entries are marked archived");
    context.assert(
      !fake.readBytesCalls.includes(`${changeArchiveId}/2026-01-02-gone/proposal.yaml`),
      "expansion lists archived entries without reading their content",
    );

    stores.actions.collapseNode(SESSION_ID, changeArchiveId);
    await settle();
    const collapsed = nodeById(stores.tree.getSnapshot(), changeArchiveId);
    context.assert(collapsed?.loaded === false && (collapsed?.children?.length ?? 0) === 0, "collapsing unloads the archive again");
    context.assert(!fake.openWatches.has(changeArchiveId), "collapsing closes the archive's watch");
    stores.actions.dispose();
  }

  {
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    fake.truncatedDirs.add(`${WORKFLOW_ROOT}/roadmap/planned-changes`);
    const stores = await loadFakeWorkspace(fake);
    const marker = nodeById(stores.tree.getSnapshot(), `${WORKFLOW_ROOT}/roadmap/planned-changes::truncated`);
    context.assert(marker?.kind === "truncation", "a truncated listing records an explicit truncation marker node");
    context.assert(
      (fake.listCounts.get(`${WORKFLOW_ROOT}/roadmap/planned-changes`) ?? 0) === 1,
      "a truncated listing is never retried or paged",
      `list calls: ${fake.listCounts.get(`${WORKFLOW_ROOT}/roadmap/planned-changes`) ?? 0}`,
    );
    stores.actions.dispose();
  }

  {
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    fake.truncatedDirs.add(WORKFLOW_ROOT);
    const stores = await loadFakeWorkspace(fake);
    context.assert(stores.tree.getSnapshot().rootTruncated === true, "a truncated root listing is recorded on the tree state");
    stores.actions.dispose();
  }

  context.section("dsh plugin model: load and expand failure resilience");

  {
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    fake.listFailures.add(`${WORKFLOW_ROOT}/roadmap/milestones`);
    const stores = createViewerStores(fake.port);
    await stores.actions.loadWorkspace(SESSION_ID);
    const state = stores.tree.getSnapshot();
    context.assert(state.status === "error", "a failed family walk reports the error state", `actual: ${state.status}`);
    context.assert(state.errorCode === "workspace-file/not-found", "the error state carries the failing code", `code: ${state.errorCode}`);
    stores.actions.dispose();
  }

  {
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    const stores = await loadFakeWorkspace(fake);
    fake.listFailures.add(`${WORKFLOW_ROOT}/changes/archive`);
    await stores.actions.expandNode(SESSION_ID, `${WORKFLOW_ROOT}/changes/archive`);
    const archive = nodeById(stores.tree.getSnapshot(), `${WORKFLOW_ROOT}/changes/archive`);
    context.assert(archive?.loaded === false, "a failed expansion leaves the group deferred");
    context.assert(stores.tree.getSnapshot().status === "ready", "a failed expansion keeps the rest of the tree");
    fake.listFailures.delete(`${WORKFLOW_ROOT}/changes/archive`);
    await stores.actions.expandNode(SESSION_ID, `${WORKFLOW_ROOT}/changes/archive`);
    const recovered = nodeById(stores.tree.getSnapshot(), `${WORKFLOW_ROOT}/changes/archive`);
    context.assert(recovered?.loaded === true, "the next expansion retries and recovers");
    stores.actions.dispose();
  }

  context.section("dsh plugin model: document loader paths and parse errors");

  {
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    fake.writeFile(`${WORKFLOW_ROOT}/specs/viewer/broken.yaml`, "spec:\n  id: broken\n bad indent\n");
    const stores = await loadFakeWorkspace(fake);
    await stores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/specs/viewer/broken.yaml`);
    const opened = stores.open.getSnapshot();
    context.assert(opened.status === "error", "a malformed document fails to open with an error");
    context.assert(opened.error?.kind === "parse", "the malformed document yields a parse error");
    context.assert(
      opened.error?.kind === "parse" && opened.error.line === 3 && opened.error.column >= 1,
      "the parse error is located by 1-based line and column",
      `error: ${JSON.stringify(opened.error)}`,
    );
    await settle();
    context.assert(
      fake.openWatches.has(`${WORKFLOW_ROOT}/specs/viewer/broken.yaml`),
      "an errored open document keeps its watch so an on-disk fix recovers the view",
    );
    context.assert(stores.tree.getSnapshot().status === "ready", "the tree keeps working after a parse error");
    context.assert(fake.readBytesCalls.includes(`${WORKFLOW_ROOT}/specs/viewer/broken.yaml`), "the loader reads the complete file through readBytes");
    context.assert(fake.readCalls.length === 0, "the paged read path is not used when the byte read serves the file");
    stores.actions.dispose();
  }

  {
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    const longLines = Array.from({ length: 12 }, (_, index) => `line-${index + 1}`);
    fake.writeFile(`${WORKFLOW_ROOT}/specs/viewer/huge.yaml`, `spec:\n  id: huge\nitems:\n${longLines.map((line) => `  - ${line}`).join("\n")}\n`);
    fake.readBytesRefused.add(`${WORKFLOW_ROOT}/specs/viewer/huge.yaml`);
    const stores = await loadFakeWorkspace(fake);
    await stores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/specs/viewer/huge.yaml`);
    const opened = stores.open.getSnapshot();
    context.assert(opened.status === "ready", "a too-large byte read falls back to paged read until eof", `state: ${JSON.stringify(opened.status)}`);
    const offsets = fake.readCalls.filter((call) => call.path === `${WORKFLOW_ROOT}/specs/viewer/huge.yaml`).map((call) => call.offset);
    context.assert(offsets.length >= 2 && offsets[0] === 1, "the paged fallback walks pages from the first line", `offsets: ${JSON.stringify(offsets)}`);
    const data = opened.data as { items?: string[] };
    context.assert(data?.items?.length === longLines.length, "the paged fallback assembles the complete text", `items: ${data?.items?.length}`);
    stores.actions.dispose();
  }

  context.section("dsh plugin model: missing workflow directory");

  {
    const fake = new FakeWorkspaceFiles();
    fake.writeFile("README.md", "not a strict workspace\n");
    const stores = createViewerStores(fake.port);
    await stores.actions.loadWorkspace(SESSION_ID);
    const state = stores.tree.getSnapshot();
    context.assert(state.status === "empty", "a workspace without .strict-spec-driven/ reports the empty state", `actual: ${state.status}`);
    context.assert(state.families.length === 0, "the empty state carries no families");
    stores.actions.dispose();
  }

  context.section("dsh plugin model: watch lifecycle and live invalidation");

  {
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    const stores = await loadFakeWorkspace(fake);
    const loadedDirs = [`${WORKFLOW_ROOT}/roadmap`, `${WORKFLOW_ROOT}/roadmap/milestones`, `${WORKFLOW_ROOT}/roadmap/planned-changes`, `${WORKFLOW_ROOT}/changes`];
    for (const dir of loadedDirs) {
      context.assert(fake.openWatches.has(dir), `one watch serves the loaded directory ${dir}`);
    }
    context.assert(!fake.openWatches.has(`${WORKFLOW_ROOT}/changes/archive`), "a deferred archive holds no watch before expansion");

    const docPath = `${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`;
    await stores.actions.openDocument(SESSION_ID, docPath);
    await settle();
    context.assert(fake.openWatches.has(docPath), "the open document holds its own watch");
    fake.writeFile(docPath, "artifact_type: main_spec\nspec:\n  id: viewer\n  title: Viewer Behavior v2\n");
    fake.emit(docPath, "v2");
    await settle();
    context.assert(stores.open.getSnapshot().status === "ready", "the open view refreshes after the watched file changes");
    context.assert(
      (stores.open.getSnapshot().data as { spec?: { title?: string } })?.spec?.title === "Viewer Behavior v2",
      "the refreshed view shows the new content",
    );

    fake.removeFile(docPath);
    fake.emitAbsent(docPath);
    await settle();
    context.assert(stores.open.getSnapshot().status === "absent", "a removed open file is reflected as absent");
    context.assert(stores.tree.getSnapshot().documents[docPath] === undefined, "the reloaded directory drops the removed file from the tree");

    const specsViewerDir = `${WORKFLOW_ROOT}/specs/viewer`;
    stores.actions.collapseNode(SESSION_ID, specsViewerDir);
    await settle();
    // Recreate the removed file while its directory is collapsed and
    // unwatched: re-expansion must re-walk the directory and read the fresh
    // content, proving both the reload and the recreation path.
    fake.writeFile(`${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`, "artifact_type: main_spec\nspec:\n  id: viewer\n  title: Viewer Behavior v3\n");
    const collapsedSpecs = nodeById(stores.tree.getSnapshot(), specsViewerDir);
    context.assert(collapsedSpecs?.loaded === false && (collapsedSpecs?.children?.length ?? 0) === 0, "collapsing a loaded directory unloads its children");
    context.assert(!fake.openWatches.has(specsViewerDir), "collapsing a loaded directory closes its watch");
    context.assert(stores.tree.getSnapshot().documents[`${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`] === undefined, "unloaded children leave the documents map");
    await stores.actions.expandNode(SESSION_ID, specsViewerDir);
    await settle();
    const reexpandedSpecs = nodeById(stores.tree.getSnapshot(), specsViewerDir);
    context.assert(reexpandedSpecs?.loaded === true && (reexpandedSpecs?.children?.length ?? 0) === 2, "re-expanding reloads the directory's children with the recreated file");
    context.assert(fake.openWatches.has(specsViewerDir), "re-expanding reopens the directory's watch");
    context.assert(stores.tree.getSnapshot().documents[`${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`]?.label === "Viewer Behavior v3", "re-expanding restores refined labels from a fresh read of the recreated file");

    await stores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/specs/viewer/widget.yaml`);
    await settle();
    stores.actions.closeDocument();
    await settle();
    context.assert(!fake.openWatches.has(`${WORKFLOW_ROOT}/specs/viewer/widget.yaml`), "closing the document closes its watch");
    context.assert(stores.open.getSnapshot().status === "idle", "closing resets the open view to idle");
    stores.actions.dispose();
    await settle();
    context.assert(fake.openWatches.size === 0, "dispose closes every remaining watch");
  }

  {
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    const archiveId = `${WORKFLOW_ROOT}/changes/archive`;
    fake.watchModes.set(archiveId, "unsupported");
    const stores = await loadFakeWorkspace(fake);
    await stores.actions.expandNode(SESSION_ID, archiveId);
    await settle();
    const archiveGroup = nodeById(stores.tree.getSnapshot(), archiveId);
    context.assert(archiveGroup?.watch === "unsupported", "a watch-unsupported backend is recorded as node health", `actual: ${archiveGroup?.watch}`);
    context.assert(archiveGroup?.loaded === true, "the unsupported watch still lists the group's entries");
    stores.actions.dispose();
  }

  context.section("dsh plugin model: store exposure shape");

  {
    const fake = new FakeWorkspaceFiles();
    const stores = createViewerStores(fake.port);
    context.assert(typeof stores.tree.getSnapshot === "function" && typeof stores.tree.subscribe === "function", "the tree store exposes snapshot reads and subscriptions");
    context.assert(typeof stores.open.getSnapshot === "function" && typeof stores.open.subscribe === "function", "the open store exposes snapshot reads and subscriptions");
    context.assert(
      typeof stores.actions.loadWorkspace === "function"
        && typeof stores.actions.expandNode === "function"
        && typeof stores.actions.collapseNode === "function"
        && typeof stores.actions.openDocument === "function"
        && typeof stores.actions.closeDocument === "function"
        && typeof stores.actions.dispose === "function",
      "the actions surface every documented viewer action",
    );
    context.assert(stores.tree.getSnapshot().status === "loading" && stores.open.getSnapshot().status === "idle", "fresh stores start loading and idle");
    stores.actions.dispose();
  }

  context.section("dsh plugin model: snapshot of this repository's workflow directory");

  {
    const port = createNodeFsPort(ROOT);
    const stores = createViewerStores(port);
    await stores.actions.loadWorkspace(SESSION_ID);
    await settle();
    const state = stores.tree.getSnapshot();
    context.assert(state.status === "ready", "the real workflow directory loads to ready", `status: ${state.status}`);
    const present = state.families.map((family) => family.family);
    const expectedReal = FAMILY_ORDER.filter((family) => family !== "sops" && family !== "design-system");
    context.assert(
      JSON.stringify(present) === JSON.stringify(expectedReal),
      "the real directory yields every present family in the fixed order with sops and design-system omitted",
      `actual: ${JSON.stringify(present)}`,
    );
    context.assert(
      state.documents[`${WORKFLOW_ROOT}/specs/dsh-viewer/behavior.yaml`]?.label === "DSH Strict Document Viewer Behavior",
      "the real dsh-viewer spec is labeled from its declared title",
    );
    context.assert(
      state.documents[`${WORKFLOW_ROOT}/roadmap/milestones/dsh-strict-spec-viewer-foundation.yaml`]?.label === "DeepSeek Harness strict document viewer foundation",
      "the real foundation milestone is labeled from its declared title",
    );
    const realChangeArchive = nodeById(state, `${WORKFLOW_ROOT}/changes/archive`);
    const realRoadmapArchive = nodeById(state, `${WORKFLOW_ROOT}/roadmap/archive`);
    context.assert(realChangeArchive?.loaded === false && realRoadmapArchive?.loaded === false, "both real archives stay deferred and unread at load");
    context.assert(
      !port.readBytesPaths.some((read) => read.startsWith(`${WORKFLOW_ROOT}/changes/archive/`) || read.startsWith(`${WORKFLOW_ROOT}/roadmap/archive/`)),
      "the real archives' file contents were never read at load",
    );
    await stores.actions.expandNode(SESSION_ID, `${WORKFLOW_ROOT}/changes/archive`);
    await settle();
    const expandedArchive = nodeById(stores.tree.getSnapshot(), `${WORKFLOW_ROOT}/changes/archive`);
    const archivedChildren = expandedArchive?.children ?? [];
    context.assert(archivedChildren.length >= 8, "expanding the real change archive lists its dated entries", `count: ${archivedChildren.length}`);
    context.assert(
      archivedChildren.every((child) => child.label === child.path.split("/").pop()),
      "every real archived entry is labeled from its directory name alone",
    );
    context.assert(
      !port.readBytesPaths.some((read) => read.startsWith(`${WORKFLOW_ROOT}/changes/archive/`)),
      "expanding the real archive reads no archived file content",
    );
    stores.actions.dispose();
  }

  context.section("dsh plugin model: session picker grouping and page selection");

  {
    // A scripted host: replaceable sessions/workspaces snapshots plus
    // listener sets, reproducing the subscribe/getSnapshot shape the
    // adapter reads. Changes replace the whole snapshot object, as the
    // host's observable snapshots are immutable per state.
    const listeners = { sessions: new Set<() => void>(), workspaces: new Set<() => void>() };
    let sessionsSnapshot: SessionsListSnapshot = {
      ids: ["s-old", "s-new", "s-mid", "s-free"],
      byId: {
        "s-old": { displayTitle: "Old session", updatedAt: 10 },
        "s-new": { displayTitle: "New session", updatedAt: 30 },
        "s-mid": { displayTitle: "Mid session", updatedAt: 20 },
        "s-free": { displayTitle: "Ungrouped session", updatedAt: 15 },
      },
      phase: "ready",
    };
    const workspacesSnapshot: WorkspacesListSnapshot = {
      items: [
        { workspaceId: "w-alpha", title: "Alpha", path: "/home/op/alpha", sessionIds: ["s-old", "s-new"] },
        { workspaceId: "w-empty", title: "Empty", path: "/home/op/empty", sessionIds: [] },
        { workspaceId: "w-beta", title: "Beta", path: "/home/op/beta", sessionIds: ["s-mid"] },
      ],
      state: "idle",
      phase: "ready",
    };
    const port = createSessionCatalogPort(
      {
        list: {
          getSnapshot: () => sessionsSnapshot,
          subscribe: (listener) => (listeners.sessions.add(listener), () => listeners.sessions.delete(listener)),
        },
      },
      {
        list: {
          getSnapshot: () => workspacesSnapshot,
          subscribe: (listener) => (listeners.workspaces.add(listener), () => listeners.workspaces.delete(listener)),
        },
      },
    );

    // Grouping: registry order, newest-first members, ungrouped tail, ready.
    let catalog = port.getCatalog();
    context.assert(catalog.status === "ready", "a ready host yields a ready catalog");
    context.assert(
      JSON.stringify(catalog.workspaces.map((workspace) => workspace.workspaceId)) === JSON.stringify(["w-alpha", "w-empty", "w-beta"]),
      "workspaces keep the host registry order, including the sessionless one",
    );
    context.assert(
      JSON.stringify(catalog.workspaces[0]?.sessions.map((session) => session.sessionId)) === JSON.stringify(["s-new", "s-old"]),
      "workspace members sort newest-first",
    );
    context.assert(
      catalog.workspaces[1]?.sessions.length === 0 && catalog.workspaces[2]?.sessions.length === 1,
      "the empty workspace stays listed with no members and beta keeps its one member",
    );
    context.assert(
      JSON.stringify(catalog.ungrouped.map((session) => session.sessionId)) === JSON.stringify(["s-free"]),
      "a host-list session no workspace accounts lands in the ungrouped tail",
    );

    // Live grouping: a snapshot change seen through the subscription.
    let observed = 0;
    const unsubscribe = port.subscribe(() => {
      observed += 1;
    });
    const beforeChange = port.getCatalog();
    const unchangedIdentity = port.getCatalog();
    context.assert(beforeChange === unchangedIdentity, "an unchanged snapshot pair returns the same catalog object, as useSyncExternalStore requires");
    sessionsSnapshot = {
      ...sessionsSnapshot,
      byId: { ...sessionsSnapshot.byId, "s-new": { displayTitle: "Renamed session", updatedAt: 30 } },
    };
    for (const listener of listeners.sessions) {
      listener();
    }
    catalog = port.getCatalog();
    context.assert(catalog !== beforeChange, "a changed sessions snapshot produces a new catalog object");
    context.assert(observed === 1, "a sessions snapshot change reaches the subscriber once");
    context.assert(catalog.workspaces[0]?.sessions[0]?.displayTitle === "Renamed session", "the port reads the changed snapshot");
    unsubscribe();
    for (const listener of listeners.sessions) {
      listener();
    }
    context.assert(observed === 1, "an unsubscribed listener stops receiving changes");

    // Status mapping from both snapshots' arrival axes.
    context.assert(
      computePickerCatalog({ ...workspacesSnapshot, phase: "pending" }, sessionsSnapshot).status === "loading"
        && computePickerCatalog(workspacesSnapshot, { ...sessionsSnapshot, phase: "pending" }).status === "loading",
      "either pending snapshot keeps the catalog loading",
    );
    context.assert(
      computePickerCatalog({ ...workspacesSnapshot, state: "error" }, sessionsSnapshot).status === "error",
      "a failed workspace registry reports the error status",
    );

    // Shown-session resolution across selection states.
    context.assert(
      JSON.stringify(resolveShownSession(catalog, { workspaceId: "w-alpha", sessionId: "s-old" })) === JSON.stringify({ workspaceId: "w-alpha", sessionId: "s-old" }),
      "a recorded member session resolves to itself with its workspace",
    );
    context.assert(
      JSON.stringify(resolveShownSession(catalog, { workspaceId: "w-alpha", sessionId: "s-gone" })) === JSON.stringify({ workspaceId: "w-alpha", sessionId: "s-new" }),
      "a vanished session falls back to the workspace's newest member",
    );
    context.assert(
      JSON.stringify(resolveShownSession(catalog, { workspaceId: "w-empty" })) === JSON.stringify({ workspaceId: "w-empty" }),
      "a sessionless workspace resolves to workspace-only, the prompt state",
    );
    context.assert(
      JSON.stringify(resolveShownSession(catalog, { sessionId: "s-free" })) === JSON.stringify({ sessionId: "s-free" }),
      "an ungrouped session resolves to itself with no workspace",
    );
    context.assert(
      JSON.stringify(resolveShownSession(catalog, {})) === JSON.stringify({ workspaceId: "w-alpha", sessionId: "s-new" }),
      "an empty selection resolves to the first workspace with a session",
    );
    context.assert(
      JSON.stringify(resolveShownSession({ workspaces: [], ungrouped: [], status: "ready" }, {})) === JSON.stringify({}),
      "a sessionless host resolves to nothing",
    );

    // Page-selection memory: recording and restoring choices.
    const page = createPageSelectionStore();
    context.assert(JSON.stringify(page.store.getSnapshot()) === JSON.stringify({}), "page selection starts empty");
    page.actions.chooseSession("w-alpha", "s-old");
    page.actions.recordDocument(".strict-spec-driven/config.yaml");
    context.assert(
      JSON.stringify(page.store.getSnapshot()) === JSON.stringify({ workspaceId: "w-alpha", sessionId: "s-old", documentPath: ".strict-spec-driven/config.yaml" }),
      "session and document choices are recorded together in page state",
    );
    page.actions.chooseWorkspace("w-alpha", true);
    context.assert(
      page.store.getSnapshot().workspaceId === "w-alpha" && page.store.getSnapshot().sessionId === "s-old",
      "choosing a workspace keeps the recorded session while it is a member",
    );
    page.actions.chooseWorkspace("w-empty", false);
    context.assert(
      JSON.stringify(page.store.getSnapshot()) === JSON.stringify({ workspaceId: "w-empty" }),
      "choosing a workspace the recorded session does not belong to clears the session and its document, reaching the prompt state",
    );
    page.actions.recordDocument(undefined);
    context.assert(page.store.getSnapshot().documentPath === undefined, "closing the document clears the recorded path");
  }

  context.section("dsh plugin model: page controller restore and staleness");

  {
    // The controller drives real stores over the scripted fake workspace.
    const fake = new FakeWorkspaceFiles();
    seedPickerControllerWorkspace(fake);
    const stores = createViewerStores(fake.port);
    const page = createPageSelectionStore();
    const controller = createPageController(stores, page.store);

    // Restore: a recorded document reopens after the workspace loads, with
    // the path captured before the recording clears it mid-flight.
    await stores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/config.yaml`);
    page.actions.recordDocument(`${WORKFLOW_ROOT}/config.yaml`);
    // Simulate the remounted page's recording effect clearing the path
    // synchronously while the load is still in flight.
    controller.showSession(SESSION_ID);
    page.actions.recordDocument(undefined);
    await settle();
    context.assert(stores.tree.getSnapshot().status === "ready", "the controller loads the shown session's workspace");
    context.assert(
      stores.open.getSnapshot().status === "ready" && stores.open.getSnapshot().path === `${WORKFLOW_ROOT}/config.yaml`,
      "the controller restores the recorded document captured before the recording effect cleared it",
    );

    // Supersede: a switch to another Session abandons the in-flight
    // restore instead of opening the old workspace's document under the
    // new Session.
    const switchFake = new FakeWorkspaceFiles();
    seedPickerControllerWorkspace(switchFake);
    const gated = createGatedPort(switchFake, "session-a");
    const switchStores = createViewerStores(gated.port);
    const switchPage = createPageSelectionStore();
    const switchController = createPageController(switchStores, switchPage.store);
    switchPage.actions.recordDocument(`${WORKFLOW_ROOT}/config.yaml`);
    switchController.showSession("session-a");
    await settle();
    // The page clears the recorded document when the operator picks a
    // different Session — the old document belongs to the old workspace.
    switchPage.actions.recordDocument(undefined);
    switchController.showSession("session-b");
    await settle();
    gated.release();
    await settle();
    context.assert(switchStores.tree.getSnapshot().status === "ready", "the superseding session's workspace loads");
    context.assert(
      switchStores.open.getSnapshot().status === "idle",
      "a superseded restore never opens the old session's recorded document",
    );

    // Deactivation and disposal close watches: nothing outlives the page.
    controller.showSession(undefined);
    switchController.dispose();
    await settle();
    context.assert(fake.openWatches.size === 0, "deactivation closes every watch of the shown session");
    context.assert(switchFake.openWatches.size === 0, "dispose closes every watch of the driven stores");

    // Remount: the client creates one page controller per load and the
    // page's unmount disposes it, so the next mount's showSession must load
    // the shown Session's workspace again rather than stay loading.
    const remountFake = new FakeWorkspaceFiles();
    seedPickerControllerWorkspace(remountFake);
    const remountStores = createViewerStores(remountFake.port);
    const remountPage = createPageSelectionStore();
    const remountController = createPageController(remountStores, remountPage.store);
    remountController.showSession(SESSION_ID);
    await settle();
    remountPage.actions.recordDocument(`${WORKFLOW_ROOT}/config.yaml`);
    remountController.dispose();
    await settle();
    remountController.showSession(SESSION_ID);
    await settle();
    context.assert(
      remountStores.tree.getSnapshot().status === "ready",
      "a disposed page controller reloads the shown session's workspace when the page mounts again",
      `tree status: ${remountStores.tree.getSnapshot().status}`,
    );
    context.assert(
      remountStores.open.getSnapshot().status === "ready" && remountStores.open.getSnapshot().path === `${WORKFLOW_ROOT}/config.yaml`,
      "a disposed page controller restores the recorded document when the page mounts again",
    );
    remountController.dispose();
    await settle();
    context.assert(remountFake.openWatches.size === 0, "disposing the remounted page closes every watch it opened");

    // In-flight remount: an unmount that lands while the first mount's load
    // is still pending, followed at once by a mount of the same Session (the
    // StrictMode mount-dispose-mount sequence), still settles on one ready
    // tree with the recorded document and leaks no watch.
    const inFlightFake = new FakeWorkspaceFiles();
    seedPickerControllerWorkspace(inFlightFake);
    const inFlightGate = createGatedPort(inFlightFake, SESSION_ID);
    const inFlightStores = createViewerStores(inFlightGate.port);
    const inFlightPage = createPageSelectionStore();
    const inFlightController = createPageController(inFlightStores, inFlightPage.store);
    inFlightPage.actions.recordDocument(`${WORKFLOW_ROOT}/config.yaml`);
    inFlightController.showSession(SESSION_ID);
    inFlightController.dispose();
    inFlightController.showSession(SESSION_ID);
    inFlightGate.release();
    await settle();
    context.assert(
      inFlightStores.tree.getSnapshot().status === "ready"
        && inFlightStores.open.getSnapshot().status === "ready"
        && inFlightStores.open.getSnapshot().path === `${WORKFLOW_ROOT}/config.yaml`,
      "a mount that follows an in-flight dispose loads the tree and restores the recorded document",
    );
    inFlightController.dispose();
    await settle();
    context.assert(inFlightFake.openWatches.size === 0, "the in-flight remount leaks no watch after the next dispose");
  }

  context.section("dsh plugin model: right-sidebar tab controller and per-session surfaces");

  {
    const fake = new FakeWorkspaceFiles();
    seedPickerControllerWorkspace(fake);
    const surfaces = createTabSurfaces(fake.port);

    // The bound Session's workspace loads on show, exactly once: a repeat
    // show is the no-op the load-once contract promises.
    const a = surfaces.get("session-a");
    context.assert(a.sessionId === "session-a", "the surface carries the sessionId the seat handed it");
    a.controller.show();
    await settle();
    context.assert(a.viewer.tree.getSnapshot().status === "ready", "show loads the bound session's workspace");
    const walksAfterFirstShow = fake.listCalls.length;
    a.controller.show();
    await settle();
    context.assert(fake.listCalls.length === walksAfterFirstShow, "a repeat show issues no second workspace walk");

    // Per-Session isolation: another Session's surface holds its own
    // stores, and the cache returns the same surface per sessionId.
    const b = surfaces.get("session-b");
    context.assert(a.viewer !== b.viewer, "each session's surface holds its own viewer stores");
    context.assert(surfaces.get("session-a") === a, "the surface cache returns the same surface for the same sessionId");

    // Teardown: dispose closes this surface's watches and resets it, and a
    // later show reloads — the unmount/remount cycle a non-keepMounted tab
    // body rides through Session switches.
    a.controller.dispose();
    await settle();
    context.assert(fake.openWatches.size === 0, "dispose closes the surface's watches");
    context.assert(a.viewer.tree.getSnapshot().status === "loading", "dispose resets the surface to the initial tree state");
    a.controller.show();
    await settle();
    context.assert(a.viewer.tree.getSnapshot().status === "ready", "a disposed surface reloads on its next show");

    // Registration disposal clears every cached surface and its watches, so
    // an unloaded fiber leaks nothing.
    b.controller.show();
    await settle();
    surfaces.dispose();
    await settle();
    context.assert(fake.openWatches.size === 0, "registration disposal closes every cached surface's watches");
    context.assert(surfaces.get("session-a") !== a, "a get after registration disposal creates a fresh surface");
  }

  context.section("dsh plugin model: stale workspace load cannot clobber the active one");

  {
    const fake = new FakeWorkspaceFiles();
    seedPickerControllerWorkspace(fake);
    const gated = createGatedPort(fake, "session-slow");
    const stores = createViewerStores(gated.port);
    const slow = stores.actions.loadWorkspace("session-slow");
    await stores.actions.loadWorkspace(SESSION_ID);
    gated.release();
    await slow;
    await settle();
    const state = stores.tree.getSnapshot();
    context.assert(state.status === "ready", "the active session's workspace is loaded");
    context.assert(
      state.documents[`${WORKFLOW_ROOT}/config.yaml`] !== undefined,
      "the active session's tree still shows its own documents after the stale load settles",
    );
  }

  context.section("dsh plugin model: remote port adapter over the wire result envelope");

  {
    // A scripted remote face mirroring the pinned wire: every method
    // resolves the ok/failure envelope, and the adapter must unwrap the
    // value, throw the failure carrying its code, and forward omitted
    // option objects as the empty objects the wire requires.
    const seenCalls: Array<{ method: string; range?: unknown; options?: unknown }> = [];
    const listing: DirectoryListing = { path: "", entries: [], truncated: false };
    const face = {
      workspaceFiles: {
        list: async (_sessionId: string, _path: string) => {
          seenCalls.push({ method: "list" });
          return { ok: true as const, value: listing };
        },
        read: async (_sessionId: string, _path: string, range: unknown) => {
          seenCalls.push({ method: "read", range });
          return { ok: false as const, error: { code: "not-found", message: "absent" } };
        },
        readBytes: async (_sessionId: string, _path: string, options: unknown) => {
          seenCalls.push({ method: "readBytes", options });
          return { ok: true as const, value: { offset: 0, data: new Uint8Array(), eof: true } satisfies ByteWindow };
        },
        changes: (_sessionId: string, _path: string) => ({
          async *[Symbol.asyncIterator]() {
            /* no frames */
          },
        }),
      },
    };
    const port = createRemotePort(face);
    context.assert((await port.list(SESSION_ID, "")) === listing, "the ok branch resolves to the wire value");
    let thrown: unknown;
    try {
      await port.read(SESSION_ID, "gone.yaml");
    } catch (error) {
      thrown = error;
    }
    context.assert(workspaceFileErrorCode(thrown) === "not-found", "the failure branch throws carrying the wire error code");
    context.assert((await port.readBytes(SESSION_ID, "bytes.bin")) !== undefined, "the byte read resolves through the envelope");
    context.assert(
      seenCalls.find((call) => call.method === "read")?.range !== undefined
        && seenCalls.find((call) => call.method === "readBytes")?.options !== undefined,
      "omitted range and options objects reach the wire as objects, never undefined",
    );
  }

  context.section("dsh plugin model: change task completion");

  {
    // Counting rules: declared statuses only, and no declared tasks means
    // no completion rather than a fabricated zero badge.
    context.assert(taskCompletion(undefined) === undefined, "a non-document yields no completion");
    context.assert(taskCompletion({ sections: {} }) === undefined, "a tasks file with no sections yields no completion");
    const mixed = taskCompletion({
      sections: {
        A: { t1: { text: "x", status: "complete" } },
        B: { t2: { text: "y", status: "pending" }, t3: { text: "z", status: "complete" } },
      },
    });
    context.assert(mixed?.done === 2 && mixed?.total === 3, "completion counts complete tasks across every section");
    context.assert(parentDirectory("a/b/c.yaml") === "a/b" && parentDirectory("c.yaml") === "", "the parent directory of a tasks file names its change group");
  }

  {
    // The badge rides the existing content pass: no workspace read beyond
    // the label refinement, refresh through the directory watch, deletion
    // through the recomputed tree, and never an archived entry.
    const fake = new FakeWorkspaceFiles();
    fake.writeFile(`${WORKFLOW_ROOT}/config.yaml`, "schema: strict-spec-driven/config/v1\nartifact_type: workflow_config\n");
    fake.writeFile(`${WORKFLOW_ROOT}/changes/alpha/proposal.yaml`, "artifact_type: change_proposal\nchange:\n  id: alpha\n");
    fake.writeFile(
      `${WORKFLOW_ROOT}/changes/alpha/tasks.yaml`,
      "artifact_type: task_list\nchange: alpha\nsections:\n  Implementation:\n    a1:\n      text: One.\n      status: complete\n    a2:\n      text: Two.\n      status: pending\n",
    );
    fake.writeFile(
      `${WORKFLOW_ROOT}/changes/archive/2026-01-01-beta/tasks.yaml`,
      "artifact_type: task_list\nchange: beta\nsections:\n  Implementation:\n    b1:\n      text: Done.\n      status: complete\n",
    );
    const stores = createViewerStores(fake.port);
    await stores.actions.loadWorkspace(SESSION_ID);
    await settle();

    const state = stores.tree.getSnapshot();
    const completion = state.changeCompletion?.[`${WORKFLOW_ROOT}/changes/alpha`];
    context.assert(completion?.done === 1 && completion?.total === 2, "the content pass records the change's completion keyed by its group path");
    context.assert(
      state.changeCompletion?.[`${WORKFLOW_ROOT}/changes/archive`] === undefined
        && state.changeCompletion?.[`${WORKFLOW_ROOT}/changes/archive/2026-01-01-beta`] === undefined,
      "archived change groups never appear because their files stay unread while they are only listed",
    );

    fake.writeFile(
      `${WORKFLOW_ROOT}/changes/alpha/tasks.yaml`,
      "artifact_type: task_list\nchange: alpha\nsections:\n  Implementation:\n    a1:\n      text: One.\n      status: complete\n    a2:\n      text: Two.\n      status: complete\n",
    );
    fake.emit(`${WORKFLOW_ROOT}/changes/alpha`, "v2");
    await settle();
    const refreshed = stores.tree.getSnapshot().changeCompletion?.[`${WORKFLOW_ROOT}/changes/alpha`];
    context.assert(refreshed?.done === 2 && refreshed?.total === 2, "a changed tasks file recomputes the completion through the directory reload");

    fake.removeFile(`${WORKFLOW_ROOT}/changes/alpha/tasks.yaml`);
    fake.emit(`${WORKFLOW_ROOT}/changes/alpha`, "v3");
    await settle();
    const removed = stores.tree.getSnapshot().changeCompletion?.[`${WORKFLOW_ROOT}/changes/alpha`];
    context.assert(removed === undefined, "a deleted tasks file drops its change's badge rather than going stale");

    stores.actions.dispose();
  }

  context.section("dsh plugin model: label refinement reads overlap under bounded concurrency");

  {
    // Reads of the specs family's documents park on a gate until released, so
    // the number of reads in flight at once is observable. The family holds
    // eleven documents after the extra seeds: a serial walk parks one, an
    // unbounded fan-out parks eleven, and the bounded pool parks exactly six.
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    for (let index = 1; index <= 8; index += 1) {
      fake.writeFile(`${WORKFLOW_ROOT}/specs/viewer/extra-${index}.yaml`, `artifact_type: main_spec\nspec:\n  id: extra-${index}\n  title: Extra ${index}\n`);
    }
    let activeReads = 0;
    let maxInFlight = 0;
    let released = false;
    const parked: Array<() => void> = [];
    const port: WorkspaceFilesPort = {
      list: (sid, dirPath, signal) => fake.port.list(sid, dirPath, signal),
      read: (sid, filePath, range, signal) => fake.port.read(sid, filePath, range, signal),
      readBytes: (sid, filePath, options, signal) => {
        if (!filePath.startsWith(`${WORKFLOW_ROOT}/specs/`) || released) {
          return fake.port.readBytes(sid, filePath, options, signal);
        }
        activeReads += 1;
        maxInFlight = Math.max(maxInFlight, activeReads);
        const real = fake.port.readBytes(sid, filePath, options, signal);
        const gate = new Promise<void>((resolve) => {
          parked.push(() => {
            activeReads -= 1;
            resolve();
          });
        });
        return Promise.all([gate, real]).then(([, window]) => window);
      },
      changes: (sid, watchedPath, signal) => fake.port.changes(sid, watchedPath, signal),
    };
    const stores = createViewerStores(port);
    const loading = stores.actions.loadWorkspace(SESSION_ID);
    await settle();
    context.assert(
      maxInFlight === 6 && parked.length === 6,
      "label refinement keeps exactly six specs reads parked at once while the family holds eleven documents",
      `max in flight: ${maxInFlight}, parked: ${parked.length}`,
    );
    released = true;
    for (const wake of parked.splice(0)) {
      wake();
    }
    await loading;
    await settle();
    const state = stores.tree.getSnapshot();
    context.assert(state.status === "ready", "the workspace loads to ready once the parked reads release", `status: ${state.status}`);
    context.assert(
      state.documents[`${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`]?.label === "Viewer Behavior"
        && state.documents[`${WORKFLOW_ROOT}/specs/viewer/extra-8.yaml`]?.label === "Extra 8"
        && state.documents[`${WORKFLOW_ROOT}/specs/viewer/extra-1.yaml`]?.label === "Extra 1"
        && state.documents[`${WORKFLOW_ROOT}/specs/INDEX.yaml`]?.artifactType === "spec_index",
      "concurrent refinement lands each label and type on its own document",
    );
    const specsViewer = nodeById(state, `${WORKFLOW_ROOT}/specs/viewer`);
    const specsOrder = (specsViewer?.children ?? []).filter((node) => node.kind === "document").map((node) => node.label);
    context.assert(
      JSON.stringify(specsOrder)
        === JSON.stringify(["Viewer Behavior", "Extra 1", "Extra 2", "Extra 3", "Extra 4", "Extra 5", "Extra 6", "Extra 7", "Extra 8", "widget.yaml"]),
      "the assembled sibling order matches the serial walk's name-sorted listing order",
      `actual: ${JSON.stringify(specsOrder)}`,
    );
    stores.actions.dispose();
  }

  context.section("dsh plugin model: a deleted file's recorded metadata cannot badge its recreation");

  {
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    fake.writeFile(`${WORKFLOW_ROOT}/roadmap/milestones/foundation.yaml`, "artifact_type: roadmap_milestone\nstatus: complete\nmilestone:\n  m1:\n    title: Foundation Milestone\n");
    fake.writeFile(
      `${WORKFLOW_ROOT}/changes/great-change/tasks.yaml`,
      "artifact_type: task_list\nchange: great-change\nsections:\n  Implementation:\n    g1:\n      text: One.\n      status: complete\n",
    );
    const stores = await loadFakeWorkspace(fake);
    const milestonesDir = `${WORKFLOW_ROOT}/roadmap/milestones`;
    const milestonePath = `${milestonesDir}/foundation.yaml`;
    const changeDir = `${WORKFLOW_ROOT}/changes/great-change`;
    const tasksPath = `${changeDir}/tasks.yaml`;
    context.assert(stores.tree.getSnapshot().documents[milestonePath]?.status === "complete", "the loaded milestone records its declared status");
    context.assert(stores.tree.getSnapshot().changeCompletion?.[changeDir]?.total === 1, "the loaded tasks file records its change completion");

    fake.removeFile(milestonePath);
    fake.emit(milestonesDir, "v2");
    await settle();
    fake.writeFile(milestonePath, "milestone: { unclosed\n");
    fake.emit(milestonesDir, "v3");
    await settle();
    const recreated = stores.tree.getSnapshot().documents[milestonePath];
    context.assert(recreated?.status === undefined, "a recreated unparseable milestone carries no status, not its deleted version's", `actual: ${JSON.stringify(recreated?.status)}`);
    context.assert(recreated?.label === "foundation.yaml", "the recreated unparseable milestone falls back to its file name label");

    fake.removeFile(tasksPath);
    fake.emit(changeDir, "v2");
    await settle();
    fake.writeFile(tasksPath, "artifact_type: task_list\nchange: great-change\nsections: [broken\n");
    fake.emit(changeDir, "v3");
    await settle();
    context.assert(
      stores.tree.getSnapshot().changeCompletion?.[changeDir] === undefined,
      "a recreated unparseable tasks file carries no completion badge, not its deleted version's",
      `actual: ${JSON.stringify(stores.tree.getSnapshot().changeCompletion?.[changeDir])}`,
    );
    stores.actions.dispose();
  }

  context.section("dsh plugin model: roadmap facts and archived-milestone ownership");

  {
    // The content pass records the declared identity facts the roadmap
    // views navigate by: a milestone's keyed id and order value, and a
    // planned change's id and owning milestone, refreshed by reloads.
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    fake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/milestones/foundation.yaml`,
      "artifact_type: roadmap_milestone\nmilestone:\n  m1:\n    title: Foundation Milestone\norder: 10\nstatus: complete\n",
    );
    fake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/planned-changes/first-step.yaml`,
      "artifact_type: planned_change\nplanned_change:\n  id: first-step\n  milestone: m1\nstatus: planned\n",
    );
    const stores = await loadFakeWorkspace(fake);
    const documents = stores.tree.getSnapshot().documents;
    const milestone = documents[`${WORKFLOW_ROOT}/roadmap/milestones/foundation.yaml`];
    context.assert(
      milestone?.milestoneId === "m1" && milestone?.milestoneOrder === 10 && milestone?.status === "complete",
      "the content pass records the milestone's keyed id, declared order, and status",
    );
    const plannedChange = documents[`${WORKFLOW_ROOT}/roadmap/planned-changes/first-step.yaml`];
    context.assert(
      plannedChange?.plannedChangeId === "first-step" && plannedChange?.plannedChangeMilestone === "m1" && plannedChange?.status === "planned",
      "the content pass records the planned change's id and owning milestone",
    );

    fake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/milestones/foundation.yaml`,
      "artifact_type: roadmap_milestone\nmilestone:\n  m1:\n    title: Foundation Milestone\norder: 11\nstatus: complete\n",
    );
    fake.emit(`${WORKFLOW_ROOT}/roadmap/milestones`, "v2");
    await settle();
    const refreshed = stores.tree.getSnapshot().documents[`${WORKFLOW_ROOT}/roadmap/milestones/foundation.yaml`];
    context.assert(refreshed?.milestoneOrder === 11, "a changed milestone file recomputes its recorded order through the directory reload");
    stores.actions.dispose();
  }

  {
    // Opening an archived milestone resolves its owned planned changes by
    // reading the archived planned-change files; everything else keeps the
    // ownership listing idle, and archived files stay unread while listed.
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    fake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/archive/milestones/0001-old.yaml`,
      "artifact_type: roadmap_milestone\nmilestone:\n  m1:\n    title: Old Milestone\n",
    );
    fake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/archive/planned-changes/m1-first.yaml`,
      "artifact_type: planned_change\nplanned_change:\n  id: m1-first\n  milestone: m1\nstatus: complete\n",
    );
    fake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/archive/planned-changes/m2-other.yaml`,
      "artifact_type: planned_change\nplanned_change:\n  id: m2-other\n  milestone: m2\nstatus: complete\n",
    );
    const stores = await loadFakeWorkspace(fake);
    context.assert(stores.ownership.getSnapshot().status === "idle", "the ownership listing starts idle");

    await stores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/roadmap/planned-changes/first-step.yaml`);
    await settle();
    context.assert(stores.ownership.getSnapshot().status === "idle", "opening a non-archived planned change keeps the ownership listing idle");

    const roadmapArchiveId = `${WORKFLOW_ROOT}/roadmap/archive`;
    await stores.actions.expandNode(SESSION_ID, roadmapArchiveId);
    await settle();
    context.assert(
      !fake.readBytesCalls.some((call) => call.startsWith(`${roadmapArchiveId}/planned-changes/`)),
      "expanding the archive lists the archived planned changes without reading them",
    );

    await stores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/roadmap/archive/milestones/0001-old.yaml`);
    await settle();
    const ownership = stores.ownership.getSnapshot();
    context.assert(ownership.status === "ready" && ownership.milestoneId === "m1", "opening an archived milestone resolves its ownership listing");
    context.assert(
      ownership.owned.length === 1 && ownership.owned[0]?.id === "m1-first" && ownership.owned[0]?.status === "complete"
        && ownership.owned[0]?.label === "m1-first.yaml",
      "only the archived planned changes whose declared milestone names it are listed, labeled from their file names",
      `actual: ${JSON.stringify(ownership.owned)}`,
    );
    context.assert(
      fake.readBytesCalls.includes(`${roadmapArchiveId}/planned-changes/m2-other.yaml`) === true,
      "resolving ownership reads the archived planned-change files once the archived milestone is open",
    );

    await stores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/roadmap/milestones/foundation.yaml`);
    await settle();
    context.assert(stores.ownership.getSnapshot().status === "idle", "opening a non-archived milestone returns the ownership listing to idle");
    stores.actions.dispose();
    context.assert(stores.ownership.getSnapshot().status === "idle", "disposing the stores resets the ownership listing");
  }

  {
    // An archived milestone whose roadmap archive holds no planned-change
    // directory lists no owned entries rather than failing, and a listing
    // failure other than absence reports the error state.
    const fake = new FakeWorkspaceFiles();
    fake.writeFile(`${WORKFLOW_ROOT}/config.yaml`, "schema: x\nartifact_type: workflow_config\n");
    fake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/INDEX.yaml`,
      "artifact_type: roadmap_index\nmilestones:\n  m1:\n    title: Lone\n    path: roadmap/milestones/lone.yaml\n    status: archived\n",
    );
    fake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/milestones/lone.yaml`,
      "artifact_type: roadmap_milestone\nmilestone:\n  m1:\n    title: Lone\n",
    );
    fake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/archive/milestones/0002-lone.yaml`,
      "artifact_type: roadmap_milestone\nmilestone:\n  m1:\n    title: Lone\n",
    );
    const stores = await loadFakeWorkspace(fake);
    await stores.actions.expandNode(SESSION_ID, `${WORKFLOW_ROOT}/roadmap/archive`);
    await settle();
    await stores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/roadmap/archive/milestones/0002-lone.yaml`);
    await settle();
    const empty = stores.ownership.getSnapshot();
    context.assert(empty.status === "ready" && empty.owned.length === 0, "an archive without planned-change files resolves to an empty owned list");
    stores.actions.dispose();

    const failing = new FakeWorkspaceFiles();
    failing.writeFile(`${WORKFLOW_ROOT}/config.yaml`, "schema: x\nartifact_type: workflow_config\n");
    failing.writeFile(
      `${WORKFLOW_ROOT}/roadmap/archive/milestones/0003-broken.yaml`,
      "artifact_type: roadmap_milestone\nmilestone:\n  m3:\n    title: Broken\n",
    );
    failing.writeFile(
      `${WORKFLOW_ROOT}/roadmap/archive/planned-changes/m3-orphan.yaml`,
      "artifact_type: planned_change\nplanned_change:\n  id: m3-orphan\n  milestone: m3\nstatus: complete\n",
    );
    // The ownership listing fails after the archive expansion succeeded: the
    // first listing of the planned-change directory serves the tree walk,
    // and a later one fails with a code absence never produces, so the
    // resolver reports the error state instead of an empty history.
    let plannedChangeListings = 0;
    const failingPort: WorkspaceFilesPort = {
      list: (sid, dirPath, signal) => {
        if (dirPath === `${WORKFLOW_ROOT}/roadmap/archive/planned-changes`) {
          plannedChangeListings += 1;
          if (plannedChangeListings > 1) {
            return Promise.reject({ code: "workspace-file/permission-denied", path: dirPath });
          }
        }
        return failing.port.list(sid, dirPath, signal);
      },
      read: (sid, dirPath, range, signal) => failing.port.read(sid, dirPath, range, signal),
      readBytes: (sid, dirPath, options, signal) => failing.port.readBytes(sid, dirPath, options, signal),
      changes: (sid, dirPath, signal) => failing.port.changes(sid, dirPath, signal),
    };
    const failingStores = createViewerStores(failingPort);
    await failingStores.actions.loadWorkspace(SESSION_ID);
    await settle();
    await failingStores.actions.expandNode(SESSION_ID, `${WORKFLOW_ROOT}/roadmap/archive`);
    await settle();
    await failingStores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/roadmap/archive/milestones/0003-broken.yaml`);
    await settle();
    context.assert(failingStores.ownership.getSnapshot().status === "error", "a failed archive listing reports the ownership error state");
    failingStores.actions.dispose();
  }

  context.section("dsh plugin model: spec facts and anchored opens");

  {
    // The content pass records the requirement index the scene views
    // navigate by: each non-archived main spec's declared spec id and
    // requirement ids, refreshed by the same directory-watch reloads that
    // keep labels and roadmap facts fresh.
    const fake = new FakeWorkspaceFiles();
    seedFixtureTree(fake);
    fake.writeFile(
      `${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`,
      "artifact_type: main_spec\nspec:\n  id: viewer\n  title: Viewer Behavior\nrequirements:\n  tree-family-order:\n    strength: MUST\n    statement: The tree lists families.\n    scenarios:\n      one:\n        - GIVEN: a workspace\n        - WHEN: the tree renders\n        - THEN: families appear\n  absent-family-omitted:\n    strength: MUST\n    statement: Absent families are omitted.\n    scenarios:\n      two:\n        - GIVEN: no sops directory\n        - WHEN: the tree renders\n        - THEN: the family is omitted\n",
    );
    const stores = await loadFakeWorkspace(fake);
    const documents = stores.tree.getSnapshot().documents;
    const spec = documents[`${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`];
    context.assert(
      spec?.specId === "viewer" && spec?.requirementIds?.length === 2 && spec?.requirementIds[0] === "tree-family-order" && spec?.requirementIds[1] === "absent-family-omitted",
      "the content pass records the spec's declared id and every requirement id in declaration order",
    );
    const scene = documents[`${WORKFLOW_ROOT}/scenes/viewer/browse.yaml`];
    context.assert(scene?.specId === undefined && scene?.requirementIds === undefined, "a non-spec document records no spec facts");

    fake.writeFile(
      `${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`,
      "artifact_type: main_spec\nspec:\n  id: viewer\n  title: Viewer Behavior\nrequirements:\n  lone-requirement:\n    strength: MUST\n    statement: Only one remains.\n    scenarios:\n      one:\n        - GIVEN: a workspace\n        - WHEN: the tree renders\n        - THEN: families appear\n",
    );
    fake.emit(`${WORKFLOW_ROOT}/specs/viewer`, "v2");
    await settle();
    const refreshed = stores.tree.getSnapshot().documents[`${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`];
    context.assert(refreshed?.requirementIds?.length === 1 && refreshed?.requirementIds[0] === "lone-requirement", "a changed spec file recomputes its recorded requirement ids through the directory reload");

    // The anchored open: an anchor names the element the opened document
    // reveals, survives the live refresh of the same document, and clears
    // on the next open that names none.
    const anchor = "strict-spec-req-viewer-lone-requirement";
    await stores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`, anchor);
    context.assert(stores.open.getSnapshot().anchor === anchor, "the open action records the anchor it was opened with");
    fake.emit(`${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`, "v3");
    await settle();
    context.assert(stores.open.getSnapshot().status === "ready" && stores.open.getSnapshot().anchor === anchor, "a live refresh of the anchored document keeps its anchor");
    await stores.actions.openDocument(SESSION_ID, `${WORKFLOW_ROOT}/scenes/viewer/browse.yaml`);
    context.assert(stores.open.getSnapshot().anchor === undefined, "opening another document without an anchor clears the recorded one");
    stores.actions.dispose();
  }
}
