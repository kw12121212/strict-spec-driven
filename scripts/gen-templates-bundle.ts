#!/usr/bin/env bun
// Writes src/embedded-templates.ts from the bundled strict assets. The rendering itself lives in
// src/bundled-asset-mutation.ts, because the asset-editing commands must regenerate the identical
// bundle inside their own transaction — two renderers for one generated file would silently drift.
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { listEmbeddedAssetFiles, renderEmbeddedBundle } from "../src/bundled-asset-mutation.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(SCRIPT_DIR);
const OUTPUT_FILE = path.join(ROOT, "src", "embedded-templates.ts");

writeFileSync(OUTPUT_FILE, renderEmbeddedBundle(ROOT), "utf8");
console.log(`Generated src/embedded-templates.ts with ${listEmbeddedAssetFiles(ROOT).length} bundled asset files`);
