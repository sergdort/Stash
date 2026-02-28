import { StashError } from "../../../../../packages/core/src/errors.js"
import type { SaveItemInput } from "../../../../../packages/core/src/types.js"

export function parseSaveBody(body: unknown): SaveItemInput {
  if (!body || typeof body !== "object") {
    throw new StashError("Request body is required.", "VALIDATION_ERROR", 2, 400)
  }

  const raw = body as Record<string, unknown>
  const url = raw.url
  if (typeof url !== "string" || url.trim().length === 0) {
    throw new StashError("url is required.", "VALIDATION_ERROR", 2, 400)
  }

  const title = typeof raw.title === "string" ? raw.title : undefined
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((value): value is string => typeof value === "string")
    : undefined
  const extract = typeof raw.extract === "boolean" ? raw.extract : undefined

  const input: SaveItemInput = { url }
  if (title !== undefined) {
    input.title = title
  }
  if (tags !== undefined) {
    input.tags = tags
  }
  if (extract !== undefined) {
    input.extract = extract
  }
  return input
}
