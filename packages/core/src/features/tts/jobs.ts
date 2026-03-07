import { and, asc, desc, eq, inArray, lt } from "drizzle-orm"

import * as schema from "../../db/schema.js"
import { asStashError, StashError } from "../../errors.js"
import type { TtsJob } from "../../types.js"
import { type Db, nowMs, toIso } from "../common/db.js"
import { parseTtsFormat } from "../common/validation.js"
import { executeTtsForItem } from "./service.js"

const ACTIVE_JOB_STATUSES = ["queued", "running"] as const
const TERMINAL_JOB_STATUSES = ["succeeded", "failed"] as const
const DEFAULT_TTS_VOICE = "tts_models/en/vctk/vits|p241"
export const DEFAULT_TTS_JOB_POLL_MS = 1500
const DEFAULT_TTS_JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

type TtsJobRow = typeof schema.ttsJobs.$inferSelect

export type EnqueueTtsJobInput = {
  itemId: number
  voice?: string
  format?: string
}

export type EnqueueTtsJobResult = {
  job: TtsJob
  created: boolean
  poll_interval_ms: number
}

export type TtsWorkerOptions = {
  pollMs?: number
  audioDir?: string
  onError?: (error: unknown) => void
}

export type TtsWorkerHandle = {
  stop: () => Promise<void>
}

function serializeTtsJob(row: TtsJobRow): TtsJob {
  return {
    id: row.id,
    item_id: row.itemId,
    status: row.status as TtsJob["status"],
    voice: row.voice,
    format: row.format as TtsJob["format"],
    error_code: row.errorCode,
    error_message: row.errorMessage,
    output_file_name: row.outputFileName,
    created_at: toIso(row.createdAt) as string,
    started_at: toIso(row.startedAt),
    finished_at: toIso(row.finishedAt),
    updated_at: toIso(row.updatedAt) as string,
  }
}

function getActiveJobForItem(db: Db, itemId: number): TtsJobRow | undefined {
  return db
    .select()
    .from(schema.ttsJobs)
    .where(
      and(
        eq(schema.ttsJobs.itemId, itemId),
        inArray(schema.ttsJobs.status, [...ACTIVE_JOB_STATUSES]),
      ),
    )
    .orderBy(asc(schema.ttsJobs.createdAt), asc(schema.ttsJobs.id))
    .get()
}

function ensureItemHasExtractedContent(db: Db, itemId: number): void {
  const row = db
    .select({
      id: schema.items.id,
      content: schema.notes.content,
    })
    .from(schema.items)
    .leftJoin(schema.notes, eq(schema.notes.itemId, schema.items.id))
    .where(eq(schema.items.id, itemId))
    .get()

  if (!row) {
    throw new StashError(`Item ${itemId} not found.`, "NOT_FOUND", 3, 404)
  }

  const content = row.content?.trim() ?? ""
  if (content.length === 0) {
    throw new StashError(
      `No extracted content found for item ${itemId}. Save without --no-extract or re-save the URL.`,
      "NO_CONTENT",
      2,
      400,
    )
  }
}

export function enqueueTtsJob(db: Db, input: EnqueueTtsJobInput): EnqueueTtsJobResult {
  const voice = input.voice?.trim() || DEFAULT_TTS_VOICE
  if (voice.length === 0) {
    throw new StashError("Voice cannot be empty.", "VALIDATION_ERROR", 2, 400)
  }
  const format = parseTtsFormat(input.format ?? "mp3")

  ensureItemHasExtractedContent(db, input.itemId)

  const existing = getActiveJobForItem(db, input.itemId)
  if (existing) {
    return {
      job: serializeTtsJob(existing),
      created: false,
      poll_interval_ms: DEFAULT_TTS_JOB_POLL_MS,
    }
  }

  const createdAt = new Date(nowMs())

  try {
    const inserted = db
      .insert(schema.ttsJobs)
      .values({
        itemId: input.itemId,
        status: "queued",
        voice,
        format,
        errorCode: null,
        errorMessage: null,
        outputFileName: null,
        createdAt,
        updatedAt: createdAt,
        startedAt: null,
        finishedAt: null,
      })
      .run()

    const jobId = Number(inserted.lastInsertRowid)
    const job = getTtsJob(db, jobId)

    return {
      job,
      created: true,
      poll_interval_ms: DEFAULT_TTS_JOB_POLL_MS,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes("UNIQUE constraint failed: tts_jobs.item_id")) {
      throw error
    }

    const deduped = getActiveJobForItem(db, input.itemId)
    if (!deduped) {
      throw error
    }

    return {
      job: serializeTtsJob(deduped),
      created: false,
      poll_interval_ms: DEFAULT_TTS_JOB_POLL_MS,
    }
  }
}

export function getTtsJob(db: Db, jobId: number): TtsJob {
  const row = db.select().from(schema.ttsJobs).where(eq(schema.ttsJobs.id, jobId)).get()
  if (!row) {
    throw new StashError(`TTS job ${jobId} not found.`, "NOT_FOUND", 3, 404)
  }
  return serializeTtsJob(row)
}

export function listTtsJobsForItem(
  db: Db,
  itemId: number,
  limit = 10,
  offset = 0,
): TtsJob[] {
  const item = db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(eq(schema.items.id, itemId))
    .get()
  if (!item) {
    throw new StashError(`Item ${itemId} not found.`, "NOT_FOUND", 3, 404)
  }

  return db
    .select()
    .from(schema.ttsJobs)
    .where(eq(schema.ttsJobs.itemId, itemId))
    .orderBy(desc(schema.ttsJobs.createdAt), desc(schema.ttsJobs.id))
    .limit(limit)
    .offset(offset)
    .all()
    .map((row) => serializeTtsJob(row))
}

export function claimNextQueuedJob(db: Db): TtsJob | null {
  const queued = db
    .select()
    .from(schema.ttsJobs)
    .where(eq(schema.ttsJobs.status, "queued"))
    .orderBy(asc(schema.ttsJobs.createdAt), asc(schema.ttsJobs.id))
    .get()

  if (!queued) {
    return null
  }

  const startedAt = new Date(nowMs())
  const updated = db
    .update(schema.ttsJobs)
    .set({
      status: "running",
      startedAt,
      updatedAt: startedAt,
    })
    .where(and(eq(schema.ttsJobs.id, queued.id), eq(schema.ttsJobs.status, "queued")))
    .run()

  if (Number(updated.changes) === 0) {
    return null
  }

  const claimed = db.select().from(schema.ttsJobs).where(eq(schema.ttsJobs.id, queued.id)).get()
  return claimed ? serializeTtsJob(claimed) : null
}

export function completeJobSuccess(db: Db, jobId: number, outputFileName: string): void {
  const finishedAt = new Date(nowMs())
  db.update(schema.ttsJobs)
    .set({
      status: "succeeded",
      outputFileName,
      errorCode: null,
      errorMessage: null,
      finishedAt,
      updatedAt: finishedAt,
    })
    .where(eq(schema.ttsJobs.id, jobId))
    .run()
}

export function completeJobFailure(
  db: Db,
  jobId: number,
  errorCode: string,
  errorMessage: string,
): void {
  const finishedAt = new Date(nowMs())
  db.update(schema.ttsJobs)
    .set({
      status: "failed",
      errorCode,
      errorMessage: errorMessage.slice(0, 1024),
      finishedAt,
      updatedAt: finishedAt,
    })
    .where(eq(schema.ttsJobs.id, jobId))
    .run()
}

export function markStaleRunningJobsFailed(db: Db): number {
  const updatedAt = new Date(nowMs())
  const result = db
    .update(schema.ttsJobs)
    .set({
      status: "failed",
      errorCode: "WORKER_RESTARTED",
      errorMessage: "Worker restarted before job completion.",
      finishedAt: updatedAt,
      updatedAt,
    })
    .where(eq(schema.ttsJobs.status, "running"))
    .run()

  return Number(result.changes)
}

export function pruneOldTerminalJobs(db: Db, retentionMs = DEFAULT_TTS_JOB_RETENTION_MS): number {
  const threshold = new Date(nowMs() - retentionMs)
  const result = db
    .delete(schema.ttsJobs)
    .where(
      and(
        inArray(schema.ttsJobs.status, [...TERMINAL_JOB_STATUSES]),
        lt(schema.ttsJobs.updatedAt, threshold),
      ),
    )
    .run()
  return Number(result.changes)
}

export async function processNextTtsJob(
  db: Db,
  options: { audioDir?: string } = {},
): Promise<TtsJob | null> {
  const claimed = claimNextQueuedJob(db)
  if (!claimed) {
    return null
  }

  try {
    const executeInput = {
      itemId: claimed.item_id,
      voice: claimed.voice,
      format: claimed.format,
    } as {
      itemId: number
      voice: string
      format: "mp3" | "wav"
      audioDir?: string
    }
    if (options.audioDir) {
      executeInput.audioDir = options.audioDir
    }
    const result = await executeTtsForItem(db, executeInput)
    completeJobSuccess(db, claimed.id, result.file_name)
  } catch (error) {
    const stashError = asStashError(error)
    completeJobFailure(db, claimed.id, stashError.code, stashError.message)
  }

  return getTtsJob(db, claimed.id)
}

export async function waitForTtsJob(
  db: Db,
  jobId: number,
  options: { pollMs?: number; timeoutMs?: number } = {},
): Promise<TtsJob> {
  const pollMs = options.pollMs ?? DEFAULT_TTS_JOB_POLL_MS
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000
  const deadline = Date.now() + timeoutMs

  while (true) {
    const job = getTtsJob(db, jobId)
    if (job.status === "succeeded" || job.status === "failed") {
      return job
    }
    if (Date.now() > deadline) {
      throw new StashError(`Timed out waiting for TTS job ${jobId}.`, "TIMEOUT", 1, 504)
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollMs)
    })
  }
}

export function startTtsWorker(db: Db, options: TtsWorkerOptions = {}): TtsWorkerHandle {
  const pollMs = options.pollMs ?? DEFAULT_TTS_JOB_POLL_MS
  let shouldStop = false
  let timer: NodeJS.Timeout | null = null

  const loopPromise = (async (): Promise<void> => {
    try {
      markStaleRunningJobsFailed(db)
      pruneOldTerminalJobs(db)
    } catch (error) {
      if (options.onError) {
        options.onError(error)
      }
    }

    while (!shouldStop) {
      try {
        const processOptions = options.audioDir ? { audioDir: options.audioDir } : {}
        const processed = await processNextTtsJob(db, processOptions)
        if (processed) {
          continue
        }
      } catch (error) {
        if (options.onError) {
          options.onError(error)
        }
      }

      await new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          timer = null
          resolve()
        }, pollMs)
      })
    }
  })()

  return {
    stop: async (): Promise<void> => {
      shouldStop = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      await loopPromise
    },
  }
}

export async function runTtsWorkerOnce(db: Db, options: { audioDir?: string } = {}): Promise<TtsJob | null> {
  markStaleRunningJobsFailed(db)
  pruneOldTerminalJobs(db)
  return await processNextTtsJob(db, options)
}
