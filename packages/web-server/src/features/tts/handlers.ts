import fs from "node:fs"
import path from "node:path"

import { generateTts } from "../../../../core/src/features/tts/service.js"
import { StashError } from "../../../../core/src/errors.js"
import { sendJson } from "../../shared/http/response.js"
import type { RouteContext } from "../../shared/http/types.js"
import { parseFileName, parseItemId, parseTtsBody } from "./dto.js"

export async function handleGenerateTts(context: RouteContext): Promise<void> {
  const itemId = parseItemId(context.params)
  const body = parseTtsBody(context.body)
  const input = {
    itemId,
    voice: body.voice,
    audioDir: context.audioDir,
  } as {
    itemId: number
    voice: string
    format?: "mp3" | "wav"
    audioDir: string
  }
  if (body.format) {
    input.format = body.format
  }
  const result = await generateTts(
    {
      dbPath: context.dbPath,
      migrationsDir: context.migrationsDir,
    },
    input,
  )

  sendJson(context.res, 200, {
    ok: true,
    ...result,
    download_url: `/api/audio/${encodeURIComponent(result.file_name)}`,
  })
}

export function handleGetAudioFile(context: RouteContext): void {
  const fileName = parseFileName(context.params)
  const filePath = path.join(context.audioDir, fileName)

  if (!fs.existsSync(filePath)) {
    throw new StashError("Audio file not found.", "NOT_FOUND", 3, 404)
  }

  context.res.statusCode = 200
  context.res.setHeader("content-type", fileName.endsWith(".wav") ? "audio/wav" : "audio/mpeg")
  context.res.setHeader("content-disposition", `attachment; filename=\"${fileName}\"`)
  fs.createReadStream(filePath).pipe(context.res)
}
