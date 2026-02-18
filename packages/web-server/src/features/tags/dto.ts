import { StashError } from "../../../../core/src/errors.js"
import { asNonNegativeInt, asPositiveInt } from "../../shared/validation/parse.js"

export function parseTagsListQuery(query: URLSearchParams): { limit: number; offset: number } {
  const limitRaw = query.get("limit") ?? undefined
  const offsetRaw = query.get("offset") ?? undefined

  return {
    limit: limitRaw ? asPositiveInt(limitRaw, "limit") : 50,
    offset: offsetRaw ? asNonNegativeInt(offsetRaw, "offset") : 0,
  }
}

export function parseItemId(params: Record<string, string>): number {
  return asPositiveInt(params.id, "id")
}

export function parseTagParam(params: Record<string, string>): string {
  if (!params.tag || params.tag.trim().length === 0) {
    throw new StashError("tag is required.", "VALIDATION_ERROR", 2, 400)
  }
  return params.tag
}

export function parseTagBody(body: unknown): string {
  if (!body || typeof body !== "object") {
    throw new StashError("Request body is required.", "VALIDATION_ERROR", 2, 400)
  }

  const raw = body as Record<string, unknown>
  const tag = raw.tag
  if (typeof tag !== "string" || tag.trim().length === 0) {
    throw new StashError("tag is required.", "VALIDATION_ERROR", 2, 400)
  }

  return tag
}
