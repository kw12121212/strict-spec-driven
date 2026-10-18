/**
 * The left-sidebar panel icon of the strict documents page. Stroke follows
 * the host theme through currentColor, so no literal color appears
 * anywhere in the plugin, per the CSS and token discipline standard.
 */
import type { ReactNode } from "react";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

/** Renders the icon glyph of the strict documents panel row. */
export function PanelIcon({ size, active }: PropsRuntime<"sidebar.panellist">): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.5}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3.5" y="4.5" width="8" height="6" rx="1" />
      <rect x="14.5" y="4.5" width="6" height="15" rx="1" />
      <path d="M5 13.5h5M5 16.5h5M5 19.5h3" strokeLinecap="round" />
    </svg>
  );
}
