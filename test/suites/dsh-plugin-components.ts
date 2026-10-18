/**
 * The dsh plugin component suite: renders the shared document tree and the
 * generic structured renderer through react-dom/server static rendering —
 * the dsh-free approach the dsh-plugin-client standard fixes — against the
 * scripted workspace fake the model suite uses, plus the pure row-model,
 * keyboard-model, and document-parts cases.
 */
import { TestContext } from "../support/harness.js";
import { FakeWorkspaceFiles } from "./dsh-plugin-model.js";
import { createElement, renderToString } from "../../plugins/dsh-strict-spec/test-support/static-render.ts";
import { DocumentTree } from "../../plugins/dsh-strict-spec/src/client/DocumentTree.tsx";
import type { DocumentTreeProps } from "../../plugins/dsh-strict-spec/src/client/DocumentTree.tsx";
import { DocumentView } from "../../plugins/dsh-strict-spec/src/client/DocumentView.tsx";
import type { DocumentViewProps } from "../../plugins/dsh-strict-spec/src/client/DocumentView.tsx";
import { flattenTreeRows, keyOutcomeFor } from "../../plugins/dsh-strict-spec/src/client/treeRows.ts";
import { documentParts } from "../../plugins/dsh-strict-spec/src/client/documentParts.ts";
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
      "artifact_type: change_proposal\nchange:\n  id: dated\n  when: 2026-10-18\n  flag: yes\n",
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

  context.section("dsh plugin components: locale catalogs");

  {
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    context.assert(
      zhKeys.length === enKeys.length && zhKeys.every((key, index) => key === enKeys[index]),
      "the zh and en catalogs declare exactly the same keys",
      `zh: ${zhKeys.join(",")} en: ${enKeys.join(",")}`,
    );
    const treeKeys = ["tree.label", "tree.family.changes", "tree.family.design-system", "tree.family.sops", "tree.loading", "tree.empty", "tree.error", "tree.root-truncated", "tree.truncated", "tree.group-count"];
    context.assert(treeKeys.every((key) => key in zh), "every tree string is registered in both catalogs");
    const viewKeys = ["view.idle", "view.loading", "view.absent", "view.error", "view.parse-error", "view.raw-text", "view.empty-document"];
    context.assert(viewKeys.every((key) => key in zh), "every document-view string is registered in both catalogs");
  }

  stores.actions.dispose();
}
