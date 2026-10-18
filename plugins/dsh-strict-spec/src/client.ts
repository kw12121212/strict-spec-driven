/**
 * Client entry of dsh-plugin-strict-spec, served as /plugins/<name>/client.js.
 *
 * The entry registers the strict documents left-sidebar panel: a
 * sidebar.panellist row (icon plus locale-thunked label) whose id matches
 * the `main` keyed registration, so selecting the row opens the two-pane
 * strict documents page. Because the main keyed slot receives no Session
 * binding while every remote.workspaceFiles call needs a sessionId, the
 * page owns an explicit Session picker: the entry injects the host's
 * session and workspace service faces and adapts them once into the
 * plugin-owned picker seam, next to the discovery model's remote port,
 * so model modules stay dsh-free. The root-scoped page selection store
 * survives page remounts, so reopening the page restores the chosen
 * Session and the selected document. Every user-visible string is
 * registered in both the zh and en catalogs of the `strictSpec`
 * namespace, and both registrations go through the declaration-aware
 * ctx.slots.inject path.
 */
import type { Context as ClientContext } from "@deepseek-ai/cordis";
// Type-only contract merges: the runtime halves belong to the host shell and
// create no module request in the bundle (type-only imports are erased). The
// api controller merges declare the ctx.sessions and ctx.workspaces service
// faces the Session picker seam adapts; their packages stay type-only
// devDependencies, so the bundle gains no runtime require for them.
import type {} from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-api-workspace-controller/client";
// The generated remote-client half composes the `workspaceFiles` namespace
// onto ctx.remote; loading its types is what makes the remote port adapter
// type-check against the real face.
import type {} from "@deepseek-ai/dsh-api-workspace-files/remote";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type { ReactNode } from "react";
import { jsx } from "react/jsx-runtime";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { PanelIcon } from "./client/PanelIcon.tsx";
import { StrictDocumentsPage } from "./client/StrictDocumentsPage.tsx";
import { en, zh } from "./client/locales.ts";
import { createPageController, createPageSelectionStore, createSessionCatalogPort } from "./model/picker.ts";
import { createRemotePort } from "./model/port.ts";
import { createViewerStores } from "./model/store.ts";

// The discovery model's client exposure: the store factory and the remote
// port adapter the page drives. Re-exporting them through the entry keeps
// the model in the served bundle for the right-sidebar tab change to
// register the same way.
export { createRemotePort, createViewerStores };

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    /** Strict document viewer copy. */
    strictSpec: keyof typeof zh;
  }
}

/** Services required before the panel registrations run. */
export const inject = ["slots", "locale", "remote", "remote.workspaceFiles", "sessions", "workspaces"];

/** The shared identity of the sidebar row and its main panel. */
const PANEL_ID = "strict-spec";

/** Row order after the shipped global panels. */
const PANEL_ORDER = 900;

/**
 * Registers the dictionaries and the strict documents panel row plus its
 * main page.
 *
 * Both registrations go through `ctx.slots.inject`, the declaration-aware
 * installation path: a dynamic plugin fiber can activate before the shell
 * entries that declare `sidebar.panellist` and `main` have committed their
 * children tables, and registering into an undeclared slot throws. `inject`
 * runs the registration the moment the declaration is live (immediately when
 * it already is) and collects the disposers on declaration collapse and fiber
 * unload.
 *
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register("strictSpec", { zh, en }), "dsh-plugin-strict-spec: dictionaries");
  const t = ctx.locale.bind("strictSpec");
  // The seams the page consumes: the remote workspace-files port, the
  // session catalog adapted from the injected service faces, and the
  // root-scoped page selection that survives page remounts. Created once
  // per client load so the page and the later right-sidebar tab share one
  // viewer state per surface.
  const viewer = createViewerStores(createRemotePort({ workspaceFiles: ctx.remote.workspaceFiles }));
  const page = createPageSelectionStore();
  const controller = createPageController(viewer, page.store);
  const picker = createSessionCatalogPort(ctx.sessions, ctx.workspaces);
  // The main-slot occupant closes over the seams so the page component
  // itself stays a pure props consumer; building the element through the
  // shared jsx-runtime factory keeps the bundle off a bare react require
  // the host's frozen module table does not share.
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
}
