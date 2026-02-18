import { asPositiveInt } from "../../shared/validation/parse.js"

export function parseItemId(params: Record<string, string>): number {
  return asPositiveInt(params.id, "id")
}
