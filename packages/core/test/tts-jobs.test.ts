import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { openDb } from "../src/db/client.js"
import { runMigrations } from "../src/db/migrate.js"
import * as schema from "../src/db/schema.js"
import {
  claimNextQueuedJob,
  completeJobSuccess,
  enqueueTtsJob,
  getTtsJob,
  listTtsJobsForItem,
  markStaleRunningJobsFailed,
  processNextTtsJob,
  pruneOldTerminalJobs,
} from "../src/features/tts/jobs.js"
import type { OperationContext } from "../src/types.js"

function createTempContext(): { context: OperationContext; tempDir: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-core-tts-jobs-"))
  return {
    context: {
      dbPath: path.join(tempDir, "stash.db"),
      migrationsDir: path.join(process.cwd(), "drizzle"),
    },
    tempDir,
  }
}

function seedItemWithContent(context: OperationContext, content = "test content"): number {
  fs.mkdirSync(path.dirname(context.dbPath), { recursive: true })
  runMigrations(context.dbPath, context.migrationsDir)
  const { db, sqlite } = openDb(context.dbPath)
  try {
    const timestamp = new Date()
    const insert = db
      .insert(schema.items)
      .values({
        url: `https://example.com/${Math.random().toString(16).slice(2)}`,
        title: "Example",
        domain: "example.com",
        status: "unread",
        isStarred: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        readAt: null,
        archivedAt: null,
      })
      .run()
    const itemId = Number(insert.lastInsertRowid)

    db.insert(schema.notes)
      .values({
        itemId,
        content,
        updatedAt: timestamp,
      })
      .run()

    return itemId
  } finally {
    sqlite.close()
  }
}

describe("tts jobs service", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it("enqueue creates queued job and deduplicates active job per item", () => {
    const { context, tempDir } = createTempContext()
    tempDirs.push(tempDir)

    const itemId = seedItemWithContent(context)
    const first = enqueueTtsJob(context, { itemId, format: "mp3" })
    const second = enqueueTtsJob(context, { itemId, format: "mp3" })

    expect(first.created).toBe(true)
    expect(first.job.status).toBe("queued")
    expect(second.created).toBe(false)
    expect(second.job.id).toBe(first.job.id)
  })

  it("claims queued job atomically", () => {
    const { context, tempDir } = createTempContext()
    tempDirs.push(tempDir)

    const itemId = seedItemWithContent(context)
    const queued = enqueueTtsJob(context, { itemId })
    const claimed = claimNextQueuedJob(context)
    const none = claimNextQueuedJob(context)

    expect(claimed?.id).toBe(queued.job.id)
    expect(claimed?.status).toBe("running")
    expect(none).toBeNull()
  })

  it("marks stale running jobs as failed", () => {
    const { context, tempDir } = createTempContext()
    tempDirs.push(tempDir)

    const itemId = seedItemWithContent(context)
    const queued = enqueueTtsJob(context, { itemId })
    const claimed = claimNextQueuedJob(context)
    expect(claimed?.status).toBe("running")

    const changed = markStaleRunningJobsFailed(context)
    const updated = getTtsJob(context, queued.job.id)

    expect(changed).toBe(1)
    expect(updated.status).toBe("failed")
    expect(updated.error_code).toBe("WORKER_RESTARTED")
  })

  it("prunes only old terminal jobs", () => {
    const { context, tempDir } = createTempContext()
    tempDirs.push(tempDir)

    const itemId = seedItemWithContent(context)
    const queued = enqueueTtsJob(context, { itemId })
    const claimed = claimNextQueuedJob(context)
    expect(claimed).not.toBeNull()

    completeJobSuccess(context, queued.job.id, "old-file.mp3")

    const { db, sqlite } = openDb(context.dbPath)
    try {
      const oldTimestamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      db.update(schema.ttsJobs)
        .set({
          updatedAt: oldTimestamp,
        })
        .where(eq(schema.ttsJobs.id, queued.job.id))
        .run()
    } finally {
      sqlite.close()
    }

    const deleted = pruneOldTerminalJobs(context)
    const jobs = listTtsJobsForItem(context, itemId, 10, 0)
    expect(deleted).toBe(1)
    expect(jobs).toHaveLength(0)
  })

  it("processes queued job and persists latest item audio", async () => {
    const { context, tempDir } = createTempContext()
    tempDirs.push(tempDir)

    const itemId = seedItemWithContent(context, "Audio body for synthesis.")
    const queued = enqueueTtsJob(context, { itemId, format: "mp3" })
    const audioDir = path.join(tempDir, "audio")

    const processed = await processNextTtsJob(context, { audioDir })
    const finalJob = getTtsJob(context, queued.job.id)

    expect(processed).not.toBeNull()
    expect(finalJob.status).toBe("succeeded")
    expect(finalJob.output_file_name).toBeTruthy()

    const { db, sqlite } = openDb(context.dbPath)
    try {
      const row = db
        .select()
        .from(schema.itemAudio)
        .where(eq(schema.itemAudio.itemId, itemId))
        .get()
      expect(row).toBeTruthy()
      expect(row?.fileName).toBe(finalJob.output_file_name)
    } finally {
      sqlite.close()
    }
  })
})
