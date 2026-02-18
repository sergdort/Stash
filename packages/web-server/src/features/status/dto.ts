import { StashError } from "../../../../core/src/errors.js"
import { asPositiveInt } from "../../shared/validation/parse.js"

export function parseItemId(params: Record<string, string>): number {
  return asPositiveInt(params.id, "id")
}

export function parseStatusBody(body: unknown): "read" | "unread" {
  if (!body || typeof body !== "object") {
    throw new StashError("Request body is required.", "VALIDATION_ERROR", 2, 400)
  }

  const raw = body as Record<string, unknown>
  const status = raw.status
  if (status !== "read" && status !== "unread") {
    throw new StashError("status must be read or unread.", "VALIDATION_ERROR", 2, 400)
  }

  return status
}
