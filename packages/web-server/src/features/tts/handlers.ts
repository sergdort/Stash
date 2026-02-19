import fs from "node:fs"
import path from "node:path"

import {
  enqueueTtsJob,
  getTtsJob,
  listTtsJobsForItem,
  waitForTtsJob,
} from "../../../../core/src/features/tts/jobs.js"
import { StashError } from "../../../../core/src/errors.js"
import { sendJson } from "../../shared/http/response.js"
import type { RouteContext } from "../../shared/http/types.js"
import { parseFileName, parseItemId, parseJobListQuery, parseTtsBody } from "./dto.js"

function mapJobFailureToHttp(errorCode: string | null): number {
  switch (errorCode) {
    case "NO_CONTENT":
      return 400
    case "NOT_FOUND":
      return 404
    case "TTS_PROVIDER_UNAVAILABLE":
      return 503
    default:
      return 500
  }
}

export async function handleGenerateTts(context: RouteContext): Promise<void> {
  const itemId = parseItemId(context.params)
  const body = parseTtsBody(context.body)
  const enqueueInput = {
    itemId,
    voice: body.voice,
  } as {
    itemId: number
    voice: string
    format?: "mp3" | "wav"
  }
  if (body.format !== undefined) {
    enqueueInput.format = body.format
  }

  const enqueue = enqueueTtsJob(
    {
      dbPath: context.dbPath,
      migrationsDir: context.migrationsDir,
    },
    enqueueInput,
  )

  if (body.wait) {
    const job = await waitForTtsJob(
      {
        dbPath: context.dbPath,
        migrationsDir: context.migrationsDir,
      },
      enqueue.job.id,
      {
        pollMs: enqueue.poll_interval_ms,
      },
    )

    if (job.status === "failed") {
      throw new StashError(
        job.error_message ?? "TTS job failed.",
        job.error_code ?? "INTERNAL_ERROR",
        1,
        mapJobFailureToHttp(job.error_code),
      )
    }

    if (!job.output_file_name) {
      throw new StashError("TTS job finished without output file.", "INTERNAL_ERROR", 1, 500)
    }

    sendJson(context.res, 200, {
      ok: true,
      job,
      playback_url: `/api/audio/${encodeURIComponent(job.output_file_name)}`,
      download_url: `/api/audio/${encodeURIComponent(job.output_file_name)}?download=1`,
    })
    return
  }

  sendJson(context.res, enqueue.created ? 202 : 200, {
    ok: true,
    created: enqueue.created,
    job: enqueue.job,
    poll_interval_ms: enqueue.poll_interval_ms,
    poll_url: `/api/tts-jobs/${enqueue.job.id}`,
  })
}

export function handleGetTtsJob(context: RouteContext): void {
  const jobId = parseItemId(context.params)
  const job = getTtsJob(
    {
      dbPath: context.dbPath,
      migrationsDir: context.migrationsDir,
    },
    jobId,
  )

  sendJson(context.res, 200, {
    ok: true,
    job,
  })
}

export function handleListItemTtsJobs(context: RouteContext): void {
  const itemId = parseItemId(context.params)
  const { limit, offset } = parseJobListQuery(context.query)
  const jobs = listTtsJobsForItem(
    {
      dbPath: context.dbPath,
      migrationsDir: context.migrationsDir,
    },
    itemId,
    limit,
    offset,
  )

  sendJson(context.res, 200, {
    ok: true,
    jobs,
    paging: {
      limit,
      offset,
      returned: jobs.length,
    },
  })
}

export function handleGetAudioFile(context: RouteContext): void {
  const fileName = parseFileName(context.params)
  const filePath = path.join(context.audioDir, fileName)
  const forceDownload = context.query.get("download") === "1"

  if (!fs.existsSync(filePath)) {
    throw new StashError("Audio file not found.", "NOT_FOUND", 3, 404)
  }

  context.res.statusCode = 200
  context.res.setHeader("content-type", fileName.endsWith(".wav") ? "audio/wav" : "audio/mpeg")
  context.res.setHeader(
    "content-disposition",
    `${forceDownload ? "attachment" : "inline"}; filename="${fileName}"`,
  )
  fs.createReadStream(filePath).pipe(context.res)
}
