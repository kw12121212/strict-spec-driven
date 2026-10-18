/**
 * Host entry of dsh-plugin-strict-spec: the cordis plugin row the bundle
 * patch inserts. The viewer is a client-only, read-only surface — document
 * discovery, the tree, the renderers, and both entry points all live in
 * the client half — so the host side applies nothing and injects no
 * services. The plugin never invokes strict-spec-cli and never mutates
 * workflow files.
 */
import type { Context } from "@deepseek-ai/cordis";

/** No host-side services are required by the read-only viewer. */
export const inject: string[] = [];

/** Applies nothing: every observable surface lives in the client half. */
export function apply(_ctx: Context): void {
  // Deliberately empty.
}
