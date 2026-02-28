import { asPositiveInt } from "../../shared/validation/parse.js"

export function parseItemId(params: Record<string, string>): number {
  return asPositiveInt(params.id, "id")
}

export function parseForce(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return false
  }

  const raw = body as Record<string, unknown>
  return Boolean(raw.force)
}
