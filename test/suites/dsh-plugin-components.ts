/**
 * The dsh plugin component suite: renders the shared document tree and the
 * generic structured renderer through react-dom/server static rendering —
 * the dsh-free approach the dsh-plugin-client standard fixes — against the
 * scripted workspace fake the model suite uses, plus the pure row-model,
 * keyboard-model, and document-parts cases.
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { CORE_SCHEMA, load } from "js-yaml";
import { TestContext, ROOT } from "../support/harness.js";
import { FakeWorkspaceFiles } from "./dsh-plugin-model.js";
import { createElement, renderToString } from "../../plugins/dsh-strict-spec/test-support/static-render.ts";
import { DocumentTree, TreeRowView } from "../../plugins/dsh-strict-spec/src/client/DocumentTree.tsx";
import type { DocumentTreeProps } from "../../plugins/dsh-strict-spec/src/client/DocumentTree.tsx";
import { DocumentView } from "../../plugins/dsh-strict-spec/src/client/DocumentView.tsx";
import type { DocumentViewProps } from "../../plugins/dsh-strict-spec/src/client/DocumentView.tsx";
import { StrictDocumentsPage } from "../../plugins/dsh-strict-spec/src/client/StrictDocumentsPage.tsx";
import { StrictDocumentsTab } from "../../plugins/dsh-strict-spec/src/client/StrictDocumentsTab.tsx";
import { createPageController, createPageSelectionStore } from "../../plugins/dsh-strict-spec/src/model/picker.ts";
import type { PickerCatalog, SessionCatalogPort } from "../../plugins/dsh-strict-spec/src/model/picker.ts";
import { createTabSurfaces } from "../../plugins/dsh-strict-spec/src/model/tab.ts";
import { clickOutcomeFor, flattenTreeRows, keyOutcomeFor } from "../../plugins/dsh-strict-spec/src/client/treeRows.ts";
import { documentParts } from "../../plugins/dsh-strict-spec/src/client/documentParts.ts";
import { proposalView, questionsView, tasksView } from "../../plugins/dsh-strict-spec/src/client/changeParts.ts";
import type { ViewContext } from "../../plugins/dsh-strict-spec/src/client/changeParts.ts";
import {
  createRoadmapNavigator,
  milestoneView,
  orderedIndexMilestones,
  ownedPlannedChanges,
  plannedChangeView,
  resolvePlannedChangeTarget,
  roadmapIndexView,
} from "../../plugins/dsh-strict-spec/src/client/roadmapParts.ts";
import {
  requirementAnchor,
  specAreaOfPath,
  specIndexView,
  specView,
} from "../../plugins/dsh-strict-spec/src/client/specParts.ts";
import {
  createSceneNavigator,
  resolveSpecTarget,
  sceneView,
  scenesIndexView,
} from "../../plugins/dsh-strict-spec/src/client/sceneParts.ts";
import { revealAnchor } from "../../plugins/dsh-strict-spec/src/client/anchorReveal.ts";
import {
  architectureView,
  configView,
  designSystemView,
  lessonView,
  lessonsIndexView,
  sopCategoryView,
  sopsIndexView,
  sopView,
  techIndexView,
  techStandardView,
} from "../../plugins/dsh-strict-spec/src/client/contextParts.ts";
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
    "artifact_type: roadmap_milestone\nmilestone:\n  m1:\n    title: Foundation Milestone\nstatus: complete\n",
  );
  fake.writeFile(
    `${WORKFLOW_ROOT}/roadmap/planned-changes/first-step.yaml`,
    "artifact_type: planned_change\nplanned_change:\n  id: first-step\nstatus: planned\n",
  );
  fake.writeFile(`${WORKFLOW_ROOT}/roadmap/archive/2026-01-01-old.yaml`, "artifact_type: planned_change\nplanned_change:\n  id: old\nstatus: complete\n");
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
    // The tree follows the open document: once a document opens, its row
    // becomes the focused row, whichever view opened it.
    const openPath = `${WORKFLOW_ROOT}/specs/viewer/behavior.yaml`;
    await stores.actions.openDocument("session-components", openPath);
    await settle();
    const html = renderTree({ sessionId: "session-components", tree: stores.tree, actions: stores.actions, open: stores.open, t: fakeT } as DocumentTreeProps);
    const focusedRow = html.split('data-focused=""')[1]?.split('role="treeitem"')[0] ?? "";
    context.assert(
      focusedRow.includes("Viewer Behavior"),
      "the tree's focused row follows the open document",
      `focused row: ${focusedRow.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)}`,
    );
    stores.actions.closeDocument();
  }

  {
    // Pointer activation: a click anywhere on a document or group row
    // activates it through the same toggle keyboard Enter uses. The row view
    // is hook-free, so its element is inspected without a DOM.
    const rows = flattenTreeRows(stores.tree.getSnapshot());
    const documentRow = rows.find((row) => row.document);
    const groupRow = rows.find((row) => row.expandable);
    const activated: string[] = [];
    for (const row of [documentRow, groupRow]) {
      if (row === undefined) {
        context.assert(false, "the ready tree holds a document row and a group row to click");
        continue;
      }
      const element = TreeRowView({ row, focused: false, t: fakeT, onToggle: (clicked) => activated.push(clicked.id) }) as {
        props?: { role?: string; onClick?: () => void };
      };
      context.assert(
        element.props?.role === "treeitem" && typeof element.props.onClick === "function",
        `a ${row.document ? "document" : "group"} row's treeitem accepts a pointer click`,
      );
      element.props?.onClick?.();
    }
    context.assert(
      JSON.stringify(activated) === JSON.stringify([documentRow?.id, groupRow?.id]),
      "clicking a document row or a group row activates that row through the shared toggle",
      `activated: ${JSON.stringify(activated)}`,
    );

    // The activation a click resolves to: focus follows the clicked row, a
    // document opens, and a group toggles from its current state.
    if (documentRow !== undefined && groupRow !== undefined) {
      context.assert(
        JSON.stringify(clickOutcomeFor(documentRow)) === JSON.stringify({ focusId: documentRow.id, activation: "open" }),
        "a document row click opens the document and moves focus to that row",
      );
      context.assert(
        JSON.stringify(clickOutcomeFor({ ...groupRow, open: false })) === JSON.stringify({ focusId: groupRow.id, activation: "expand" })
          && JSON.stringify(clickOutcomeFor({ ...groupRow, open: true })) === JSON.stringify({ focusId: groupRow.id, activation: "collapse" }),
        "a group row click expands a collapsed group, collapses an open one, and moves focus to that row",
      );
      const truncationRow = { ...documentRow, kind: "truncation" as const, document: false };
      context.assert(clickOutcomeFor(truncationRow) === undefined, "a truncation notice resolves no click activation");
      const truncationElement = TreeRowView({ row: truncationRow, focused: false, t: fakeT, onToggle: () => undefined }) as {
        props?: { onClick?: unknown };
      };
      context.assert(truncationElement.props?.onClick === undefined, "the truncation notice row accepts no pointer click");

      // The group's leading icon toggles on its own and stops propagation, so
      // the row's click never toggles the group a second time.
      let iconToggles = 0;
      const groupElement = TreeRowView({ row: groupRow, focused: false, t: fakeT, onToggle: () => { iconToggles += 1; } }) as {
        props: { children: { type: { type: (props: unknown) => unknown }; props: unknown } };
      };
      const disclosure = groupElement.props.children;
      const findButton = (node: unknown): { props: { onClick: (event: unknown) => void } } | undefined => {
        if (node === null || typeof node !== "object") {
          return undefined;
        }
        const element = node as { type?: unknown; props?: { children?: unknown } };
        if (element.type === "button") {
          return element as { props: { onClick: (event: unknown) => void } };
        }
        const children = element.props?.children;
        for (const child of Array.isArray(children) ? children : [children]) {
          const found = findButton(child);
          if (found !== undefined) {
            return found;
          }
        }
        return undefined;
      };
      const iconButton = findButton(disclosure.type.type(disclosure.props));
      let stopped = false;
      iconButton?.props.onClick({ stopPropagation: () => { stopped = true; } });
      context.assert(
        iconButton !== undefined && stopped && iconToggles === 1,
        "a group's leading icon click toggles once and stops propagation to the row",
        `button found: ${iconButton !== undefined}, stopped: ${stopped}, toggles: ${iconToggles}`,
      );
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

    const unknownHtml = renderData({ schema: "mystery/v1", schema_version: 1, artifact_type: "mystery_kind", mystery: { note: "Unserved." } });
    context.assert(unknownHtml.includes("mystery") && unknownHtml.includes("Unserved."), "an artifact type without a dedicated renderer keeps the generic view");
    context.assert(!unknownHtml.includes("proposal.what") && !unknownHtml.includes("view.additional-fields"), "no dedicated layout or additional section applies to an unserved type");

    const archivedTasks = load(
      readFileSync(path.join(ROOT, ".strict-spec-driven", "changes", "archive", "2026-10-18-register-right-sidebar-tab", "tasks.yaml"), "utf8"),
      { schema: CORE_SCHEMA },
    );
    const archivedHtml = renderData(archivedTasks);
    context.assert(archivedHtml.includes("tasks.overall:{&quot;done&quot;:14,&quot;total&quot;:14}"), "an archived change's tasks render through the same dedicated view as an active change's");
    context.assert(archivedHtml.includes("tasks.done") && !archivedHtml.includes("tasks.pending"), "a completed task renders its Done marker from the declared status");
  }

  context.section("dsh plugin components: dedicated project-context renderers");

  {
    // Renderer cases consume the registered strict example of each artifact
    // type, so a schema change that breaks a renderer fails the suite rather
    // than silently degrading the view.
    const readExample = (name: string): unknown =>
      load(readFileSync(path.join(ROOT, "examples", "strict-spec-driven", name), "utf8"), { schema: CORE_SCHEMA });
    const renderData = (data: unknown): string => renderView({ status: "ready", path: "example", data });

    const configExample = readExample("config.yaml");
    const configModel = configView(configExample);
    context.assert(configModel.body.ruleGroups.length === 2 && configModel.body.ruleGroups[0]?.category === "specs", "the config view model groups rules by declared category");
    context.assert(configModel.body.evidence.length === 1 && configModel.body.evidence[0]?.command === "npm run build && npm test -- --coverage", "the config view model reads the review evidence command");
    context.assert(configModel.body.evidence[0]?.coverage?.threshold === "80" && configModel.body.evidence[0]?.coverage?.metric === "line", "the config view model reads the coverage threshold and metric");
    context.assert(configModel.body.maintenanceChecks.length === 0, "the registered config example declares no maintenance checks, so none present");
    context.assert(configModel.additional.length === 0, "the registered config example's fields are all presented, leaving no additional fields");
    const configHtml = renderData(configExample);
    context.assert(configHtml.includes("English"), "the config view renders the preferred human language in its facts header");
    context.assert(configHtml.includes("config.context") && configHtml.includes("Example project using the strict spec-driven workflow."), "the config view renders its project context");
    context.assert(configHtml.includes("config.rules") && configHtml.includes("specs") && configHtml.includes("test"), "the config view renders rules grouped by their declared categories");
    context.assert(configHtml.includes("config.command") && configHtml.includes("npm run build &amp;&amp; npm test -- --coverage"), "the config view renders the review evidence command");
    context.assert(configHtml.includes("config.threshold") && configHtml.includes("80"), "the config view renders the coverage threshold");
    context.assert(!configHtml.includes("view.additional-fields"), "no additional-fields section renders when every field is presented");

    const configWithMaintenance = {
      ...(configExample as Record<string, unknown>),
      maintenance: { checks: [{ type: "generated-doc-check" }, "lesson-staleness-check"] },
    };
    const maintainedHtml = renderData(configWithMaintenance);
    context.assert(maintainedHtml.includes("config.maintenance") && maintainedHtml.includes("generated-doc-check") && maintainedHtml.includes("lesson-staleness-check"), "declared maintenance checks render, whether objects or bare strings");
    const extendedConfigModel = configView({ ...(configExample as Record<string, unknown>), operator_notes: { owner: "unassigned" } });
    context.assert(extendedConfigModel.additional.length === 1 && extendedConfigModel.additional[0]?.title === "operator_notes", "an unrecognized top-level field partitions into the additional blocks");
    const extendedConfigHtml = renderData({ ...(configExample as Record<string, unknown>), operator_notes: { owner: "unassigned" } });
    context.assert(extendedConfigHtml.includes("view.additional-fields") && extendedConfigHtml.includes("operator_notes"), "an unrecognized config field renders under the additional-fields section");

    const architectureExample = readExample("architecture.yaml");
    const architectureModel = architectureView(architectureExample);
    context.assert(architectureModel.body.identity?.id === "example-architecture" && architectureModel.body.components.length === 1 && architectureModel.body.dataFlows.length === 1 && architectureModel.body.decisions.length === 1, "the architecture view model reads identity, components, flows, and decisions");
    context.assert(architectureModel.body.components[0]?.boundaries[0] === "Does not own persistence." && architectureModel.body.components[0]?.dependsOn.length === 0, "the architecture view model reads component boundaries and dependencies");
    context.assert(architectureModel.body.dataFlows[0]?.steps[1] === "The example component returns a result." && architectureModel.body.dataFlows[0]?.components[0] === "example-component", "the architecture view model reads flow steps and components");
    context.assert(architectureModel.body.decisions[0]?.statement === "The example system keeps one component." && architectureModel.body.decisions[0]?.rationale === "A single component is enough for the example." && architectureModel.body.decisions[0]?.alternatives[0] === "Split the example into two components.", "the architecture view model reads decision statements, rationale, and alternatives");
    const architectureHtml = renderData(architectureExample);
    context.assert(architectureHtml.includes("architecture.components") && architectureHtml.includes("example-component"), "the architecture view renders components with their ids");
    context.assert(architectureHtml.includes("Owns one example responsibility."), "the architecture view renders a component's responsibility");
    context.assert(architectureHtml.includes("Does not own persistence."), "the architecture view renders a component's declared boundaries");
    context.assert(architectureHtml.includes("architecture.data-flows") && architectureHtml.includes("example-flow") && architectureHtml.includes("An operator runs the example command."), "the architecture view renders data flows with their triggers");
    context.assert(architectureHtml.includes("The example component receives the request.") && architectureHtml.includes("The example component returns a result."), "the architecture view renders a flow's ordered steps");
    context.assert(architectureHtml.includes("architecture.decisions") && architectureHtml.includes("example-decision") && architectureHtml.includes("accepted"), "the architecture view renders decisions with their status");
    context.assert(architectureHtml.includes("The example system keeps one component.") && architectureHtml.includes("A single component is enough for the example."), "the architecture view renders decision statements and rationale");
    context.assert(architectureHtml.includes("architecture.alternatives") && architectureHtml.includes("Split the example into two components."), "the architecture view renders rejected decision alternatives");

    const techExample = readExample("main-tech.yaml");
    const techModel = techStandardView(techExample);
    context.assert(techModel.body.category === "coding" && techModel.body.rules.length === 1, "the standard view model reads the category and rules");
    context.assert(techModel.body.rules[0]?.strength === "MUST" && techModel.body.rules[0]?.id === "example-rule", "the standard view model reads a rule's id and strength");
    const techHtml = renderData(techExample);
    context.assert(techHtml.includes("ctx.category") && techHtml.includes("coding"), "the standard view renders its category");
    context.assert(techHtml.includes("tech.rules") && techHtml.includes(">MUST<"), "the standard view renders rules with their strength emphasized");
    context.assert(techHtml.includes("All source modules MUST be authored as ESM TypeScript."), "the standard view renders a rule's statement");
    context.assert(techHtml.includes("delta.example-good") && techHtml.includes("delta.example-bad"), "the standard view renders rule examples through the shared rule layout");
    const uiTechHtml = renderData(readExample("main-tech-ui.yaml"));
    context.assert(uiTechHtml.includes(">MUST<") && uiTechHtml.includes(">SHOULD<"), "the ui-category standard renders both MUST and SHOULD strengths");
    context.assert(uiTechHtml.includes("visual-regression-for-ui-changes"), "the ui-category standard renders each declared rule id");

    const techIndexModel = techIndexView(readExample("tech-index.yaml"));
    context.assert(techIndexModel.body.standards.length === 1 && techIndexModel.body.standards[0]?.id === "example-standard", "the tech index view model lists the recorded standards");
    const techIndexHtml = renderData(readExample("tech-index.yaml"));
    context.assert(techIndexHtml.includes("tech-index.standards") && techIndexHtml.includes("tech/example-standard.yaml"), "the tech index view lists standards with their paths");

    const lessonExample = readExample("lesson.yaml");
    const lessonModel = lessonView(lessonExample);
    context.assert(lessonModel.body.status === "active" && lessonModel.body.category === "testing", "the lesson view model reads the status and category");
    context.assert(lessonModel.body.occurrences.length === 1 && lessonModel.body.occurrences[0]?.origin === "2026-04-24-port-verify-to-yaml", "the lesson view model reads occurrences");
    const lessonHtml = renderData(lessonExample);
    context.assert(lessonHtml.includes("lesson.context") && lessonHtml.includes("lesson.observation") && lessonHtml.includes("lesson.takeaway"), "the lesson view renders its narrative sections");
    context.assert(lessonHtml.includes(">active<"), "the lesson view renders its declared status as a badge");
    context.assert(lessonHtml.includes("lesson.occurrences") && lessonHtml.includes("bun test/run.ts passed against dist/verify.js"), "the lesson view renders occurrence evidence");
    const obsoletedHtml = renderData({ ...(lessonExample as Record<string, unknown>), status: "obsolete", obsoleted_reason: "The dist-backed suite was replaced." });
    context.assert(obsoletedHtml.includes(">obsolete<") && obsoletedHtml.includes("lesson.obsoleted-reason") && obsoletedHtml.includes("The dist-backed suite was replaced."), "an obsolete lesson renders its status and retirement reason");

    const lessonsIndexModel = lessonsIndexView(readExample("lessons-index.yaml"));
    context.assert(lessonsIndexModel.body.categories.length === 1 && lessonsIndexModel.body.categories[0]?.category === "testing", "the lessons index view model groups by category");
    context.assert(lessonsIndexModel.body.categories[0]?.lessons[0]?.occurrences === "1", "the lessons index view model reads the occurrence count");
    const lessonsIndexHtml = renderData(readExample("lessons-index.yaml"));
    context.assert(lessonsIndexHtml.includes("testing") && lessonsIndexHtml.includes("rebuild-before-trusting-dist-tests-a1b2c3"), "the lessons index view lists lessons grouped under their category");
    context.assert(lessonsIndexHtml.includes("lessons-index.occurrences"), "the lessons index view renders the occurrence count");

    const sopExample = readExample("sop.yaml");
    const sopModel = sopView(sopExample);
    context.assert(sopModel.body.steps.length === 2 && sopModel.body.steps[0]?.id === "drain-traffic" && sopModel.body.steps[1]?.id === "restart-process", "the SOP view model orders steps by their declared order values");
    context.assert(sopModel.body.steps[1]?.branches.length === 1 && sopModel.body.steps[1]?.branches[0]?.gotoStep === "drain-traffic", "the SOP view model reads step branches");
    const reorderedSop = {
      ...(sopExample as Record<string, unknown>),
      steps: [
        (sopExample as { steps: unknown[] }).steps[1],
        (sopExample as { steps: unknown[] }).steps[0],
      ],
    };
    const reorderedModel = sopView(reorderedSop);
    context.assert(reorderedModel.body.steps[0]?.id === "drain-traffic", "SOP steps sort by declared order regardless of declaration sequence");
    const unorderedModel = sopView({ ...(sopExample as Record<string, unknown>), steps: [{ id: "bare-step", action: "No declared order." }] });
    context.assert(unorderedModel.body.steps.length === 1 && unorderedModel.body.steps[0]?.order === undefined, "a step without a declared order value keeps declaration order and shows no order");
    const tiedOrderModel = sopView({
      ...(sopExample as Record<string, unknown>),
      steps: [
        { id: "first-tied", order: 2, action: "Declared first." },
        { id: "second-tied", order: 2, action: "Declared second." },
        { id: "then-earlier", order: 1, action: "Sorts before both ties." },
      ],
    });
    context.assert(tiedOrderModel.body.steps.map((step) => step.id).join(",") === "then-earlier,first-tied,second-tied", "steps with equal declared order values keep their declaration order behind the lower order values");
    const sopHtml = renderData(sopExample);
    context.assert(sopHtml.includes("sop.purpose") && sopHtml.includes("Restore the web frontend to a healthy serving state after an unhealthy deployment."), "the SOP view renders its purpose");
    context.assert(sopHtml.includes("sop.roles") && sopHtml.includes("on-call"), "the SOP view renders roles");
    context.assert(sopHtml.includes("sop.steps") && sopHtml.indexOf("Drain inbound traffic") < sopHtml.indexOf("Restart the web frontend process."), "the SOP view renders steps in their declared order");
    context.assert(sopHtml.includes("sop.expected-result") && sopHtml.includes("The process reports a healthy status."), "the SOP view renders expected results");
    context.assert(sopHtml.includes("sop.exceptions") && sopHtml.includes("Roll back to the previous known-good deployment."), "the SOP view renders exception handling");
    context.assert(sopHtml.includes("sop.success-criteria") && sopHtml.includes("The web frontend health check reports healthy."), "the SOP view renders success criteria");
    context.assert(sopHtml.includes(">draft<"), "the SOP view renders its declared status as a badge");

    const sopCategoryModel = sopCategoryView(readExample("sop-category.yaml"));
    context.assert(sopCategoryModel.body.questions.length === 2 && sopCategoryModel.body.questions[0]?.mapsTo === "purpose", "the SOP category view model reads intake questions");
    const sopCategoryHtml = renderData(readExample("sop-category.yaml"));
    context.assert(sopCategoryHtml.includes("sop-category.questions") && sopCategoryHtml.includes("What is this procedure and why does it exist?"), "the SOP category view renders intake questions");
    context.assert(sopCategoryHtml.includes("sop-category.required"), "a required intake question renders its marker");
    context.assert(sopCategoryHtml.includes("sop-category.constraints") && sopCategoryHtml.includes("sop-category.min-steps"), "the SOP category view renders constraints");

    const sopsIndexModel = sopsIndexView(readExample("sops-index.yaml"));
    context.assert(sopsIndexModel.body.sops.length === 1 && sopsIndexModel.body.sops[0]?.category === "operational", "the SOPs index view model lists recorded SOPs");
    const sopsIndexHtml = renderData(readExample("sops-index.yaml"));
    context.assert(sopsIndexHtml.includes("sops-index.sops") && sopsIndexHtml.includes("restart-web-frontend-abc123") && sopsIndexHtml.includes(">draft<"), "the SOPs index view lists SOPs with their statuses");

    const designExample = readExample("design-system.yaml");
    const designModel = designSystemView(designExample);
    context.assert(designModel.body.tokenFamilies.length === 5 && designModel.body.tokenFamilies.some((family) => family.family === "typography"), "the design system view model groups tokens by family, including the nested typography family");
    context.assert(designModel.body.tokenFamilies[0]?.nodes[0]?.value === "#1A73E8", "the design system view model reads token values");
    const typographyFamily = designModel.body.tokenFamilies.find((family) => family.family === "typography");
    context.assert(typographyFamily?.nodes.some((node) => node.name === "body" && node.children.some((child) => child.name === "fontFamily" && child.value === "Inter, system-ui, sans-serif")), "the nested typography groups carry their token values");
    context.assert(designModel.body.components.length === 1 && designModel.body.components[0]?.tokenRefs.length === 4, "the design system view model reads component token references");
    const designHtml = renderData(designExample);
    context.assert(designHtml.includes("design-system.tokens") && designHtml.includes("colors") && designHtml.includes("#1A73E8"), "the design system view renders tokens grouped by family");
    context.assert(designHtml.includes("typography") && designHtml.includes("fontFamily") && designHtml.includes("Inter, system-ui, sans-serif"), "the design system view renders nested token groups with their values");
    context.assert(designHtml.includes("design-system.components") && designHtml.includes("example-button") && designHtml.includes("colors.primary"), "the design system view renders components with their token references");
    context.assert(designHtml.includes("design-system.guidance") && designHtml.includes("design-system.do") && designHtml.includes("design-system.dont"), "the design system view renders guidance with do and don't entries");
    context.assert(designHtml.includes("test/snapshots/example-button.png"), "the design system view renders component snapshots");
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

  context.section("dsh plugin components: dedicated roadmap renderers");

  {
    // Renderer cases consume the registered strict example of each artifact
    // type, so a schema change that breaks a renderer fails the suite rather
    // than silently degrading the view.
    const readExample = (name: string): unknown =>
      load(readFileSync(path.join(ROOT, "examples", "strict-spec-driven", name), "utf8"), { schema: CORE_SCHEMA });
    const renderData = (data: unknown): string => renderView({ status: "ready", path: "example", data });

    const indexExample = readExample("roadmap-index.yaml");
    const indexModel = roadmapIndexView(indexExample);
    context.assert(
      indexModel.body.milestones.length === 1 && indexModel.body.milestones[0]?.id === "0001-example-milestone"
        && indexModel.body.milestones[0]?.status === "proposed" && indexModel.body.milestones[0]?.title === "Example Milestone",
      "the index view model reads each declared milestone entry",
    );
    context.assert(indexModel.additional.length === 0, "the registered index example's fields are all presented, leaving no additional fields");
    const indexHtml = renderData(indexExample);
    context.assert(indexHtml.includes("roadmap.milestones") && indexHtml.includes("0001-example-milestone"), "the index view lists the declared milestones");
    context.assert(indexHtml.includes("Example Milestone") && indexHtml.includes(">proposed<"), "the index view renders each milestone's title and declared status badge");

    const ordered = orderedIndexMilestones(
      [
        { id: "b-second" },
        { id: "a-first" },
        { id: "c-unordered" },
      ],
      {
        "x/y.yaml": { path: "x/y.yaml", family: "roadmap", label: "y", known: true, archived: false, milestoneId: "b-second", milestoneOrder: 20 },
        "x/z.yaml": { path: "x/z.yaml", family: "roadmap", label: "z", known: true, archived: false, milestoneId: "a-first", milestoneOrder: 10 },
      } as Record<string, DocumentRecord>,
    );
    context.assert(
      ordered.map((entry) => entry.id).join(",") === "a-first,b-second,c-unordered"
        && ordered[0]?.order === 10 && ordered[2]?.order === undefined,
      "index entries order by their milestone files' declared order values, keeping unrecorded entries in declaration order",
    );

    const milestonePlanning = readExample("roadmap-milestone.planning.yaml");
    const milestoneModel = milestoneView(milestonePlanning);
    context.assert(
      milestoneModel.body.milestone?.id === "0002-roadmap-workflow" && milestoneModel.body.milestone?.title === "Roadmap Workflow"
        && milestoneModel.body.status === "proposed",
      "the milestone view model reads the keyed milestone identity and status",
    );
    context.assert(milestoneModel.body.in.length === 2 && milestoneModel.body.out.length === 1, "the milestone view model reads both scope groups");
    context.assert(milestoneModel.body.doneCriteria.length === 2 && milestoneModel.body.dependencies[0] === "0001-foundation", "the milestone view model reads done criteria and dependencies");
    context.assert(
      milestoneModel.body.intakeQuestions.length === 3 && milestoneModel.body.intakeQuestions[0]?.impact !== undefined
        && milestoneModel.body.intakeQuestions[0]?.recommendation !== undefined,
      "the milestone view model reads every intake question field as a card",
    );
    context.assert(
      milestoneModel.additional.length === 1 && milestoneModel.additional[0]?.title === "planned_changes",
      "the legacy inline planned_changes mapping partitions into the additional blocks rather than presenting as the owned listing",
    );
    const milestoneHtml = renderData(milestonePlanning);
    context.assert(milestoneHtml.includes("roadmap.goal") && milestoneHtml.includes("Define strict roadmap workflow behavior."), "the milestone view renders its goal");
    context.assert(milestoneHtml.includes("proposal.in") && milestoneHtml.includes("proposal.out"), "the milestone view renders scope in and out side by side");
    context.assert(milestoneHtml.includes("roadmap.done-criteria") && milestoneHtml.includes("Roadmap validation can inspect milestone and planned change structure."), "the milestone view renders done criteria as a checklist");
    context.assert(milestoneHtml.includes("roadmap.dependencies") && milestoneHtml.includes("0001-foundation"), "the milestone view renders its dependencies");
    context.assert(milestoneHtml.includes("roadmap.intake-questions") && milestoneHtml.includes("roadmap.impact") && milestoneHtml.includes("roadmap.recommendation"), "the milestone view renders intake questions as cards with impact and recommendation");
    context.assert(
      milestoneHtml.includes("view.additional-fields") && milestoneHtml.includes("validate-roadmap-contract"),
      "the legacy inline planned changes render through the additional-fields append instead of hiding",
    );
    const plainMilestoneHtml = renderData(readExample("roadmap-milestone.yaml"));
    context.assert(plainMilestoneHtml.includes("roadmap.goal") && plainMilestoneHtml.includes("roadmap.owned-planned-changes"), "the minimal milestone example renders its goal and the owned-planned-changes section");

    const plannedChangeExample = readExample("planned-change.yaml");
    const plannedChangeModel = plannedChangeView(plannedChangeExample);
    context.assert(
      plannedChangeModel.body.id === "example-change" && plannedChangeModel.body.milestone === "0001-example-milestone"
        && plannedChangeModel.body.status === "planned" && plannedChangeModel.body.dependsOn.length === 0,
      "the planned-change view model reads the identity, owning milestone, status, and dependencies",
    );
    context.assert(
      plannedChangeModel.additional.length === 1 && plannedChangeModel.additional[0]?.title === "team",
      "the declared team mapping partitions into the additional blocks",
    );
    const plannedChangeHtml = renderData(plannedChangeExample);
    context.assert(plannedChangeHtml.includes("roadmap.summary") && plannedChangeHtml.includes("Add one standalone planned roadmap change."), "the planned-change view renders its summary");
    context.assert(plannedChangeHtml.includes("proposal.roadmap-milestone") && plannedChangeHtml.includes("0001-example-milestone"), "the planned-change view renders the owning milestone");
    context.assert(plannedChangeHtml.includes("view.additional-fields") && plannedChangeHtml.includes("alice"), "the team mapping renders through the additional-fields append");

    // Navigation: a depends_on entry that resolves opens its target through
    // the shared open action alone, and an unresolved entry renders the
    // visible marker instead of acting.
    const roadmapFake = new FakeWorkspaceFiles();
    roadmapFake.writeFile(`${WORKFLOW_ROOT}/roadmap/INDEX.yaml`, "artifact_type: roadmap_index\nmilestones:\n  m1:\n    title: Milestone One\n    path: roadmap/milestones/m1.yaml\n    status: proposed\n");
    roadmapFake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/milestones/m1.yaml`,
      "artifact_type: roadmap_milestone\nmilestone:\n  m1:\n    title: Milestone One\norder: 1\nstatus: proposed\n",
    );
    roadmapFake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/planned-changes/target-change.yaml`,
      "artifact_type: planned_change\nplanned_change:\n  id: target-change\n  milestone: m1\nstatus: planned\n",
    );
    roadmapFake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/planned-changes/depending-change.yaml`,
      "artifact_type: planned_change\nplanned_change:\n  id: depending-change\n  milestone: m1\nstatus: planned\ndepends_on:\n  - target-change\n  - missing-change\n",
    );
    const roadmapStores = createViewerStores(roadmapFake.port);
    await roadmapStores.actions.loadWorkspace("session-roadmap");
    await settle();
    const roadmapContext: ViewContext = { sessionId: "session-roadmap", viewer: roadmapStores };
    const documents = roadmapStores.tree.getSnapshot().documents;

    const resolvedTarget = resolvePlannedChangeTarget(documents, "target-change");
    context.assert(resolvedTarget?.path === `${WORKFLOW_ROOT}/roadmap/planned-changes/target-change.yaml`, "a declared planned-change id resolves against the documents record");

    const openedPaths: string[] = [];
    const recordingActions = { openDocument: async (_sessionId: string, path: string): Promise<void> => { openedPaths.push(path); } };
    const navigator = createRoadmapNavigator(recordingActions, "session-roadmap", documents);
    context.assert(navigator.openPlannedChange("target-change") === true && openedPaths[0] === `${WORKFLOW_ROOT}/roadmap/planned-changes/target-change.yaml`, "selecting a resolved depends_on entry calls only the shared open action with the resolved path");
    context.assert(navigator.openPlannedChange("missing-change") === false && openedPaths.length === 1, "an unresolved entry opens nothing");
    navigator.openPath(`${WORKFLOW_ROOT}/roadmap/planned-changes/target-change.yaml`);
    context.assert(openedPaths.length === 2, "an owned row opens its declared path through the same shared action");

    await roadmapStores.actions.openDocument("session-roadmap", `${WORKFLOW_ROOT}/roadmap/planned-changes/depending-change.yaml`);
    await settle();
    const dependingHtml = renderToString(createElement(DocumentView, {
      state: roadmapStores.open.getSnapshot(),
      t: fakeT,
      context: roadmapContext,
    } satisfies DocumentViewProps));
    context.assert(dependingHtml.includes("target-change") && dependingHtml.includes("<button"), "a resolved dependency renders as a selectable link");
    context.assert(dependingHtml.includes("missing-change") && dependingHtml.includes("roadmap.unresolved"), "an unresolved dependency renders the visible unresolved marker");

    const ownedListed = ownedPlannedChanges(documents, "m1");
    context.assert(
      ownedListed.length === 2 && ownedListed.every((entry) => entry.status === "planned"),
      "the owned listing derives from the planned-change documents whose declared milestone names the milestone",
      `actual: ${JSON.stringify(ownedListed)}`,
    );

    await roadmapStores.actions.openDocument("session-roadmap", `${WORKFLOW_ROOT}/roadmap/milestones/m1.yaml`);
    await settle();
    const milestoneContextHtml = renderToString(createElement(DocumentView, {
      state: roadmapStores.open.getSnapshot(),
      t: fakeT,
      context: roadmapContext,
    } satisfies DocumentViewProps));
    context.assert(
      milestoneContextHtml.includes("roadmap.owned-planned-changes") && milestoneContextHtml.includes("depending-change") && milestoneContextHtml.includes("target-change"),
      "the milestone view lists its owned planned changes with their declared statuses",
    );

    // The renderer suite also renders an archived milestone of this
    // repository, so the dedicated view is proven against real archived
    // shape, and its owned entries resolve from the archived files.
    const archivedMilestone = load(
      readFileSync(path.join(ROOT, ".strict-spec-driven", "roadmap", "archive", "milestones", "0001-yaml-contracts-and-naming.yaml"), "utf8"),
      { schema: CORE_SCHEMA },
    );
    const archivedModel = milestoneView(archivedMilestone);
    context.assert(archivedModel.body.milestone?.id === "0001-yaml-contracts-and-naming", "the archived milestone view model reads the keyed identity");
    const archivedHtml = renderData(archivedMilestone);
    context.assert(archivedHtml.includes("roadmap.goal") && archivedHtml.includes("roadmap.done-criteria"), "an archived milestone renders through the same dedicated view");

    const archivedFake = new FakeWorkspaceFiles();
    archivedFake.writeFile(
      `${WORKFLOW_ROOT}/roadmap/archive/milestones/0001-yaml-contracts-and-naming.yaml`,
      readFileSync(path.join(ROOT, ".strict-spec-driven", "roadmap", "archive", "milestones", "0001-yaml-contracts-and-naming.yaml"), "utf8"),
    );
    for (const name of ["0001-yaml-contracts-and-naming-define-yaml-spec-and-delta-model.yaml", "0001-yaml-contracts-and-naming-define-command-naming-model.yaml"]) {
      archivedFake.writeFile(
        `${WORKFLOW_ROOT}/roadmap/archive/planned-changes/${name}`,
        readFileSync(path.join(ROOT, ".strict-spec-driven", "roadmap", "archive", "planned-changes", name), "utf8"),
      );
    }
    const archivedStores = createViewerStores(archivedFake.port);
    await archivedStores.actions.loadWorkspace("session-archived");
    await settle();
    await archivedStores.actions.expandNode("session-archived", `${WORKFLOW_ROOT}/roadmap/archive`);
    await settle();
    await archivedStores.actions.openDocument("session-archived", `${WORKFLOW_ROOT}/roadmap/archive/milestones/0001-yaml-contracts-and-naming.yaml`);
    await settle();
    const archivedOwnership = archivedStores.ownership.getSnapshot();
    context.assert(
      archivedOwnership.status === "ready" && archivedOwnership.owned.length === 2,
      "opening the repository's archived milestone resolves its owned planned changes from the archived files",
      `actual: ${JSON.stringify(archivedOwnership.owned)}`,
    );
    const archivedContextHtml = renderToString(createElement(DocumentView, {
      state: archivedStores.open.getSnapshot(),
      t: fakeT,
      context: { sessionId: "session-archived", viewer: archivedStores },
    } satisfies DocumentViewProps));
    context.assert(
      archivedContextHtml.includes("roadmap.owned-planned-changes") && archivedContextHtml.includes("define-yaml-spec-and-delta-model"),
      "the archived milestone view lists its owned planned changes resolved from the archived files",
    );

    // The archived planned-change leg of the same-view requirement: opening
    // one from the expanded archive renders the dedicated planned-change
    // view exactly as an active planned change's does.
    await archivedStores.actions.openDocument("session-archived", `${WORKFLOW_ROOT}/roadmap/archive/planned-changes/0001-yaml-contracts-and-naming-define-yaml-spec-and-delta-model.yaml`);
    await settle();
    const archivedPlannedChangeHtml = renderToString(createElement(DocumentView, {
      state: archivedStores.open.getSnapshot(),
      t: fakeT,
      context: { sessionId: "session-archived", viewer: archivedStores },
    } satisfies DocumentViewProps));
    context.assert(
      archivedPlannedChangeHtml.includes("roadmap.summary") && archivedPlannedChangeHtml.includes("translate RFC 2119 requirements"),
      "an archived planned change renders through the same dedicated planned-change view",
    );
    context.assert(
      archivedPlannedChangeHtml.includes(">complete<") && archivedPlannedChangeHtml.includes("proposal.roadmap-milestone") && archivedPlannedChangeHtml.includes("0001-yaml-contracts-and-naming"),
      "the archived planned change presents its declared status and owning milestone",
    );
    context.assert(!archivedPlannedChangeHtml.includes("roadmap.depends-on"), "a planned change with no depends_on entries renders no dependency section");

    // No client view module reaches the workspace port: navigation flows
    // only through the shared open action and passed-in state. The scan and
    // its firing probe share one predicate, so a broken pattern fails the
    // probe before the scan can pass vacuously.
    const portImportPattern = /from ["']\.\.\/model\/port\.ts["']/;
    context.assert(
      portImportPattern.test('import type { WorkspaceFilesPort } from "../model/port.ts";') && !portImportPattern.test('import type { TreeState } from "../model/nodes.ts";'),
      "the port-import predicate fires on a synthetic offender and stays silent on a benign import",
    );
    const clientDir = path.join(ROOT, "plugins", "dsh-strict-spec", "src", "client");
    const portImportingViews = readdirSync(clientDir)
      .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
      .filter((name) => portImportPattern.test(readFileSync(path.join(clientDir, name), "utf8")));
    context.assert(portImportingViews.length === 0, "no client view module imports the workspace-files port", `offenders: ${portImportingViews.join(",")}`);

    roadmapStores.actions.dispose();
    archivedStores.actions.dispose();
  }

  context.section("dsh plugin components: dedicated spec and scene renderers");

  {
    // Renderer cases consume the registered strict example of each artifact
    // type, so a schema change that breaks a renderer fails the suite rather
    // than silently degrading the view.
    const readExample = (name: string): unknown =>
      load(readFileSync(path.join(ROOT, "examples", "strict-spec-driven", name), "utf8"), { schema: CORE_SCHEMA });
    const renderData = (data: unknown): string => renderView({ status: "ready", path: "example", data });

    const specExample = readExample("main-spec.yaml");
    const specModel = specView(specExample);
    context.assert(
      specModel.body.spec?.id === "example-spec" && specModel.body.spec?.title === "Example Spec"
        && specModel.body.requirements.length === 1 && specModel.body.requirements[0]?.id === "example-requirement"
        && specModel.body.requirements[0]?.strength === "MUST"
        && specModel.body.requirements[0]?.scenarios[0]?.steps.length === 4
        && specModel.body.requirements[0]?.scenarios[0]?.steps[2]?.kind === "AND",
      "the spec view model reads the declared identity, requirement, strength, and scenario steps",
    );
    context.assert(specModel.additional.length === 0, "the registered spec example's fields are all presented, leaving no additional fields");
    const specHtml = renderData(specExample);
    context.assert(specHtml.includes("ctx.id") && specHtml.includes("example-spec") && specHtml.includes("Example Spec"), "the spec view renders the declared identity");
    context.assert(specHtml.includes("spec.requirements") && specHtml.includes("example-requirement"), "the spec view lists its requirements under the requirements section");
    context.assert(specHtml.includes(">MUST<") && specHtml.includes("The system MUST expose one observable behavior."), "each requirement renders its emphasized strength beside its statement");
    context.assert(specHtml.includes("GIVEN") && specHtml.includes("WHEN") && specHtml.includes("THEN"), "each scenario renders its steps under their declared keywords");
    context.assert(
      specHtml.includes(`id="strict-spec-req-example-spec-example-requirement"`)
        && requirementAnchor("example-spec", "example-requirement") === "strict-spec-req-example-spec-example-requirement",
      "each requirement carries the stable anchor the scene coverage links open",
    );

    // The additional-fields append: a top-level field the spec layout does
    // not present survives under the generic additional-fields section,
    // the same contract every dedicated renderer carries.
    const extendedSpecHtml = renderView({
      status: "ready",
      path: "extended-spec",
      data: {
        schema: "strict-spec-driven/main-spec/v1",
        schema_version: 1,
        artifact_type: "main_spec",
        schema_file: "templates/strict-spec-driven/schemas/main-spec.yaml",
        spec: { id: "extended-spec", title: "Extended Spec" },
        requirements: {
          lone: { strength: "MAY", statement: "An optional behavior.", scenarios: { only: [{ GIVEN: "a state", WHEN: "an action", THEN: "a result" }] } },
        },
        review_notes: { owner: "reviewer", note: "Watch this spec." },
      },
    });
    context.assert(extendedSpecHtml.includes("view.additional-fields") && extendedSpecHtml.includes("review_notes") && extendedSpecHtml.includes("Watch this spec."), "an unrecognized top-level spec field renders through the additional-fields append rather than hiding");

    context.assert(
      specAreaOfPath(".strict-spec-driven/specs/cli/foundation.yaml") === "cli"
        && specAreaOfPath("specs/viewer/behavior.yaml") === "viewer"
        && specAreaOfPath("specs/example-spec.yaml") === "(unspecified)"
        && specAreaOfPath(undefined) === "(unspecified)",
      "a declared spec path's area is the subdirectory it names under specs/, with a stable fallback",
    );
    const specIndexExample = readExample("spec-index.yaml");
    const specIndexModel = specIndexView(specIndexExample);
    context.assert(
      specIndexModel.body.groups.length === 1 && specIndexModel.body.groups[0]?.area === "(unspecified)"
        && specIndexModel.body.groups[0]?.specs[0]?.id === "example-spec",
      "the spec index view model groups the example's area-less entry under the fallback group",
    );
    const specIndexHtml = renderData(specIndexExample);
    context.assert(specIndexHtml.includes("spec-index.other-area") && specIndexHtml.includes("example-spec") && specIndexHtml.includes("Example Spec"), "the specs index view renders the fallback area group with its entries");
    const areaIndexDocument = {
      artifact_type: "spec_index",
      specs: [
        { id: "cli-foundation", title: "CLI Foundation", path: ".strict-spec-driven/specs/cli/foundation.yaml" },
        { id: "viewer-behavior", title: "Viewer Behavior", path: ".strict-spec-driven/specs/dsh-viewer/behavior.yaml" },
        { id: "cli-commands", title: "CLI Commands", path: ".strict-spec-driven/specs/cli/commands.yaml" },
      ],
    };
    const areaIndexModel = specIndexView(areaIndexDocument);
    context.assert(
      areaIndexModel.body.groups.map((group) => `${group.area}:${group.specs.length}`).join(",") === "cli:2,dsh-viewer:1",
      "the spec index view model groups entries by their declared spec areas in declaration order",
    );
    const areaIndexHtml = renderView({ status: "ready", path: "area-index", data: areaIndexDocument });
    context.assert(areaIndexHtml.includes(">cli<") && areaIndexHtml.includes(">dsh-viewer<"), "the specs index view renders one section per spec area");

    const sceneExample = readExample("scene.yaml");
    const sceneModel = sceneView(sceneExample);
    context.assert(
      sceneModel.body.scene?.id === "submit-expense-claim" && sceneModel.body.area === "expenses" && sceneModel.body.status === "active",
      "the scene view model reads the declared identity, area, and status",
    );
    context.assert(
      sceneModel.body.actors.length === 2 && sceneModel.body.actors[0]?.name === "employee" && sceneModel.body.actors[0]?.role !== undefined
        && sceneModel.body.preconditions.length === 2,
      "the scene view model reads the cast with their responsibilities and the preconditions",
    );
    context.assert(
      sceneModel.body.mainFlow.length === 4 && sceneModel.body.mainFlow[0]?.id === "open-claim-form"
        && sceneModel.body.mainFlow[1]?.coveredBy.length === 2,
      "the scene view model reads the ordered main flow with each step's covering references",
    );
    context.assert(
      sceneModel.body.exceptionFlows.length === 2 && sceneModel.body.exceptionFlows[0]?.trigger !== undefined
        && sceneModel.body.exceptionFlows[0]?.steps.length === 1,
      "the scene view model reads the exception flows under their triggers",
    );
    context.assert(sceneModel.additional.length === 0, "the registered scene example's fields are all presented, leaving no additional fields");
    const sceneHtml = renderData(sceneExample);
    context.assert(sceneHtml.includes("scene.actors") && sceneHtml.includes("employee") && sceneHtml.includes("scene.actor-role"), "the scene view renders the cast with their responsibilities");
    context.assert(sceneHtml.includes("scene.preconditions") && sceneHtml.includes("The employee is signed in"), "the scene view renders the preconditions as their own section");
    context.assert(sceneHtml.includes("delta.main-flow") && sceneHtml.includes("open-claim-form") && sceneHtml.includes("attach-receipt"), "the scene view renders the main flow steps in declared order");
    context.assert(sceneHtml.includes("delta.exception-flow") && sceneHtml.includes("receipt-upload-is-rejected") && sceneHtml.includes("delta.trigger"), "the scene view renders each exception flow under its trigger");
    context.assert(sceneHtml.includes("expenses-claim-capture:claim-form-lists-the-employee-cost-centres"), "a step's covering reference renders as spec:requirement");
    context.assert(sceneHtml.includes("delta.no-coverage") && sceneHtml.includes("governed by the design system"), "a waived step renders its declared no-coverage reason");
    context.assert(!sceneHtml.includes("scene.uncovered-step"), "a step declaring coverage or a reason carries no uncovered flag");

    // A step naming neither a covering reference nor a no-coverage reason is
    // schema-invalid but parseable, and the viewer still opens it: the flag
    // is exactly for that gap, asserted here against a hand-built document.
    const uncoveredHtml = renderView({
      status: "ready",
      path: "uncovered",
      data: {
        artifact_type: "scene",
        scene: { id: "uncovered-scene", title: "Uncovered Scene" },
        area: "test",
        status: "draft",
        actors: [{ name: "operator", role: "Acts." }],
        preconditions: ["Something holds."],
        main_flow: { "bare-step": { action: "Nothing covers this step." } },
        exception_flows: { failure: { trigger: "It fails.", steps: { recover: { action: "Recover.", no_coverage_reason: "Recovery is procedural." } } } },
      },
    });
    context.assert(uncoveredHtml.includes("scene.uncovered-step") && uncoveredHtml.includes("bare-step"), "a step declaring neither coverage nor a reason carries the visible uncovered flag");
    context.assert(uncoveredHtml.includes("delta.no-coverage") && uncoveredHtml.includes("Recovery is procedural."), "the exception step's declared reason still renders");

    const scenesIndexExample = readExample("scenes-index.yaml");
    const scenesIndexModel = scenesIndexView(scenesIndexExample);
    context.assert(
      scenesIndexModel.body.groups.length === 1 && scenesIndexModel.body.groups[0]?.area === "expenses"
        && scenesIndexModel.body.groups[0]?.scenes[0]?.id === "submit-expense-claim"
        && scenesIndexModel.body.groups[0]?.scenes[0]?.status === "active",
      "the scenes index view model groups entries under their declared areas",
    );
    const scenesIndexHtml = renderData(scenesIndexExample);
    context.assert(scenesIndexHtml.includes(">expenses<") && scenesIndexHtml.includes("submit-expense-claim") && scenesIndexHtml.includes("An employee submits an expense claim for approval"), "the scenes index view renders its area group with titles");
    context.assert(scenesIndexHtml.includes(">active<"), "each scenes index entry renders its declared status");

    // Navigation: this repository's real browses scene renders over fake
    // stores holding the real dsh-viewer-behavior spec, so every covering
    // reference resolves and renders as a link that opens the covering
    // requirement's anchor through the shared open action alone.
    const sceneFake = new FakeWorkspaceFiles();
    sceneFake.writeFile(`${WORKFLOW_ROOT}/config.yaml`, "artifact_type: workflow_config\n");
    sceneFake.writeFile(`${WORKFLOW_ROOT}/scenes/INDEX.yaml`, "artifact_type: scenes_index\n");
    sceneFake.writeFile(
      `${WORKFLOW_ROOT}/scenes/dsh-viewer/operator-browses-strict-documents.yaml`,
      readFileSync(path.join(ROOT, ".strict-spec-driven", "scenes", "dsh-viewer", "operator-browses-strict-documents.yaml"), "utf8"),
    );
    sceneFake.writeFile(`${WORKFLOW_ROOT}/specs/INDEX.yaml`, "artifact_type: spec_index\n");
    sceneFake.writeFile(
      `${WORKFLOW_ROOT}/specs/dsh-viewer/behavior.yaml`,
      readFileSync(path.join(ROOT, ".strict-spec-driven", "specs", "dsh-viewer", "behavior.yaml"), "utf8"),
    );
    const sceneStores = createViewerStores(sceneFake.port);
    await sceneStores.actions.loadWorkspace("session-scene");
    await settle();
    const sceneContext: ViewContext = { sessionId: "session-scene", viewer: sceneStores };
    const sceneDocuments = sceneStores.tree.getSnapshot().documents;
    const specRecord = sceneDocuments[`${WORKFLOW_ROOT}/specs/dsh-viewer/behavior.yaml`];
    context.assert(specRecord?.specId === "dsh-viewer-behavior" && specRecord?.requirementIds?.[0] === "tree-family-order", "the content pass records the real spec's id and requirement ids");

    const resolvedSpec = resolveSpecTarget(sceneDocuments, "dsh-viewer-behavior");
    context.assert(resolvedSpec?.path === `${WORKFLOW_ROOT}/specs/dsh-viewer/behavior.yaml`, "a covering reference's spec id resolves against the documents record");
    context.assert(resolveSpecTarget(sceneDocuments, "missing-spec") === undefined, "a spec id no held document declares resolves to nothing");

    const opened: Array<{ path: string; anchor?: string }> = [];
    const recordingActions = {
      openDocument: async (_sessionId: string, path: string, anchor?: string): Promise<void> => {
        opened.push({ path, anchor });
      },
    };
    const sceneNavigator = createSceneNavigator(recordingActions, "session-scene", sceneDocuments);
    context.assert(
      sceneNavigator.openRequirement("dsh-viewer-behavior", "right-sidebar-tab") === true
        && opened[0]?.path === `${WORKFLOW_ROOT}/specs/dsh-viewer/behavior.yaml`
        && opened[0]?.anchor === requirementAnchor("dsh-viewer-behavior", "right-sidebar-tab"),
      "selecting a resolved covering reference calls only the shared open action with the spec path and requirement anchor",
    );
    context.assert(sceneNavigator.openRequirement("missing-spec", "any-requirement") === false && opened.length === 1, "an unresolved covering reference opens nothing");

    const browsesHtml = renderToString(createElement(DocumentView, {
      state: { status: "ready", path: `${WORKFLOW_ROOT}/scenes/dsh-viewer/operator-browses-strict-documents.yaml`, data: load(readFileSync(path.join(ROOT, ".strict-spec-driven", "scenes", "dsh-viewer", "operator-browses-strict-documents.yaml"), "utf8"), { schema: CORE_SCHEMA }) },
      t: fakeT,
      context: sceneContext,
    } satisfies DocumentViewProps));
    context.assert(browsesHtml.includes("<button") && browsesHtml.includes("dsh-viewer-behavior:right-sidebar-tab"), "a resolved covering reference renders as a selectable link");
    context.assert(!browsesHtml.includes("roadmap.unresolved"), "the repository scene's references all resolve, rendering no unresolved markers");

    const unresolvedHtml = renderToString(createElement(DocumentView, {
      state: {
        status: "ready",
        path: "unresolved-scene",
        data: {
          artifact_type: "scene",
          scene: { id: "unresolved-scene", title: "Unresolved Scene" },
          area: "test",
          status: "draft",
          actors: [{ name: "operator", role: "Acts." }],
          preconditions: ["Something holds."],
          main_flow: { dangling: { action: "Points nowhere.", covered_by: [{ spec_id: "missing-spec", requirement_id: "gone" }] } },
          exception_flows: { failure: { trigger: "It fails.", steps: { recover: { action: "Recover.", no_coverage_reason: "Recovery is procedural." } } } },
        },
      },
      t: fakeT,
      context: sceneContext,
    } satisfies DocumentViewProps));
    context.assert(unresolvedHtml.includes("missing-spec:gone") && unresolvedHtml.includes("roadmap.unresolved"), "a covering reference that resolves to no held document renders the visible unresolved marker");

    // Requirement-level resolution: a reference naming a held spec but a
    // requirement that spec does not declare is just as dangling — it
    // renders the unresolved marker and opens nothing, instead of a link
    // that would open the spec silently un-anchored.
    context.assert(resolveSpecTarget(sceneDocuments, "dsh-viewer-behavior", "nonexistent-requirement") === undefined, "a reference naming a held spec but an undeclared requirement resolves to nothing");
    context.assert(
      sceneNavigator.openRequirement("dsh-viewer-behavior", "nonexistent-requirement") === false && opened.length === 1,
      "selecting a reference whose requirement the held spec does not declare opens nothing",
    );
    const danglingRequirementHtml = renderToString(createElement(DocumentView, {
      state: {
        status: "ready",
        path: "dangling-requirement-scene",
        data: {
          artifact_type: "scene",
          scene: { id: "dangling-requirement-scene", title: "Dangling Requirement Scene" },
          area: "test",
          status: "draft",
          actors: [{ name: "operator", role: "Acts." }],
          preconditions: ["Something holds."],
          main_flow: { "points-nowhere": { action: "Names a missing requirement.", covered_by: [{ spec_id: "dsh-viewer-behavior", requirement_id: "nonexistent-requirement" }] } },
          exception_flows: { failure: { trigger: "It fails.", steps: { recover: { action: "Recover.", no_coverage_reason: "Recovery is procedural." } } } },
        },
      },
      t: fakeT,
      context: sceneContext,
    } satisfies DocumentViewProps));
    context.assert(
      danglingRequirementHtml.includes("dsh-viewer-behavior:nonexistent-requirement") && danglingRequirementHtml.includes("roadmap.unresolved") && !danglingRequirementHtml.includes("<button"),
      "a reference naming an undeclared requirement of a held spec renders the unresolved marker instead of a link",
    );

    // The anchored open: opening a spec with an anchor records it, the spec
    // view renders the anchored requirement's stable id, and the reveal
    // scrolls the element the anchor names — asserted with a scripted
    // lookup so no DOM is needed.
    await sceneStores.actions.openDocument("session-scene", `${WORKFLOW_ROOT}/specs/dsh-viewer/behavior.yaml`, requirementAnchor("dsh-viewer-behavior", "live-refresh"));
    const anchoredState = sceneStores.open.getSnapshot();
    context.assert(anchoredState.anchor === requirementAnchor("dsh-viewer-behavior", "live-refresh"), "the open action records the anchor it was opened with");
    const anchoredHtml = renderToString(createElement(DocumentView, { state: anchoredState, t: fakeT, context: sceneContext } satisfies DocumentViewProps));
    context.assert(anchoredHtml.includes(`id="strict-spec-req-dsh-viewer-behavior-live-refresh"`), "the spec view renders the anchored requirement's stable anchor id");
    await sceneStores.actions.openDocument("session-scene", `${WORKFLOW_ROOT}/specs/dsh-viewer/behavior.yaml`);
    context.assert(sceneStores.open.getSnapshot().anchor === undefined, "opening without an anchor clears any earlier one");

    const revealed: string[] = [];
    const scriptedLookups = new Map<string, { scrollIntoView: (options?: { block?: string }) => void }>([
      ["present-anchor", { scrollIntoView: (options?: { block?: string }) => { revealed.push(`present:${options?.block}`); } }],
    ]);
    const lookup = (id: string) => scriptedLookups.get(id) ?? null;
    context.assert(revealAnchor(undefined, lookup) === false && revealed.length === 0, "no anchor reveals nothing");
    context.assert(revealAnchor("absent-anchor", lookup) === false && revealed.length === 0, "an anchor that resolves to no element reveals nothing");
    context.assert(revealAnchor("present-anchor", lookup) === true && revealed[0] === "present:start", "a resolved anchor scrolls its element into view at the block start");

    sceneStores.actions.dispose();
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
      "roadmap.milestones", "roadmap.intake-questions", "roadmap.owned-planned-changes", "roadmap.goal", "roadmap.done-criteria", "roadmap.dependencies", "roadmap.notes", "roadmap.details", "roadmap.summary", "roadmap.depends-on", "roadmap.unresolved", "roadmap.impact", "roadmap.recommendation", "roadmap.ownership-error",
      "spec.requirements", "spec-index.other-area", "scene.actors", "scene.actor-role", "scene.preconditions", "scene.uncovered-step",
    ];
    context.assert(rendererKeys.every((key) => key in zh), "every dedicated-renderer string is registered in both catalogs");
  }

  stores.actions.dispose();
}
