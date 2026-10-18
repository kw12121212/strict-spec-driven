/**
 * Host entry of dsh-plugin-strict-spec: the cordis plugin row the bundle patch
 * inserts. This scaffold change proves the install-to-load path only, so the
 * host half applies nothing; document discovery, the tree, and both entry
 * points land in later planned changes of the dsh-strict-spec-viewer-foundation
 * milestone. The viewer stays read-only and never invokes strict-spec-cli.
 */
import type { Context } from "@deepseek-ai/cordis";

/** No host-side services are required by the placeholder. */
export const inject: string[] = [];

/** Applies nothing: the observable placeholder lives in the client half. */
export function apply(_ctx: Context): void {
  // Deliberately empty.
}
