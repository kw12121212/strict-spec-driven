/**
 * Client entry of dsh-plugin-strict-spec, served as /plugins/<name>/client.js.
 *
 * The entry registers both strict document surfaces. The left-sidebar
 * panel: a sidebar.panellist row (icon plus locale-thunked label) whose id
 * matches the `main` keyed registration, so selecting the row opens the
 * two-pane strict documents page. Because the main keyed slot receives no
 * Session binding while every remote.workspaceFiles call needs a sessionId,
 * the page owns an explicit Session picker: the entry injects the host's
 * session and workspace service faces and adapts them once into the
 * plugin-owned picker seam, next to the discovery model's remote port, so
 * model modules stay dsh-free. The root-scoped page selection store
 * survives page remounts, so reopening the page restores the chosen
 * Session and the selected document.
 *
 * The right-sidebar tab: the sidebarRightTabs registry carries the static
 * tab type (the package id, a page kind opened by kind, a thunked title,
 * and one guide entry that makes it discoverable), and the body registers
 * in the sidebar.right.pane.tab keyed slot through the declaration-aware
 * inject path. That seat is Session-scoped: its inject factory receives
 * the sessionId of the Session surface rendering the tab and returns one
 * per-Session tab surface from the model's cache, so the tab body binds to
 * the active Session, follows Session switches with the default
 * unmount-on-hide teardown closing the previous Session's watches, and
 * never shares viewer stores with another Session. Both registrations go
 * through ctx.slots.inject, and every user-visible string is registered in
 * both the zh and en catalogs of the `strictSpec` namespace.
 */
import type { Context as ClientContext } from "@deepseek-ai/cordis";
// Type-only contract merges: the runtime halves belong to the host shell and
// create no module request in the bundle (type-only imports are erased). The
// api controller merges declare the ctx.sessions and ctx.workspaces service
// faces the Session picker seam adapts; the sidebar-right merge declares the
// ctx.sidebarRightTabs registry the tab type registers through. Their
// packages stay type-only devDependencies, so the bundle gains no runtime
// require for them.
import type {} from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-api-workspace-controller/client";
// The generated remote-client half composes the `workspaceFiles` namespace
// onto ctx.remote; loading its types is what makes the remote port adapter
// type-check against the real face.
import type {} from "@deepseek-ai/dsh-api-workspace-files/remote";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type { ReactNode } from "react";
import { jsx } from "react/jsx-runtime";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { PanelIcon } from "./client/PanelIcon.tsx";
import { StrictDocumentsPage } from "./client/StrictDocumentsPage.tsx";
import { StrictDocumentsTab } from "./client/StrictDocumentsTab.tsx";
import { en, zh } from "./client/locales.ts";
import { createPageController, createPageSelectionStore, createSessionCatalogPort } from "./model/picker.ts";
import { createTabSurfaces } from "./model/tab.ts";
import { createRemotePort } from "./model/port.ts";
import { createViewerStores } from "./model/store.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    /** Strict document viewer copy. */
    strictSpec: keyof typeof zh;
  }
}

/** Services required before the panel registrations run. */
export const inject = ["slots", "locale", "remote", "remote.workspaceFiles", "sessions", "workspaces", "sidebarRightTabs"];

/** The shared identity of the sidebar row and its main panel. */
const PANEL_ID = "strict-spec";

/** Row order after the shipped global panels. */
const PANEL_ORDER = 900;

/** The tab type's implementation identity in the right-sidebar registry. */
const TAB_ID = "dsh-plugin-strict-spec";

/** The tab's kind: a page type opened by kind, matching no resource address. */
const TAB_KIND = "strict-spec-documents";

/** Guide entry order among the shipped types' entries. */
const TAB_GUIDE_ORDER = 90;

/**
 * Registers the dictionaries, the strict documents panel row with its main
 * page, and the Session-bound strict documents right-sidebar tab.
 *
 * The slot registrations go through `ctx.slots.inject`, the
 * declaration-aware installation path: a dynamic plugin fiber can activate
 * before the shell entries that declare `sidebar.panellist`, `main`, and
 * `sidebar.right.pane.tab` have committed their children tables, and
 * registering into an undeclared slot throws. `inject` runs the
 * registration the moment the declaration is live (immediately when it
 * already is) and collects the disposers on declaration collapse and fiber
 * unload. The tab-type registration goes through `ctx.effect` around the
 * registry's own disposer, the same two-stage path the host's shipped tab
 * types use.
 *
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register("strictSpec", { zh, en }), "dsh-plugin-strict-spec: dictionaries");
  const t = ctx.locale.bind("strictSpec");
  // The seams both surfaces consume: one stateless remote workspace-files
  // port shared by the page viewer and every per-Session tab surface, the
  // session catalog adapted from the injected service faces, and the
  // root-scoped page selection that survives page remounts. Created once
  // per client load so each surface keeps its own viewer state.
  const remotePort = createRemotePort({ workspaceFiles: ctx.remote.workspaceFiles });
  const viewer = createViewerStores(remotePort);
  const page = createPageSelectionStore();
  const controller = createPageController(viewer, page.store);
  const picker = createSessionCatalogPort(ctx.sessions, ctx.workspaces);
  const tabSurfaces = createTabSurfaces(remotePort);
  // The main-slot occupant closes over the seams so the page component
  // itself stays a pure props consumer; building the element through the
  // shared jsx-runtime factory keeps the bundle off a bare react require
  // the host's frozen module table does not share. The tab body needs no
  // wrapper: the seat's per-Session inject factory supplies its surface
  // and the locale registration supplies its translate function.
  const PageWithSeams = (slotProps: PropsRuntime<"main"> & PropsLocale<"strictSpec">): ReactNode =>
    jsx(StrictDocumentsPage, { ...slotProps, picker, pageSelection: page.store, pageActions: page.actions, controller, viewer });
  ctx.slots.inject("sidebar.panellist", () =>
    ctx.slots.register(
      {
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: PANEL_ORDER,
        label: () => t("panel.title"),
        registrant: "dsh-plugin-strict-spec",
      },
      PanelIcon,
    ),
  );
  ctx.slots.inject("main", () =>
    ctx.slots.register(
      { name: "main", key: PANEL_ID, locale: "strictSpec", registrant: "dsh-plugin-strict-spec" },
      PageWithSeams,
    ),
  );
  // Stage one of the tab registration: the static type with its guide
  // entry, owned by the registry for this fiber's lifetime. The default
  // extension priority band is the right one for a type from outside the
  // product, and omitting patterns makes it a page type opened by kind.
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: TAB_KIND,
        title: () => t("tab.title"),
        guide: [
          {
            id: "open",
            order: TAB_GUIDE_ORDER,
            title: () => t("tab.guide-title"),
            description: () => t("tab.guide-description"),
          },
        ],
      }),
    "dsh-plugin-strict-spec: sidebar-right tab type",
  );
  // Stage two: the body under the type's own id. The seat calls the inject
  // factory with the sessionId of the Session surface rendering the tab,
  // and the factory returns that Session's cached surface, so each surface
  // binds one Session and its teardown runs on body unmount. The collected
  // disposer also clears the whole surface cache, so an unloaded fiber
  // leaks no watches.
  ctx.slots.inject("sidebar.right.pane.tab", () => {
    const unregister = ctx.slots.register(
      {
        name: "sidebar.right.pane.tab",
        key: TAB_ID,
        locale: "strictSpec",
        registrant: "dsh-plugin-strict-spec",
        inject: (sessionId: string) => ({ surface: tabSurfaces.get(sessionId) }),
      },
      StrictDocumentsTab,
    );
    return () => {
      unregister();
      tabSurfaces.dispose();
    };
  });
}
