import os from "node:os";
import path from "node:path";

export function defaultJobsDir(): string {
  return path.join(os.homedir(), "Downloads");
}

/** Path shown in CLI output (never an expanded home directory). */
export function displayPath(filePath: string): string {
  const homedir = os.homedir();
  const resolved = path.resolve(filePath);
  const normalizedHome = homedir.endsWith(path.sep)
    ? homedir.slice(0, -1)
    : homedir;
  if (
    resolved === normalizedHome ||
    resolved.startsWith(`${normalizedHome}${path.sep}`)
  ) {
    return `~${resolved.slice(normalizedHome.length).replace(/\\/g, "/")}`;
  }
  return filePath;
}
