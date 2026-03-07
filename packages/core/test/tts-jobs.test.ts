import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { openDb, type StashDb } from "../src/db/client.js"
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

function createTempDb(): { tempDir: string; dbPath: string; close: () => void; db: StashDb } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-core-tts-jobs-"))
  const dbPath = path.join(tempDir, "stash.db")
  runMigrations(dbPath, path.join(process.cwd(), "drizzle"))
  const { db, sqlite } = openDb(dbPath)
  return {
    tempDir,
    dbPath,
    db,
    close: (): void => {
      sqlite.close()
    },
  }
}

function seedItemWithContent(db: StashDb, content = "test content"): number {
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
    const { db, close, tempDir } = createTempDb()
    tempDirs.push(tempDir)

    try {
      const itemId = seedItemWithContent(db)
      const first = enqueueTtsJob(db, { itemId, format: "mp3" })
      const second = enqueueTtsJob(db, { itemId, format: "mp3" })

      expect(first.created).toBe(true)
      expect(first.job.status).toBe("queued")
      expect(second.created).toBe(false)
      expect(second.job.id).toBe(first.job.id)
    } finally {
      close()
    }
  })

  it("claims queued job atomically", () => {
    const { db, close, tempDir } = createTempDb()
    tempDirs.push(tempDir)

    try {
      const itemId = seedItemWithContent(db)
      const queued = enqueueTtsJob(db, { itemId })
      const claimed = claimNextQueuedJob(db)
      const none = claimNextQueuedJob(db)

      expect(claimed?.id).toBe(queued.job.id)
      expect(claimed?.status).toBe("running")
      expect(none).toBeNull()
    } finally {
      close()
    }
  })

  it("marks stale running jobs as failed", () => {
    const { db, close, tempDir } = createTempDb()
    tempDirs.push(tempDir)

    try {
      const itemId = seedItemWithContent(db)
      const queued = enqueueTtsJob(db, { itemId })
      const claimed = claimNextQueuedJob(db)
      expect(claimed?.status).toBe("running")

      const changed = markStaleRunningJobsFailed(db)
      const updated = getTtsJob(db, queued.job.id)

      expect(changed).toBe(1)
      expect(updated.status).toBe("failed")
      expect(updated.error_code).toBe("WORKER_RESTARTED")
    } finally {
      close()
    }
  })

  it("prunes only old terminal jobs", () => {
    const { db, close, tempDir } = createTempDb()
    tempDirs.push(tempDir)

    try {
      const itemId = seedItemWithContent(db)
      const queued = enqueueTtsJob(db, { itemId })
      const claimed = claimNextQueuedJob(db)
      expect(claimed).not.toBeNull()

      completeJobSuccess(db, queued.job.id, "old-file.mp3")

      const oldTimestamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      db.update(schema.ttsJobs)
        .set({
          updatedAt: oldTimestamp,
        })
        .where(eq(schema.ttsJobs.id, queued.job.id))
        .run()

      const deleted = pruneOldTerminalJobs(db)
      const jobs = listTtsJobsForItem(db, itemId, 10, 0)
      expect(deleted).toBe(1)
      expect(jobs).toHaveLength(0)
    } finally {
      close()
    }
  })

  it("processes queued job and persists latest item audio", async () => {
    const { db, close, tempDir } = createTempDb()
    tempDirs.push(tempDir)

    try {
      const itemId = seedItemWithContent(db, "Audio body for synthesis.")
      const queued = enqueueTtsJob(db, { itemId, format: "mp3" })
      const audioDir = path.join(tempDir, "audio")

      const processed = await processNextTtsJob(db, { audioDir })
      const finalJob = getTtsJob(db, queued.job.id)

      expect(processed).not.toBeNull()
      expect(finalJob.status).toBe("succeeded")
      expect(finalJob.output_file_name).toBeTruthy()

      const row = db
        .select()
        .from(schema.itemAudio)
        .where(eq(schema.itemAudio.itemId, itemId))
        .get()
      expect(row).toBeTruthy()
      expect(row?.fileName).toBe(finalJob.output_file_name)
    } finally {
      close()
    }
  })
})
