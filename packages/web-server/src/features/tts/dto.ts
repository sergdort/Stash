import { StashError } from "../../../../core/src/errors.js"
import { asNonNegativeInt, asPositiveInt } from "../../shared/validation/parse.js"

export function parseItemId(params: Record<string, string>): number {
  return asPositiveInt(params.id, "id")
}

export function parseTtsBody(body: unknown): {
  voice: string
  format?: "mp3" | "wav"
  wait?: boolean
} {
  if (!body || typeof body !== "object") {
    return { voice: "tts_models/en/vctk/vits|p241", format: "mp3", wait: false }
  }

  const raw = body as Record<string, unknown>
  const voice = raw.voice
  const format = raw.format
  const wait = raw.wait

  if (voice !== undefined && (typeof voice !== "string" || voice.trim().length === 0)) {
    throw new StashError("voice must be a non-empty string.", "VALIDATION_ERROR", 2, 400)
  }

  if (format !== undefined && format !== "mp3" && format !== "wav") {
    throw new StashError("format must be mp3 or wav.", "VALIDATION_ERROR", 2, 400)
  }
  if (wait !== undefined && typeof wait !== "boolean") {
    throw new StashError("wait must be boolean.", "VALIDATION_ERROR", 2, 400)
  }

  const parsed: { voice: string; format?: "mp3" | "wav"; wait?: boolean } = {
    voice: (voice as string | undefined) ?? "tts_models/en/vctk/vits|p241",
    wait: (wait as boolean | undefined) ?? false,
  }

  if (format !== undefined) {
    parsed.format = format
  }

  return parsed
}

export function parseFileName(params: Record<string, string>): string {
  const fileName = params.fileName
  if (!fileName || fileName.includes("..") || fileName.includes("/")) {
    throw new StashError("Invalid file name.", "VALIDATION_ERROR", 2, 400)
  }
  return fileName
}

export function parseJobListQuery(query: URLSearchParams): { limit: number; offset: number } {
  const limitRaw = query.get("limit") ?? undefined
  const offsetRaw = query.get("offset") ?? undefined

  return {
    limit: limitRaw ? asPositiveInt(limitRaw, "limit") : 10,
    offset: offsetRaw ? asNonNegativeInt(offsetRaw, "offset") : 0,
  }
}
