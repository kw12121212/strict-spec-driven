/**
 * Client entry of dsh-plugin-strict-spec, served as /plugins/<name>/client.js.
 *
 * The scaffold registers exactly one observable placeholder: a left-sidebar
 * panel row (icon plus locale-thunked label) whose id matches a `main` keyed
 * registration, so selecting the row resolves instead of throwing. Every
 * user-visible string is registered in both the zh and en catalogs of the
 * `strictSpec` namespace, and the component receives only framework-derived
 * props. Document discovery, the tree, and both real entry points land in
 * later planned changes of the dsh-strict-spec-viewer-foundation milestone.
 */
import type { Context as ClientContext } from "@deepseek-ai/cordis";
// Type-only contract merges: the runtime halves belong to the host shell and
// create no module request in the bundle (type-only imports are erased).
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { PlaceholderPanelIcon } from "./client/PlaceholderPanelIcon.tsx";
import { PlaceholderPanelPage } from "./client/PlaceholderPanelPage.tsx";
import { en, zh } from "./client/locales.ts";
import { createRemotePort } from "./model/port.ts";
import { createViewerStores } from "./model/store.ts";

// The discovery model's client exposure: the store factory and the remote
// port adapter later entry points consume. Re-exporting them through the
// entry keeps the model in the served bundle while registering no UI — the
// placeholder remains this change's only observable registration, and no
// remote service is injected until an entry point drives the stores.
export { createRemotePort, createViewerStores };

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    /** Strict document viewer placeholder copy. */
    strictSpec: keyof typeof zh;
  }
}

/** Services required before the placeholder registrations run. */
export const inject = ["slots", "locale"];

/** The shared identity of the sidebar row and its main panel. */
const PANEL_ID = "strict-spec";

/** Row order after the shipped global panels. */
const PANEL_ORDER = 900;

/**
 * Registers the dictionaries and the placeholder panel row plus its main cell.
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
  ctx.slots.inject("sidebar.panellist", () =>
    ctx.slots.register(
      {
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: PANEL_ORDER,
        label: () => t("panel.title"),
        registrant: "dsh-plugin-strict-spec",
      },
      PlaceholderPanelIcon,
    ),
  );
  ctx.slots.inject("main", () =>
    ctx.slots.register(
      { name: "main", key: PANEL_ID, locale: "strictSpec", registrant: "dsh-plugin-strict-spec" },
      PlaceholderPanelPage,
    ),
  );
}
