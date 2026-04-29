export function writeJson(result: unknown): void {
  process.stdout.write(JSON.stringify(result) + "\n");
}

export function writeOut(text: string): void {
  process.stdout.write(text);
}

export function writeErr(text: string): void {
  process.stderr.write(text);
}

export function writeUsage(usage: string): void {
  process.stderr.write(usage);
}

export function writeHelp(usage: string): void {
  process.stdout.write(usage);
}

export function writeError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}
