/**
 * The placeholder central panel: registering the matching `main` key keeps the
 * sidebar row's selection resolvable, and one locale-registered sentence is all
 * the scaffold renders — no document tree, no document view. The real
 * two-pane page with the Session picker lands with register-left-panel-page.
 */
import type { ReactNode } from "react";
import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

/** Renders the placeholder body of the strict documents main panel. */
export function PlaceholderPanelPage(props: PropsRuntime<"main"> & PropsLocale<"strictSpec">): ReactNode {
  return <div role="status">{props.t("panel.placeholder")}</div>;
}
