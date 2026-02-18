import { StashError } from "../../errors.js"
import type { TtsFormat } from "../../lib/tts/types.js"

export function parseUrl(value: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new StashError(`Invalid URL: ${value}`, "VALIDATION_ERROR", 2, 400)
  }
}

export function parseTtsFormat(value: string): TtsFormat {
  const normalized = value.trim().toLowerCase()
  if (normalized !== "mp3" && normalized !== "wav") {
    throw new StashError("Invalid format. Use mp3 or wav.", "VALIDATION_ERROR", 2, 400)
  }
  return normalized
}

export function parseTagMode(value: string): "any" | "all" {
  const normalized = value.trim().toLowerCase()
  if (normalized !== "any" && normalized !== "all") {
    throw new StashError("Invalid tag mode. Use any or all.", "VALIDATION_ERROR", 2, 400)
  }
  return normalized
}

export function parseStatus(value: string): "unread" | "read" | "archived" {
  const normalized = value.trim().toLowerCase()
  if (normalized !== "unread" && normalized !== "read" && normalized !== "archived") {
    throw new StashError(
      "Invalid status. Use unread, read, or archived.",
      "VALIDATION_ERROR",
      2,
      400,
    )
  }
  return normalized
}
