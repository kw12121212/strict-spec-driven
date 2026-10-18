/**
 * The dsh-free static render helpers for component tests.
 *
 * react-dom/server static rendering is the component-test approach the
 * dsh-plugin-client standard fixes: the same component code the host mounts
 * runs under `bun test/run.ts` with no browser, no DOM, and no dsh process.
 * The re-exports live inside the plugin package so every React resolution
 * starts from the plugin's own node_modules and the repository root needs
 * no React dependency of its own; suites build elements with createElement
 * so no JSX runtime import leaks into their own module space.
 */
export { renderToString } from "react-dom/server";
export { createElement } from "react";
