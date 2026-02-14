import os from "node:os";
import path from "node:path";

export const DEFAULT_DB_PATH = path.join(os.homedir(), ".stash", "stash.db");

export function resolveDbPath(input?: string): string {
  if (!input || input.trim().length === 0) {
    return DEFAULT_DB_PATH;
  }

  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }

  return path.resolve(input);
}
