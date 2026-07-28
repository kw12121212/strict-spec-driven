import { DesignSourceError, generateDesignDocument, getDesignStatus } from "../design.js";
import { handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeJson, writeUsage } from "./output.js";

type DesignGenerateArgs = {
  check: boolean;
  outputPath?: string;
};

function parseDesignGenerateArgs(argv: string[]): DesignGenerateArgs | null {
  const parsed: DesignGenerateArgs = { check: false };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--check") {
      if (parsed.check) return null;
      parsed.check = true;
      continue;
    }
    if (token === "--output") {
      const value = argv[index + 1];
      if (parsed.outputPath !== undefined || value === undefined || value.startsWith("--")) return null;
      parsed.outputPath = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--output=")) {
      const value = token.slice("--output=".length);
      if (parsed.outputPath !== undefined || value.length === 0) return null;
      parsed.outputPath = value;
      continue;
    }
    return null;
  }

  return parsed;
}

export function runDesignGenerate(argv: string[]): number {
  if (handleHelpRequest("design-generate", argv)) {
    return 0;
  }

  const parsed = parseDesignGenerateArgs(argv);
  if (!parsed) {
    writeUsage(getCommandUsage("design-generate"));
    return 1;
  }

  try {
    const result = generateDesignDocument(process.cwd(), { check: parsed.check, outputPath: parsed.outputPath });
    writeJson(result);
    if (result.current) {
      return 0;
    }
    if (!result.documentExists) {
      writeError(`design document is missing: ${result.outputPath}; run design-generate to render it`);
      return 1;
    }
    writeError(
      `design document is stale: ${result.outputPath}; re-render it after changing ${result.staleSources.join(", ")}`,
    );
    return 1;
  } catch (error) {
    if (error instanceof DesignSourceError) {
      writeError(error.message);
      return 1;
    }
    writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function runDesignStatus(argv: string[]): number {
  if (handleHelpRequest("design-status", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("design-status"));
    return 1;
  }

  try {
    const result = getDesignStatus(process.cwd());
    writeJson(result);
    return result.valid ? 0 : 1;
  } catch (error) {
    if (error instanceof DesignSourceError) {
      writeError(error.message);
      return 1;
    }
    writeError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
