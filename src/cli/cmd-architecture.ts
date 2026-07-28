import { generateArchitectureDocument, getArchitectureStatus } from "../architecture.js";
import { DocumentSourceError } from "../document-render.js";
import { handleHelpRequest, parseDocumentGenerateArgs } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeUsage } from "./output.js";

export function runArchitectureGenerate(argv: string[]): number {
  if (handleHelpRequest("architecture-generate", argv)) {
    return 0;
  }

  const parsed = parseDocumentGenerateArgs(argv);
  if (!parsed) {
    writeUsage(getCommandUsage("architecture-generate"));
    return 1;
  }

  try {
    const result = generateArchitectureDocument(process.cwd(), { check: parsed.check, outputPath: parsed.outputPath });
    writeJson(result);
    if (result.current) {
      return 0;
    }
    if (!result.documentExists) {
      writeError(`architecture document is missing: ${result.outputPath}; run architecture-generate to render it`);
      return 1;
    }
    writeError(
      `architecture document is stale: ${result.outputPath}; re-render it after changing ${result.staleSources.join(", ")}`,
    );
    return 1;
  } catch (error) {
    if (error instanceof DocumentSourceError) {
      writeError(error.message);
      return 1;
    }
    writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function runArchitectureStatus(argv: string[]): number {
  if (handleHelpRequest("architecture-status", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("architecture-status"));
    return 1;
  }

  try {
    const result = getArchitectureStatus(process.cwd());
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    if (error instanceof DocumentSourceError) {
      writeError(error.message);
      return 1;
    }
    writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
