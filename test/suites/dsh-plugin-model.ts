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
import { FAMILY_ORDER } from "../../plugins/dsh-strict-spec/src/model/nodes.ts";
import type { DocumentNode, TreeState } from "../../plugins/dsh-strict-spec/src/model/nodes.ts";
import { createViewerStores } from "../../plugins/dsh-strict-spec/src/model/store.ts";
import type { ViewerStores } from "../../plugins/dsh-strict-spec/src/model/store.ts";

const SESSION_ID = "session-model-test";
const WORKFLOW_ROOT = ".strict-spec-driven";

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
}
