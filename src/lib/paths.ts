import os from "node:os"
import path from "node:path"

const DEFAULT_STASH_HOME = path.join(os.homedir(), ".stash")

export const DEFAULT_DB_PATH = path.join(DEFAULT_STASH_HOME, "stash.db")
export const DEFAULT_AUDIO_DIR = path.join(DEFAULT_STASH_HOME, "audio")

function resolvePath(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2))
  }

  return path.resolve(input)
}

export function resolveDbPath(input?: string): string {
  if (!input || input.trim().length === 0) {
    return DEFAULT_DB_PATH
  }
  return resolvePath(input)
}

export function resolveAudioDir(input?: string): string {
  if (!input || input.trim().length === 0) {
    return DEFAULT_AUDIO_DIR
  }
  return resolvePath(input)
}
