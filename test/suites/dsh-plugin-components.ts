/**
 * The dsh plugin component suite: renders the shared document tree and the
 * generic structured renderer through react-dom/server static rendering —
 * the dsh-free approach the dsh-plugin-client standard fixes — against the
 * scripted workspace fake the model suite uses, plus the pure row-model,
 * keyboard-model, and document-parts cases.
 */
import { readFileSync } from "fs";
import path from "path";
import { CORE_SCHEMA, load } from "js-yaml";
import { TestContext, ROOT } from "../support/harness.js";
import { FakeWorkspaceFiles } from "./dsh-plugin-model.js";
import { createElement, renderToString } from "../../plugins/dsh-strict-spec/test-support/static-render.ts";
import { DocumentTree } from "../../plugins/dsh-strict-spec/src/client/DocumentTree.tsx";
import type { DocumentTreeProps } from "../../plugins/dsh-strict-spec/src/client/DocumentTree.tsx";
import { DocumentView } from "../../plugins/dsh-strict-spec/src/client/DocumentView.tsx";
import type { DocumentViewProps } from "../../plugins/dsh-strict-spec/src/client/DocumentView.tsx";
import { StrictDocumentsPage } from "../../plugins/dsh-strict-spec/src/client/StrictDocumentsPage.tsx";
import { StrictDocumentsTab } from "../../plugins/dsh-strict-spec/src/client/StrictDocumentsTab.tsx";
import { createPageController, createPageSelectionStore } from "../../plugins/dsh-strict-spec/src/model/picker.ts";
import type { PickerCatalog, SessionCatalogPort } from "../../plugins/dsh-strict-spec/src/model/picker.ts";
import { createTabSurfaces } from "../../plugins/dsh-strict-spec/src/model/tab.ts";
import { flattenTreeRows, keyOutcomeFor } from "../../plugins/dsh-strict-spec/src/client/treeRows.ts";
import { documentParts } from "../../plugins/dsh-strict-spec/src/client/documentParts.ts";
import { proposalView, questionsView, tasksView } from "../../plugins/dsh-strict-spec/src/client/changeParts.ts";
import { createViewerStores } from "../../plugins/dsh-strict-spec/src/model/store.ts";
import { en, zh } from "../../plugins/dsh-strict-spec/src/client/locales.ts";
import type { StrictSpecKey } from "../../plugins/dsh-strict-spec/src/client/locales.ts";
import type { DocumentRecord, OpenDocumentState, TreeState } from "../../plugins/dsh-strict-spec/src/model/nodes.ts";

const WORKFLOW_ROOT = ".strict-spec-driven";

/** A deterministic translate stand-in: keys and params verbatim. */
function fakeT(key: StrictSpecKey, params?: Record<string, unknown>): string {
  return params === undefined ? key : `${key}:${JSON.stringify(params)}`;
}

/** Renders the document tree statically over live stores. */
function renderTree(props: DocumentTreeProps): string {
  return renderToString(createElement(DocumentTree, props));
}

/** Renders the document view statically over one open-document state. */
function renderView(state: OpenDocumentState): string {
  return renderToString(createElement(DocumentView, { state, t: fakeT } satisfies DocumentViewProps));
}

/** Yields once so unawaited watch pumps and restores settle. */
async function settle(): Promise<void> {
  for (let round = 0; round < 6; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Writes the fixture workspace the component cases share. */
function seedComponentWorkspace(fake: FakeWorkspaceFiles): void {
  fake.writeFile(`${WORKFLOW_ROOT}/config.yaml`, "schema: strict-spec-driven/config/v1\nartifact_type: workflow_config\n");
  fake.writeFile(`${WORKFLOW_ROOT}/roadmap/INDEX.yaml`, "artifact_type: roadmap_index\n");
  fake.writeFile(
    `${WORKFLOW_ROOT}/roadmap/milestones/foundation.yaml`,
    "artifact_type: roadmap_milestone\nmilestone:\n  m1:\n    title: Foundation Milestone\n    status: complete\n",
  );
  fake.writeFile(
    `${WORKFLOW_ROOT}/roadmap/planned-changes/first-step.yaml`,
    "artifact_type: planned_change\nplanned_change:\n  id: first-step\n  status: planned\n",
  );
  fake.writeFile(`${WORKFLOW_ROOT}/roadmap/archive/2026-01-01-old.yaml`, "artifact_type: planned_change\nplanned_change:\n  id: old\n  status: complete\n");
  fake.writeFile(
    `${WORKFLOW_ROOT}/changes/build-tree/proposal.yaml`,
    "artifact_type: change_proposal\nchange:\n  id: build-tree\n  status: proposed\n",
  );
  fake.writeFile(`${WORKFLOW_ROOT}/changes/archive/2026-01-02-gone/proposal.yaml`, "artifact_type: change_proposal\nchange:\n  id: gone\n");
  fake.writeFile(`${WORKFLOW_ROOT}/specs/INDEX.yaml`, "artifact_type: spec_index\n");
  fake.writeFile(
    `${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`,
    "artifact_type: main_spec\nspec:\n  id: viewer\n  title: Viewer Behavior\n",
  );
}

/** One hand-built tree state for the pure row-model cases. */
function fixtureTreeState(): TreeState {
  const documents: Record<string, DocumentRecord> = {
    [`${WORKFLOW_ROOT}/config.yaml`]: {
      path: `${WORKFLOW_ROOT}/config.yaml`,
      family: "config",
      label: "config.yaml",
      known: true,
      archived: false,
    },
  };
  return {
    status: "ready",
    families: [
      {
        id: `${WORKFLOW_ROOT}/config`,
        kind: "family",
        path: `${WORKFLOW_ROOT}/config`,
        family: "config",
        label: "config",
        archived: false,
        loaded: true,
        truncated: false,
        watch: "none",
        children: [
          {
            id: `${WORKFLOW_ROOT}/config.yaml`,
            kind: "document",
            path: `${WORKFLOW_ROOT}/config.yaml`,
            family: "config",
            label: "config.yaml",
            archived: false,
            loaded: true,
            truncated: false,
            watch: "none",
          },
        ],
      },
      {
        id: `${WORKFLOW_ROOT}/changes`,
        kind: "family",
        path: `${WORKFLOW_ROOT}/changes`,
        family: "changes",
        label: "changes",
        archived: false,
        loaded: true,
        truncated: false,
        watch: "none",
        children: [
          {
            id: `${WORKFLOW_ROOT}/changes/archive`,
            kind: "group",
            path: `${WORKFLOW_ROOT}/changes/archive`,
            family: "changes",
            label: "archive",
            archived: true,
            loaded: false,
            truncated: false,
            watch: "none",
          },
          {
            id: `${WORKFLOW_ROOT}/changes::truncated`,
            kind: "truncation",
            path: `${WORKFLOW_ROOT}/changes`,
            family: "changes",
            label: "",
            archived: false,
            loaded: true,
            truncated: true,
            watch: "none",
          },
        ],
      },
    ],
    documents,
  };
}

export async function runDshPluginComponentSuite(context: TestContext): Promise<void> {
  context.section("dsh plugin components: row model");

  {
    const state = fixtureTreeState();
    const rows = flattenTreeRows(state);
    context.assert(rows.length === 5, "rows flatten both families, the config document, the deferred archive, and the truncation marker", `actual: ${rows.length}`);
    context.assert(rows[0].depth === 0 && rows[1].depth === 1, "a loaded family's children sit one consistent level deeper");
    context.assert(rows[1].count === undefined, "a document row carries no group count");
    const archive = rows.find((row) => row.id === `${WORKFLOW_ROOT}/changes/archive`);
    context.assert(archive !== undefined && archive.archived && archive.open === false && archive.count === undefined, "a deferred archived group renders closed with no assumed count");
    context.assert(rows.some((row) => row.kind === "truncation"), "the truncation marker flattens as its own row");
    const changesFamily = rows.find((row) => row.id === `${WORKFLOW_ROOT}/changes`);
    context.assert(changesFamily?.count === 1, "a loaded group counts its non-marker children", `actual: ${changesFamily?.count}`);
  }

  context.section("dsh plugin components: keyboard model");

  {
    const state = fixtureTreeState();
    const rows = flattenTreeRows(state);
    const configId = `${WORKFLOW_ROOT}/config`;
    context.assert(keyOutcomeFor(rows, configId, "ArrowDown")?.focusId === `${WORKFLOW_ROOT}/config.yaml`, "ArrowDown moves to the next row");
    context.assert(keyOutcomeFor(rows, `${WORKFLOW_ROOT}/config.yaml`, "ArrowUp")?.focusId === configId, "ArrowUp moves to the previous row");
    context.assert(keyOutcomeFor(rows, `${WORKFLOW_ROOT}/config.yaml`, "ArrowLeft")?.focusId === configId, "ArrowLeft on a leaf steps out to its family");
    const archiveId = `${WORKFLOW_ROOT}/changes/archive`;
    context.assert(keyOutcomeFor(rows, archiveId, "ArrowRight")?.activation === "expand", "ArrowRight on a closed group expands it");
    context.assert(keyOutcomeFor(rows, configId, "ArrowRight")?.focusId === `${WORKFLOW_ROOT}/config.yaml`, "ArrowRight on an open group steps into its first child");
    context.assert(keyOutcomeFor(rows, configId, "ArrowLeft")?.activation === "collapse", "ArrowLeft on an open group collapses it");
    context.assert(keyOutcomeFor(rows, configId, "Enter")?.activation === "collapse", "Enter toggles an open group to collapse");
    context.assert(keyOutcomeFor(rows, archiveId, "Enter")?.activation === "expand", "Enter toggles a closed group to expand");
    context.assert(keyOutcomeFor(rows, `${WORKFLOW_ROOT}/config.yaml`, "Enter")?.activation === "open", "Enter on a document opens it");
    context.assert(keyOutcomeFor(rows, undefined, "Home")?.focusId === configId, "Home jumps to the first row");
    context.assert(keyOutcomeFor(rows, configId, "End")?.focusId === rows[rows.length - 1].id, "End jumps to the last row");
    context.assert(keyOutcomeFor(rows, configId, "a") === undefined, "an unhandled key asks for nothing");
  }

  context.section("dsh plugin components: document parts");

  {
    const parts = documentParts({
      schema: "v1",
      count: 3,
      enabled: true,
      summary: "one line",
      details: "line one\nline two",
      requirements: {
        first: { strength: "MUST", statement: "Required." },
      },
      steps: ["a", "b"],
    });
    context.assert(
      JSON.stringify(parts.header.map((field) => field.key)) === JSON.stringify(["schema", "count", "enabled", "summary"]),
      "top-level scalars form the header in declaration order",
    );
    context.assert(parts.header[1].text === "3" && parts.header[2].text === "true", "numbers and booleans keep their YAML spelling");
    const blockKinds = parts.blocks.map((block) => block.kind);
    context.assert(
      JSON.stringify(blockKinds) === JSON.stringify(["paragraph", "section", "list"]),
      "multiline text paragraphs, mappings sections, and sequences lists appear in declaration order",
    );
    const section = parts.blocks[1];
    context.assert(section.kind === "section" && section.fields[0].key === "first", "a top-level mapping value becomes a titled section");
    const nested = section.kind === "section" ? section.fields[0].value : undefined;
    context.assert(nested?.kind === "mapping" && nested.fields[0].key === "strength", "deep nesting stays addressable as collapsible blocks");
    const list = parts.blocks[2];
    context.assert(list.kind === "list" && list.items.length === 2, "a sequence value becomes a list of its items");
    const empty = documentParts(undefined);
    context.assert(empty.header.length === 0 && empty.blocks.length === 0, "a non-mapping root yields the empty-document condition");
  }

  context.section("dsh plugin components: static rendering");

  const fake = new FakeWorkspaceFiles();
  seedComponentWorkspace(fake);
  const stores = createViewerStores(fake.port);
  await stores.actions.loadWorkspace("session-components");
  await settle();

  {
    const state = stores.tree.getSnapshot();
    context.assert(state.status === "ready", "the component workspace loads to ready");
    const milestoneStatus = state.documents[`${WORKFLOW_ROOT}/roadmap/milestones/foundation.yaml`]?.status;
    const plannedStatus = state.documents[`${WORKFLOW_ROOT}/roadmap/planned-changes/first-step.yaml`]?.status;
    context.assert(milestoneStatus === "complete", "a milestone's declared status reaches the documents map", `actual: ${milestoneStatus}`);
    context.assert(plannedStatus === "planned", "a planned change's declared status reaches the documents map", `actual: ${plannedStatus}`);
    const archivedStatus = state.documents[`${WORKFLOW_ROOT}/changes/archive/2026-01-02-gone/proposal.yaml`]?.status;
    context.assert(archivedStatus === undefined, "an archived entry carries no status because its file stays unread");
    const proposalStatus = state.documents[`${WORKFLOW_ROOT}/changes/build-tree/proposal.yaml`]?.status;
    context.assert(proposalStatus === undefined, "a change proposal declares no status the viewer badges", `actual: ${proposalStatus}`);
  }

  {
    const html = renderTree({ sessionId: "session-components", tree: stores.tree, actions: stores.actions, t: fakeT });
    context.assert(html.includes("Foundation Milestone"), "the ready tree renders a milestone label");
    context.assert(html.includes("first-step"), "the ready tree renders a planned-change label");
    context.assert(html.includes("tree.family.changes"), "a family root renders its localized plugin label");
    context.assert(!html.includes(">changes<"), "no family root renders its raw untranslated id");
    context.assert(html.includes(">complete<"), "the ready tree badges a milestone's declared status as its own text node");
    context.assert(html.includes(">planned<"), "the ready tree badges a planned change's declared status as its own text node");
    context.assert(html.includes("tree.group-count:"), "a loaded group renders its entry count");
    context.assert(!html.includes("2026-01-02-gone"), "a collapsed archive's entries stay unrendered");
    context.assert(html.includes('role="tree"'), "the tree carries its tree role");
    context.assert(html.includes('aria-level="2"'), "nested rows carry their aria level");
  }

  {
    const rows = flattenTreeRows(stores.tree.getSnapshot());
    const archiveRow = rows.find((row) => row.id === `${WORKFLOW_ROOT}/changes/archive`);
    context.assert(archiveRow !== undefined, "the collapsed change archive appears as an expandable row");
    if (archiveRow !== undefined) {
      await stores.actions.expandNode("session-components", archiveRow.id);
      await settle();
      const expandedHtml = renderTree({ sessionId: "session-components", tree: stores.tree, actions: stores.actions, t: fakeT });
      context.assert(expandedHtml.includes("2026-01-02-gone"), "expanding the change archive renders its entries");
      context.assert(expandedHtml.includes("proposal.yaml"), "the archived change's document row renders");
      stores.actions.collapseNode("session-components", archiveRow.id);
      const collapsedHtml = renderTree({ sessionId: "session-components", tree: stores.tree, actions: stores.actions, t: fakeT });
      context.assert(!collapsedHtml.includes("2026-01-02-gone"), "collapsing the archive again unrenders its entries");
    }
  }

  {
    fake.truncatedDirs.add(`${WORKFLOW_ROOT}/changes`);
    fake.emit(`${WORKFLOW_ROOT}/changes`, "v2");
    await settle();
    const html = renderTree({ sessionId: "session-components", tree: stores.tree, actions: stores.actions, t: fakeT });
    context.assert(html.includes("tree.truncated"), "a truncated listing renders the explicit truncation notice");
    fake.truncatedDirs.delete(`${WORKFLOW_ROOT}/changes`);
    fake.emit(`${WORKFLOW_ROOT}/changes`, "v3");
    await settle();
  }

  {
    const loadingStores = createViewerStores(fake.port);
    const loadingHtml = renderTree({ sessionId: "session-loading", tree: loadingStores.tree, actions: loadingStores.actions, t: fakeT });
    context.assert(loadingHtml.includes("tree.loading"), "the initial tree state renders the loading condition");

    const emptyFake = new FakeWorkspaceFiles();
    const emptyStores = createViewerStores(emptyFake.port);
    await emptyStores.actions.loadWorkspace("session-empty");
    const emptyHtml = renderTree({ sessionId: "session-empty", tree: emptyStores.tree, actions: emptyStores.actions, t: fakeT });
    context.assert(emptyHtml.includes("tree.empty"), "a workspace without the workflow directory renders the empty condition");

    const errorFake = new FakeWorkspaceFiles();
    seedComponentWorkspace(errorFake);
    errorFake.listFailures.add(WORKFLOW_ROOT);
    const errorStores = createViewerStores(errorFake.port);
    await errorStores.actions.loadWorkspace("session-error");
    const notFoundHtml = renderTree({ sessionId: "session-error", tree: errorStores.tree, actions: errorStores.actions, t: fakeT });
    context.assert(notFoundHtml.includes("tree.empty"), "a missing workflow directory maps to the empty condition, not an error");
    // A listing failure the empty-state mapping does not own surfaces as the
    // error condition; the store state is set directly because the scripted
    // fake throws only the not-found wire error.
    errorStores.tree.set({ status: "error", errorCode: "workspace-file/permission-denied", families: [], documents: {} });
    const errorHtml = renderTree({ sessionId: "session-error", tree: errorStores.tree, actions: errorStores.actions, t: fakeT });
    context.assert(errorHtml.includes("tree.error"), "a failed root listing renders the error condition");
    context.assert(errorHtml.includes("permission-denied"), "the error condition names the failure code");
  }

  context.section("dsh plugin components: document view states");

  {
    context.assert(renderView({ status: "idle" }).includes("view.idle"), "the idle state renders its condition");
    context.assert(renderView({ status: "loading", path: "x" }).includes("view.loading"), "the loading state renders its condition");
    context.assert(renderView({ status: "absent", path: "x" }).includes("view.absent"), "the absent state renders its condition");
    const readErrorHtml = renderView({ status: "error", path: "x", error: { kind: "read", code: "workspace-file/not-found" } });
    context.assert(readErrorHtml.includes("view.error") && readErrorHtml.includes("not-found"), "a read error names its code");
  }

  {
    await stores.actions.openDocument("session-components", `${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`);
    const openState = stores.open.getSnapshot();
    context.assert(openState.status === "ready", "the spec document opens to ready");
    const html = renderView(openState);
    context.assert(html.includes("main_spec"), "a top-level scalar renders in the header");
    context.assert(html.includes("Viewer Behavior"), "the spec section renders its declared title");
    const sectionHtml = renderView({
      status: "ready",
      path: "mixed",
      data: {
        title: "Mixed",
        when: "2026-10-18",
        enabled: true,
        details: "line one\nline two",
        rules: { first: { strength: "MUST", note: "deep" } },
        steps: ["a", "b"],
      },
    });
    context.assert(sectionHtml.includes("2026-10-18"), "a timestamp-like scalar keeps its literal spelling");
    context.assert(sectionHtml.includes("line one"), "multiline text renders as a wrapped paragraph");
    context.assert(sectionHtml.includes("rules"), "a top-level mapping renders as a titled section");
    context.assert(sectionHtml.includes("<ul"), "a top-level sequence renders as a list");
    context.assert(sectionHtml.includes(">first<"), "deep nesting renders its collapsible block titled with the field key");
    context.assert(!sectionHtml.includes("strength"), "the collapsible block renders collapsed by default, keeping its nested fields unrendered");
    const emptyDocHtml = renderView({ status: "ready", path: "empty", data: undefined });
    context.assert(emptyDocHtml.includes("view.empty-document"), "a document with no fields renders the empty-document condition");
  }

  {
    // End-to-end through the real loader: unquoted YAML 1.1 dates and yes/no
    // scalars keep their literal spelling under the core schema parse.
    fake.writeFile(
      `${WORKFLOW_ROOT}/changes/dated/proposal.yaml`,
      "change:\n  id: dated\n  when: 2026-10-18\n  flag: yes\n",
    );
    fake.emit(`${WORKFLOW_ROOT}/changes`, "v4");
    await settle();
    await stores.actions.openDocument("session-components", `${WORKFLOW_ROOT}/changes/dated/proposal.yaml`);
    const datedState = stores.open.getSnapshot();
    context.assert(datedState.status === "ready", "the dated document opens to ready");
    const datedHtml = renderView(datedState);
    context.assert(datedHtml.includes("2026-10-18"), "an unquoted YAML date renders with its literal spelling");
    context.assert(datedHtml.includes(">yes<"), "an unquoted YAML 1.1 boolean-like scalar renders verbatim, not coerced");
  }

  {
    fake.writeFile(`${WORKFLOW_ROOT}/changes/broken/proposal.yaml`, "artifact_type: change_proposal\nchange:\n  id: broken\n  broken: [unclosed\n");
    await stores.actions.openDocument("session-components", `${WORKFLOW_ROOT}/changes/broken/proposal.yaml`);
    const errorState = stores.open.getSnapshot();
    context.assert(errorState.status === "error" && errorState.error?.kind === "parse", "malformed YAML opens to a parse error");
    if (errorState.error?.kind === "parse") {
      context.assert(errorState.error.line >= 1 && errorState.error.column >= 1, "the parse error carries a 1-based line and column");
      context.assert(errorState.error.raw.includes("broken: [unclosed"), "the parse error carries the raw document text");
      const html = renderView(errorState);
      context.assert(html.includes("view.parse-error"), "the parse-error view renders its located message");
      context.assert(html.includes("broken: [unclosed"), "the parse-error view shows the raw text beside the message");
      context.assert(html.includes("view.raw-text"), "the raw text carries its heading");
    }
    const treeHtml = renderTree({ sessionId: "session-components", tree: stores.tree, actions: stores.actions, t: fakeT });
    context.assert(treeHtml.includes("Foundation Milestone"), "the tree keeps rendering after a parse error");
  }

  context.section("dsh plugin components: expand-state persistence");

  {
    // Opening an archived document must not badge its row after a watch-driven
    // reload recomputes the documents map: archived entries stay badge-less.
    const badgeFake = new FakeWorkspaceFiles();
    seedComponentWorkspace(badgeFake);
    const badgeStores = createViewerStores(badgeFake.port);
    const roadmapArchiveId = `${WORKFLOW_ROOT}/roadmap/archive`;
    const archivedPath = `${roadmapArchiveId}/2026-01-01-old.yaml`;
    await badgeStores.actions.loadWorkspace("session-badge");
    await badgeStores.actions.expandNode("session-badge", roadmapArchiveId);
    await badgeStores.actions.openDocument("session-badge", archivedPath);
    const opened = badgeStores.open.getSnapshot();
    context.assert(opened.status === "ready" && opened.path === archivedPath, "the archived planned change opens in the view");
    badgeFake.emit(roadmapArchiveId, "v2");
    await settle();
    const reloadedStatus = badgeStores.tree.getSnapshot().documents[archivedPath]?.status;
    context.assert(reloadedStatus === undefined, "an archived row carries no status badge after open and reload", `actual: ${reloadedStatus}`);
    badgeStores.actions.dispose();
  }

  {
    const persistFake = new FakeWorkspaceFiles();
    seedComponentWorkspace(persistFake);
    const persistStores = createViewerStores(persistFake.port);
    const archiveId = `${WORKFLOW_ROOT}/changes/archive`;
    const findArchive = (state: TreeState): { loaded: boolean } | undefined => {
      for (const family of state.families) {
        for (const child of family.children ?? []) {
          if (child.id === archiveId) {
            return { loaded: child.loaded };
          }
        }
      }
      return undefined;
    };
    await persistStores.actions.loadWorkspace("session-a");
    await persistStores.actions.expandNode("session-a", archiveId);
    context.assert(findArchive(persistStores.tree.getSnapshot())?.loaded === true, "the archive expanded on session A");
    persistFake.listCounts.set(archiveId, 0);
    await persistStores.actions.loadWorkspace("session-b");
    context.assert(findArchive(persistStores.tree.getSnapshot())?.loaded === false, "session B shows the archive collapsed: choices are per workspace");
    context.assert((persistFake.listCounts.get(archiveId) ?? 0) === 0, "no archive listing happened while collapsed");
    await persistStores.actions.loadWorkspace("session-a");
    await settle();
    context.assert(findArchive(persistStores.tree.getSnapshot())?.loaded === true, "returning to session A restores its expanded archive");
    context.assert((persistFake.listCounts.get(archiveId) ?? 0) === 1, "the restored expansion read the archive exactly once more");
  }

  context.section("dsh plugin components: strict documents page");

  {
    // A scripted picker catalog: two workspaces (one sessionless) plus an
    // ungrouped tail, mirroring the grouping the model suite asserts.
    const catalog: PickerCatalog = {
      workspaces: [
        {
          workspaceId: "w-alpha",
          title: "Alpha",
          path: "/home/op/alpha",
          sessions: [
            { sessionId: "session-components", displayTitle: "New session", updatedAt: 30 },
            { sessionId: "session-old", displayTitle: "Old session", updatedAt: 10 },
          ],
        },
        { workspaceId: "w-empty", title: "Empty", path: "/home/op/empty", sessions: [] },
      ],
      ungrouped: [{ sessionId: "session-free", displayTitle: "Ungrouped session", updatedAt: 15 }],
      status: "ready",
    };
    const pickerListeners = new Set<() => void>();
    const picker: SessionCatalogPort = {
      getCatalog: () => catalog,
      subscribe: (listener) => (pickerListeners.add(listener), () => pickerListeners.delete(listener)),
    };

    const fake = new FakeWorkspaceFiles();
    seedComponentWorkspace(fake);
    const stores = createViewerStores(fake.port);
    await stores.actions.loadWorkspace("session-components");
    await settle();
    const page = createPageSelectionStore();

    // Two-pane layout over a chosen Session: tree pane left, document pane
    // right, picker grouped by workspace with newest-first members.
    page.actions.chooseSession("w-alpha", "session-components");
    await stores.actions.openDocument("session-components", `${WORKFLOW_ROOT}/config.yaml`);
    page.actions.recordDocument(`${WORKFLOW_ROOT}/config.yaml`);
    await settle();
    const pageHtml = renderToString(
      createElement(StrictDocumentsPage, { picker, pageSelection: page.store, pageActions: page.actions, controller: createPageController(stores, page.store), viewer: stores, t: fakeT }),
    );
    context.assert(pageHtml.includes('aria-label="page.tree-pane"') && pageHtml.includes('aria-label="page.document-pane"'), "the page renders both named panes");
    context.assert(pageHtml.indexOf('aria-label="page.tree-pane"') < pageHtml.indexOf('aria-label="page.document-pane"'), "the tree pane precedes the document pane");
    context.assert(pageHtml.includes('role="tree"'), "the left pane carries the shared tree");
    context.assert(pageHtml.includes("<optgroup"), "the picker groups its sessions under workspaces");
    context.assert(pageHtml.includes('label="Alpha"') && pageHtml.includes('label="Empty"'), "every workspace renders as a picker group, including the sessionless one");
    context.assert(
      pageHtml.indexOf("New session") < pageHtml.indexOf("Old session"),
      "workspace members render newest-first in the picker",
    );
    context.assert(pageHtml.includes('value="workspace:w-empty"') && pageHtml.includes("page.workspace-empty"), "a sessionless workspace offers its prompt option");
    context.assert(pageHtml.includes("workflow_config"), "the right pane renders the restored document's structured fields");

    // Selection restore: reopening with the recorded selection renders the
    // same Session tree and the recorded document without a new choice.
    const reopened = renderToString(
      createElement(StrictDocumentsPage, { picker, pageSelection: page.store, pageActions: page.actions, controller: createPageController(stores, page.store), viewer: stores, t: fakeT }),
    );
    context.assert(reopened.includes('role="tree"') && reopened.includes("workflow_config"), "a reopened page restores the chosen session and its selected document");
    context.assert(reopened.includes('value="session:session-components"'), "the picker value reflects the restored session");

    // No-Session prompt: a workspace-only selection reads nothing.
    const promptPage = createPageSelectionStore();
    promptPage.actions.chooseWorkspace("w-empty", false);
    const promptHtml = renderToString(
      createElement(StrictDocumentsPage, { picker, pageSelection: promptPage.store, pageActions: promptPage.actions, controller: createPageController(stores, promptPage.store), viewer: stores, t: fakeT }),
    );
    context.assert(promptHtml.includes("page.no-session-prompt"), "a sessionless workspace shows the open-a-Session prompt");
    context.assert(!promptHtml.includes('role="tree"'), "the prompt state renders no document tree and reads no files");

    // Returning-operator prompt: after a Session was chosen, picking the
    // sessionless Workspace option reaches the prompt instead of snapping
    // back to the stale Session.
    const returningPage = createPageSelectionStore();
    returningPage.actions.chooseSession("w-alpha", "session-components");
    returningPage.actions.recordDocument(`${WORKFLOW_ROOT}/config.yaml`);
    returningPage.actions.chooseWorkspace("w-empty", false);
    const returningHtml = renderToString(
      createElement(StrictDocumentsPage, { picker, pageSelection: returningPage.store, pageActions: returningPage.actions, controller: createPageController(stores, returningPage.store), viewer: stores, t: fakeT }),
    );
    context.assert(returningHtml.includes("page.no-session-prompt"), "choosing the sessionless workspace after a session still reaches the prompt");
    context.assert(returningHtml.includes('value="workspace:w-empty"'), "the picker holds the sessionless workspace option");
    context.assert(!returningHtml.includes('role="tree"'), "the returning-operator prompt state renders no document tree");

    // Catalog status and empty-host conditions.
    const loadingPicker: SessionCatalogPort = { getCatalog: () => ({ ...catalog, status: "loading" }), subscribe: (listener) => (pickerListeners.add(listener), () => pickerListeners.delete(listener)) };
    const loadingHtml = renderToString(
      createElement(StrictDocumentsPage, { picker: loadingPicker, pageSelection: page.store, pageActions: page.actions, controller: createPageController(stores, page.store), viewer: stores, t: fakeT }),
    );
    context.assert(loadingHtml.includes("page.loading") && !loadingHtml.includes("<select"), "a loading catalog shows the loading condition and no picker");
    const errorPicker: SessionCatalogPort = { getCatalog: () => ({ ...catalog, status: "error" }), subscribe: (listener) => (pickerListeners.add(listener), () => pickerListeners.delete(listener)) };
    context.assert(
      renderToString(createElement(StrictDocumentsPage, { picker: errorPicker, pageSelection: page.store, pageActions: page.actions, controller: createPageController(stores, page.store), viewer: stores, t: fakeT })).includes("page.error"),
      "a failed catalog shows the error condition",
    );
    const emptyPage = createPageSelectionStore();
    const emptyPicker: SessionCatalogPort = { getCatalog: () => ({ workspaces: [], ungrouped: [], status: "ready" }), subscribe: (listener) => (pickerListeners.add(listener), () => pickerListeners.delete(listener)) };
    const emptyHtml = renderToString(
      createElement(StrictDocumentsPage, { picker: emptyPicker, pageSelection: emptyPage.store, pageActions: emptyPage.actions, controller: createPageController(stores, emptyPage.store), viewer: stores, t: fakeT }),
    );
    context.assert(emptyHtml.includes("page.no-sessions") && !emptyHtml.includes("<select"), "a sessionless host shows the no-sessions state and no picker");
    context.assert(!emptyHtml.includes('role="alert"') && emptyHtml.includes('role="status"'), "the empty state is a status, not an alert");

    stores.actions.dispose();
  }

  context.section("dsh plugin components: strict documents right-sidebar tab body");

  {
    // The Session-bound pane-width surface: the seat's inject factory hands
    // the body one per-Session surface, whose controller has already loaded
    // the workspace and opened a document.
    const fake = new FakeWorkspaceFiles();
    seedComponentWorkspace(fake);
    const surfaces = createTabSurfaces(fake.port);
    const surface = surfaces.get("session-components");
    surface.controller.show();
    await settle();
    await surface.viewer.actions.openDocument("session-components", `${WORKFLOW_ROOT}/config.yaml`);
    await settle();

    const tabHtml = renderToString(createElement(StrictDocumentsTab, { surface, t: fakeT }));
    context.assert(
      tabHtml.includes('aria-label="tab.tree-region"') && tabHtml.includes('aria-label="tab.document-region"'),
      "the tab renders both named regions",
    );
    context.assert(
      tabHtml.indexOf('aria-label="tab.tree-region"') < tabHtml.indexOf('aria-label="tab.document-region"'),
      "the tree region stacks above the document region for the pane width",
    );
    context.assert(tabHtml.includes('role="tree"'), "the tab carries the shared tree");
    context.assert(tabHtml.includes("workflow_config"), "the tab renders the open document's structured fields under the tree");
    surfaces.dispose();

    // Empty state: a workspace without .strict-spec-driven/ shows the
    // explicit empty condition instead of a document tree.
    const emptyFake = new FakeWorkspaceFiles();
    const emptySurfaces = createTabSurfaces(emptyFake.port);
    const emptySurface = emptySurfaces.get("session-empty");
    emptySurface.controller.show();
    await settle();
    const emptyHtml = renderToString(createElement(StrictDocumentsTab, { surface: emptySurface, t: fakeT }));
    context.assert(emptyHtml.includes("tree.empty"), "a workspace without the workflow directory shows the empty state in the tab");
    context.assert(!emptyHtml.includes('role="tree"'), "the empty tab renders no document tree");
    emptySurfaces.dispose();
  }

  context.section("dsh plugin components: dedicated change artifact renderers");

  {
    // Renderer cases consume the registered strict example of each artifact
    // type, so a schema change that breaks a renderer fails the suite rather
    // than silently degrading the view.
    const readExample = (name: string): unknown =>
      load(readFileSync(path.join(ROOT, "examples", "strict-spec-driven", name), "utf8"), { schema: CORE_SCHEMA });
    const renderData = (data: unknown): string => renderView({ status: "ready", path: "example", data });

    const proposalExample = readExample("change-proposal.yaml");
    const proposalModel = proposalView(proposalExample);
    context.assert(proposalModel.body.change?.id === "example-change" && proposalModel.body.change?.status === "proposed", "the proposal view model reads the change identity");
    context.assert(proposalModel.additional.length === 0, "the registered example's fields are all presented, leaving no additional fields");
    const proposalHtml = renderData(proposalExample);
    context.assert(proposalHtml.includes("proposal.what") && proposalHtml.includes("proposal.out"), "the proposal view renders its summary and scope sections");
    context.assert(proposalHtml.includes("Add one observable workflow behavior."), "the proposal view renders a declared what entry");
    context.assert(proposalHtml.includes("example-change") && proposalHtml.includes("proposed"), "the proposal view renders the change identity and status");
    context.assert(proposalHtml.includes("example-milestone"), "the proposal view renders the roadmap link");
    context.assert(!proposalHtml.includes("view.additional-fields"), "no additional-fields section renders when every field is presented");

    const extendedModel = proposalView({ ...proposalExample, review_notes: { owner: "unassigned" } });
    context.assert(extendedModel.additional.length === 1 && extendedModel.additional[0]?.title === "review_notes", "an unrecognized top-level field partitions into the additional blocks");
    const extendedHtml = renderData({ ...proposalExample, review_notes: { owner: "unassigned" } });
    context.assert(extendedHtml.includes("view.additional-fields"), "an unrecognized top-level field renders under the additional-fields section");
    context.assert(extendedHtml.includes("review_notes") && extendedHtml.includes("unassigned"), "the unrecognized field's content renders through the generic structure");

    const designHtml = renderData(readExample("change-design.yaml"));
    context.assert(designHtml.includes("design.approach") && designHtml.includes("Update the relevant workflow artifact."), "the design view renders the approach");
    context.assert(designHtml.includes("design.decisions") && designHtml.includes("use-structured-yaml"), "the design view renders decisions with their ids");
    context.assert(designHtml.includes("Structured fields can be parsed deterministically"), "the design view renders a decision's rationale");
    context.assert(designHtml.includes("design.alternatives") && designHtml.includes("Keep prose-only Markdown conventions."), "the design view renders rejected alternatives");

    const tasksExample = readExample("task-list.yaml");
    const tasksModel = tasksView(tasksExample);
    context.assert(tasksModel.body.overall?.done === 0 && tasksModel.body.overall?.total === 4, "the tasks view model counts the declared statuses");
    context.assert(tasksModel.body.gates?.validationTask === "validate-example" && tasksModel.body.gates?.unitTestTask === "unit-test-example", "the tasks view model reads the testing gates");
    const tasksHtml = renderData(tasksExample);
    context.assert(tasksHtml.includes("tasks.overall:{&quot;done&quot;:0,&quot;total&quot;:4}"), "the tasks view renders the overall completion");
    context.assert(tasksHtml.includes("tasks.completion:{&quot;done&quot;:0,&quot;total&quot;:2}"), "each section renders its own completed-over-total count");
    context.assert(tasksHtml.includes(">Implementation<") && tasksHtml.includes(">Testing<") && tasksHtml.includes(">Verification<"), "the tasks view groups by declared section");
    context.assert(tasksHtml.includes("tasks.pending") && !tasksHtml.includes("tasks.done"), "each pending task carries its marker from the declared status");
    context.assert(tasksHtml.includes("implement-example"), "the tasks view renders task ids");
    context.assert(tasksHtml.includes("npm run build"), "the tasks view renders a task's recorded command");
    context.assert(tasksHtml.includes("tasks.gates") && tasksHtml.includes("unit-test-example"), "the tasks view renders the testing gates");

    const questionsExample = readExample("question-list.open.yaml");
    const questionsModel = questionsView(questionsExample);
    context.assert(questionsModel.body.open.length === 2 && questionsModel.body.resolved.length === 2, "the questions view model separates open from resolved");
    const questionsHtml = renderData(questionsExample);
    context.assert(questionsHtml.includes("questions.open") && questionsHtml.includes("questions.resolved"), "the questions view renders both groups");
    context.assert(questionsHtml.indexOf("questions.open") < questionsHtml.indexOf("questions.resolved"), "open questions render before resolved ones");
    context.assert(questionsHtml.includes("requirement-problem") && questionsHtml.includes("choose-example"), "the questions view renders question ids");
    context.assert(questionsHtml.includes("The overnight failure count is visible without opening any dashboard."), "the questions view renders a resolved question's answer");

    const deltaOpsHtml = renderData(readExample("delta-spec.operations.yaml"));
    context.assert(deltaOpsHtml.includes("delta.target-spec") && deltaOpsHtml.includes("example-spec"), "the delta spec view renders its target");
    context.assert(deltaOpsHtml.includes(">ADDED<") && deltaOpsHtml.includes(">MODIFIED<") && deltaOpsHtml.includes(">REMOVED<"), "each operation group renders its declared operation label");
    context.assert(deltaOpsHtml.includes("added-requirement") && deltaOpsHtml.includes("MUST"), "requirement bodies render with id and strength");
    context.assert(deltaOpsHtml.includes("added-success") && deltaOpsHtml.includes(">GIVEN<"), "scenario bodies render their declared steps");

    const newSpecHtml = renderData(readExample("delta-spec.new-spec.yaml"));
    context.assert(newSpecHtml.includes("delta.new-spec") && newSpecHtml.includes("Example New Spec"), "a delta creating a spec renders its title");
    context.assert(newSpecHtml.includes(".strict-spec-driven/specs/example/new-spec.yaml"), "a delta creating a spec renders its path");

    const sceneHtml = renderData(readExample("delta-scene.yaml"));
    context.assert(sceneHtml.includes("delta.target-scene") && sceneHtml.includes("checkout-flow"), "the delta scene view renders its target");
    context.assert(sceneHtml.includes(">ADDED<") && sceneHtml.includes(">MODIFIED<") && sceneHtml.includes(">REMOVED<"), "each scene operation group renders its declared operation label");
    context.assert(sceneHtml.includes("delta.main-flow") && sceneHtml.includes("confirm-order"), "main flow steps render under their label");
    context.assert(sceneHtml.includes("commerce-checkout:order-total-is-confirmed"), "a step's covering reference renders as spec:requirement");
    context.assert(sceneHtml.includes("delta.trigger") && sceneHtml.includes("payment-declined") && sceneHtml.includes("delta.no-coverage"), "exception flows render trigger, steps, and no-coverage reasons");

    const techOpsHtml = renderData(readExample("delta-tech.operations.yaml"));
    context.assert(techOpsHtml.includes("delta.target-standard") && techOpsHtml.includes("example-standard"), "the delta tech view renders its target");
    context.assert(techOpsHtml.includes(">ADDED<") && techOpsHtml.includes(">MODIFIED<") && techOpsHtml.includes(">REMOVED<"), "each rule operation group renders its declared operation label");
    context.assert(techOpsHtml.includes("added-rule") && techOpsHtml.includes("Modules MUST follow the added engineering rule."), "rule bodies render with id and statement");
    context.assert(techOpsHtml.includes("delta.enforcement") && techOpsHtml.includes("Reviewers reject code that violates the added rule."), "rule enforcement renders with its method detail");
    const techExamplesHtml = renderData({
      artifact_type: "delta_tech",
      target_standard: "example-standard",
      operations: {
        ADDED: {
          "rule-with-examples": {
            strength: "SHOULD",
            statement: "A rule body with examples.",
            rationale: "Because examples teach.",
            enforcement: { method: "review", detail: "Reviewers check." },
            examples: { good: ["A good case."], bad: ["A bad case."] },
          },
        },
      },
    });
    context.assert(techExamplesHtml.includes("delta.example-good") && techExamplesHtml.includes("A good case."), "good examples render with their label");
    context.assert(techExamplesHtml.includes("delta.example-bad") && techExamplesHtml.includes("A bad case."), "bad examples render with their label");

    const configHtml = renderData(readExample("config.yaml"));
    context.assert(configHtml.includes("preferred_human_language"), "an artifact type without a dedicated renderer keeps the generic view");
    context.assert(!configHtml.includes("proposal.what") && !configHtml.includes("view.additional-fields"), "no dedicated layout or additional section applies to an unserved type");

    const archivedTasks = load(
      readFileSync(path.join(ROOT, ".strict-spec-driven", "changes", "archive", "2026-10-18-register-right-sidebar-tab", "tasks.yaml"), "utf8"),
      { schema: CORE_SCHEMA },
    );
    const archivedHtml = renderData(archivedTasks);
    context.assert(archivedHtml.includes("tasks.overall:{&quot;done&quot;:14,&quot;total&quot;:14}"), "an archived change's tasks render through the same dedicated view as an active change's");
    context.assert(archivedHtml.includes("tasks.done") && !archivedHtml.includes("tasks.pending"), "a completed task renders its Done marker from the declared status");
  }

  context.section("dsh plugin components: change completion badge");

  {
    // An isolated workspace: one active change with mixed task statuses and
    // an archived change whose files stay unread while it is only listed.
    const badgeFake = new FakeWorkspaceFiles();
    badgeFake.writeFile(`${WORKFLOW_ROOT}/config.yaml`, "schema: strict-spec-driven/config/v1\nartifact_type: workflow_config\n");
    badgeFake.writeFile(`${WORKFLOW_ROOT}/changes/alpha/proposal.yaml`, "artifact_type: change_proposal\nchange:\n  id: alpha\n");
    badgeFake.writeFile(
      `${WORKFLOW_ROOT}/changes/alpha/tasks.yaml`,
      "artifact_type: task_list\nchange: alpha\nsections:\n  Implementation:\n    a1:\n      text: One.\n      status: complete\n    a2:\n      text: Two.\n      status: pending\n",
    );
    badgeFake.writeFile(
      `${WORKFLOW_ROOT}/changes/archive/2026-01-01-beta/tasks.yaml`,
      "artifact_type: task_list\nchange: beta\nsections:\n  Implementation:\n    b1:\n      text: Done.\n      status: complete\n",
    );
    const badgeStores = createViewerStores(badgeFake.port);
    await badgeStores.actions.loadWorkspace("session-badge");
    await settle();

    const badgeRows = flattenTreeRows(badgeStores.tree.getSnapshot());
    const alphaRow = badgeRows.find((row) => row.id === `${WORKFLOW_ROOT}/changes/alpha`);
    context.assert(alphaRow?.taskCompletion?.done === 1 && alphaRow?.taskCompletion?.total === 2, "a non-archived change group row carries its counted completion");
    const archivedChangeRow = badgeRows.find((row) => row.id === `${WORKFLOW_ROOT}/changes/archive/2026-01-01-beta`);
    context.assert(archivedChangeRow === undefined, "an archived change group stays deferred, so it carries no badge row at all");

    // Expanding the archive lists the archived change group without badging
    // it: its files stay unread while it is only listed.
    const archiveGroup = badgeRows.find((row) => row.id === `${WORKFLOW_ROOT}/changes/archive`);
    if (archiveGroup !== undefined) {
      await badgeStores.actions.expandNode("session-badge", archiveGroup.id);
      await settle();
      const listedRow = flattenTreeRows(badgeStores.tree.getSnapshot()).find((row) => row.id === `${WORKFLOW_ROOT}/changes/archive/2026-01-01-beta`);
      context.assert(listedRow !== undefined, "expanding the archive lists the archived change group");
      context.assert(listedRow?.taskCompletion === undefined, "a listed archived change group carries no completion badge");
    }


    const badgeHtml = renderTree({ sessionId: "session-badge", tree: badgeStores.tree, actions: badgeStores.actions, t: fakeT });
    context.assert(badgeHtml.includes("tree.task-completion:{&quot;done&quot;:1,&quot;total&quot;:2}"), "the tree renders the change group's completion badge");

    // The badge refreshes from the same live-refresh reload that watches the
    // change directory: an edited tasks file recomputes the count.
    badgeFake.writeFile(
      `${WORKFLOW_ROOT}/changes/alpha/tasks.yaml`,
      "artifact_type: task_list\nchange: alpha\nsections:\n  Implementation:\n    a1:\n      text: One.\n      status: complete\n    a2:\n      text: Two.\n      status: complete\n",
    );
    badgeFake.emit(`${WORKFLOW_ROOT}/changes/alpha`, "v2");
    await settle();
    const refreshedRow = flattenTreeRows(badgeStores.tree.getSnapshot()).find((row) => row.id === `${WORKFLOW_ROOT}/changes/alpha`);
    context.assert(refreshedRow?.taskCompletion?.done === 2 && refreshedRow?.taskCompletion?.total === 2, "an edited tasks file recomputes the badge without a manual reload");
    const refreshedHtml = renderTree({ sessionId: "session-badge", tree: badgeStores.tree, actions: badgeStores.actions, t: fakeT });
    context.assert(refreshedHtml.includes("tree.task-completion:{&quot;done&quot;:2,&quot;total&quot;:2}"), "the rendered badge shows the recomputed completion");

    badgeStores.actions.dispose();
  }

  context.section("dsh plugin components: locale catalogs");

  {
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    context.assert(
      zhKeys.length === enKeys.length && zhKeys.every((key, index) => key === enKeys[index]),
      "the zh and en catalogs declare exactly the same keys",
      `zh: ${zhKeys.join(",")} en: ${enKeys.join(",")}`,
    );
    const treeKeys = ["tree.label", "tree.family.changes", "tree.family.design-system", "tree.family.sops", "tree.loading", "tree.empty", "tree.error", "tree.root-truncated", "tree.truncated", "tree.group-count", "tree.task-completion"];
    context.assert(treeKeys.every((key) => key in zh), "every tree string is registered in both catalogs");
    const viewKeys = ["view.idle", "view.loading", "view.absent", "view.error", "view.parse-error", "view.raw-text", "view.empty-document", "view.additional-fields"];
    context.assert(viewKeys.every((key) => key in zh), "every document-view string is registered in both catalogs");
    const pageKeys = ["page.picker-label", "page.picker-placeholder", "page.workspace-empty", "page.workspace-other", "page.loading", "page.error", "page.no-sessions", "page.no-session-prompt", "page.tree-pane", "page.document-pane"];
    context.assert(pageKeys.every((key) => key in zh), "every strict-documents-page string is registered in both catalogs");
    const tabKeys = ["tab.title", "tab.guide-title", "tab.guide-description", "tab.tree-region", "tab.document-region"];
    context.assert(tabKeys.every((key) => key in zh), "every strict-documents-tab string is registered in both catalogs");
    const rendererKeys = [
      "proposal.what", "proposal.why", "proposal.in", "proposal.out", "proposal.unchanged", "proposal.roadmap", "proposal.roadmap-milestone", "proposal.roadmap-planned-change", "proposal.change-id", "proposal.change-status",
      "design.approach", "design.decisions", "design.rationale", "design.alternatives", "design.reason", "design.risks",
      "tasks.overall", "tasks.completion", "tasks.done", "tasks.pending", "tasks.command", "tasks.gates", "tasks.gate-validation", "tasks.gate-unit-test",
      "questions.open", "questions.resolved", "questions.context", "questions.answer",
      "delta.target-spec", "delta.new-spec", "delta.target-scene", "delta.target-standard", "delta.new-standard", "delta.main-flow", "delta.exception-flow", "delta.trigger", "delta.reason", "delta.rationale", "delta.enforcement", "delta.example-good", "delta.example-bad", "delta.no-coverage",
    ];
    context.assert(rendererKeys.every((key) => key in zh), "every dedicated-renderer string is registered in both catalogs");
  }

  stores.actions.dispose();
}
