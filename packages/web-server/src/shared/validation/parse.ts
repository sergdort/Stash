import { StashError } from "../../../../core/src/errors.js"

export function asPositiveInt(value: string | undefined, field: string): number {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new StashError(`${field} must be a positive integer.`, "VALIDATION_ERROR", 2, 400)
  }
  return parsed
}

export function asNonNegativeInt(value: string | undefined, field: string): number {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new StashError(`${field} must be a non-negative integer.`, "VALIDATION_ERROR", 2, 400)
  }
  return parsed
}

export function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StashError(`${field} is required.`, "VALIDATION_ERROR", 2, 400)
  }
  return value
}
