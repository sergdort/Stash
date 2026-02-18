import fs from "node:fs"
import path from "node:path"

import { eq } from "drizzle-orm"

import * as schema from "../../db/schema.js"
import { StashError } from "../../errors.js"
import { DEFAULT_AUDIO_DIR, resolveAudioDir } from "../../lib/paths.js"
import { buildFriendlyFilename, ensureUniqueFilePath } from "../../lib/tts/files.js"
import { coquiTtsProvider } from "../../lib/tts/providers/coqui.js"
import { TtsProviderError, type TtsFormat } from "../../lib/tts/types.js"
import type { OperationContext, TtsResult } from "../../types.js"
import { parseTtsFormat } from "../common/validation.js"
import { withReadyDb } from "../common/db.js"

export type GenerateTtsInput = {
  itemId: number
  voice: string
  format?: string
  out?: string
  audioDir?: string
}

function resolveCliPath(input: string): string {
  if (input.startsWith("~/")) {
    const home = process.env.HOME
    if (home) {
      return path.join(home, input.slice(2))
    }
  }
  return path.resolve(input)
}

function getItemTextForTts(context: OperationContext, itemId: number): { title: string | null; text: string } {
  return withReadyDb(context.dbPath, context.migrationsDir, (db) => {
    const row = db
      .select({
        id: schema.items.id,
        title: schema.items.title,
        content: schema.notes.content,
      })
      .from(schema.items)
      .leftJoin(schema.notes, eq(schema.notes.itemId, schema.items.id))
      .where(eq(schema.items.id, itemId))
      .get()

    if (!row) {
      throw new StashError(`Item ${itemId} not found.`, "NOT_FOUND", 3, 404)
    }

    const text = row.content?.trim() ?? ""
    if (text.length === 0) {
      throw new StashError(
        `No extracted content found for item ${itemId}. Save without --no-extract or re-save the URL.`,
        "NO_CONTENT",
        2,
        400,
      )
    }

    return {
      title: row.title,
      text,
    }
  })
}

function resolveTtsOutputPath(
  itemId: number,
  title: string | null,
  voice: string,
  format: TtsFormat,
  outputFilePath?: string,
  audioDirInput?: string,
): string {
  if (outputFilePath && outputFilePath.trim().length > 0) {
    const resolved = resolveCliPath(outputFilePath)
    const ext = path.extname(resolved).toLowerCase()
    if (ext.length > 0 && ext !== ".mp3" && ext !== ".wav") {
      throw new StashError("Output file extension must be .mp3 or .wav.", "VALIDATION_ERROR", 2, 400)
    }

    if (resolved.endsWith(path.sep)) {
      throw new StashError(
        "Output path must include a file name. Use --audio-dir for folder output.",
        "VALIDATION_ERROR",
        2,
        400,
      )
    }

    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      throw new StashError(
        "Output path points to a directory. Use --audio-dir for folder output.",
        "VALIDATION_ERROR",
        2,
        400,
      )
    }

    const withExtension = ext.length > 0 ? resolved : `${resolved}.${format}`
    fs.mkdirSync(path.dirname(withExtension), { recursive: true })
    return withExtension
  }

  const resolvedAudioDir = resolveAudioDir(audioDirInput ?? process.env.STASH_AUDIO_DIR ?? DEFAULT_AUDIO_DIR)
  fs.mkdirSync(resolvedAudioDir, { recursive: true })

  const fileName = buildFriendlyFilename({
    itemId,
    title,
    voice,
    format,
  })

  return ensureUniqueFilePath(path.join(resolvedAudioDir, fileName))
}

export async function generateTts(context: OperationContext, input: GenerateTtsInput): Promise<TtsResult> {
  const format = parseTtsFormat(input.format ?? "mp3")
  const voice = input.voice?.trim() ?? "tts_models/en/vctk/vits|p241"
  if (voice.length === 0) {
    throw new StashError("Voice cannot be empty.", "VALIDATION_ERROR", 2, 400)
  }

  const { title, text } = getItemTextForTts(context, input.itemId)

  let audioBuffer: Buffer
  let provider = "coqui"

  try {
    const result = await coquiTtsProvider.synthesize({
      text,
      voice,
      format,
    })

    audioBuffer = result.audio
    provider = result.provider
  } catch (error) {
    if (error instanceof TtsProviderError) {
      if (error.code === "TTS_PROVIDER_UNAVAILABLE") {
        throw new StashError(`TTS is unavailable. ${error.message}`, "TTS_PROVIDER_UNAVAILABLE", 2, 503)
      }
      throw new StashError(`TTS provider error: ${error.message}`, "INTERNAL_ERROR", 1, 500)
    }

    throw error
  }

  const outputPath = resolveTtsOutputPath(
    input.itemId,
    title,
    voice,
    format,
    input.out,
    input.out ? undefined : input.audioDir,
  )

  fs.writeFileSync(outputPath, audioBuffer)

  return {
    item_id: input.itemId,
    provider,
    voice,
    format,
    output_path: outputPath,
    file_name: path.basename(outputPath),
    bytes: audioBuffer.length,
  }
}
