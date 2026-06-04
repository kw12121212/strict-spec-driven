#!/usr/bin/env node
import { runMcpServer, formatMcpStartupError } from "./server.js";

runMcpServer(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${formatMcpStartupError(error)}\n`);
  process.exit(1);
});
