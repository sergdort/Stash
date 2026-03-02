import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { openDb } from "../src/db/client.js"
import { runMigrations } from "../src/db/migrate.js"
import * as schema from "../src/db/schema.js"
import { applyAutoTags } from "../src/features/auto-tags/service.js"
import type { OperationContext } from "../src/types.js"

type TempContext = {
  context: OperationContext
  tempDir: string
}

function createTempContext(): TempContext {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-core-auto-tags-"))
  return {
    context: {
      dbPath: path.join(tempDir, "stash.db"),
      migrationsDir: path.join(process.cwd(), "drizzle"),
    },
    tempDir,
  }
}

function createItem(context: OperationContext, slug: string, note: string): number {
  runMigrations(context.dbPath, context.migrationsDir)
  const { db, sqlite } = openDb(context.dbPath)
  try {
    const timestamp = new Date()
    const inserted = db
      .insert(schema.items)
      .values({
        url: `https://example.com/${slug}`,
        title: slug,
        domain: "example.com",
        status: "unread",
        isStarred: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        readAt: null,
        archivedAt: null,
      })
      .run()
    const itemId = Number(inserted.lastInsertRowid)
    db.insert(schema.notes)
      .values({
        itemId,
        content: note,
        updatedAt: timestamp,
      })
      .run()
    return itemId
  } finally {
    sqlite.close()
  }
}

function createTag(context: OperationContext, tag: string): number {
  const { db, sqlite } = openDb(context.dbPath)
  try {
    const timestamp = new Date()
    db.insert(schema.tags)
      .values({
        name: tag,
        createdAt: timestamp,
      })
      .onConflictDoNothing({ target: schema.tags.name })
      .run()
    const row = db.select({ id: schema.tags.id }).from(schema.tags).where(eq(schema.tags.name, tag)).get()
    if (!row) {
      throw new Error(`missing tag ${tag}`)
    }
    return row.id
  } finally {
    sqlite.close()
  }
}

function attachTag(
  context: OperationContext,
  options: {
    itemId: number
    tagId: number
    isManual: boolean
    isAuto: boolean
  },
): void {
  const { db, sqlite } = openDb(context.dbPath)
  try {
    const timestamp = new Date()
    db.insert(schema.itemTags)
      .values({
        itemId: options.itemId,
        tagId: options.tagId,
        createdAt: timestamp,
        isManual: options.isManual,
        isAuto: options.isAuto,
        autoScore: options.isAuto ? 0.91 : null,
        autoSource: options.isAuto ? "rule" : null,
        autoModel: options.isAuto ? "rule" : null,
        autoUpdatedAt: options.isAuto ? timestamp : null,
      })
      .onConflictDoUpdate({
        target: [schema.itemTags.itemId, schema.itemTags.tagId],
        set: {
          isManual: options.isManual,
          isAuto: options.isAuto,
          autoScore: options.isAuto ? 0.91 : null,
          autoSource: options.isAuto ? "rule" : null,
          autoModel: options.isAuto ? "rule" : null,
          autoUpdatedAt: options.isAuto ? timestamp : null,
        },
      })
      .run()
  } finally {
    sqlite.close()
  }
}

describe("auto-tags service", () => {
  const tempDirs: string[] = []
  const previousBackend = process.env.STASH_AUTO_TAGS_BACKEND
  const previousMinScore = process.env.STASH_AUTO_TAGS_MIN_SCORE
  const previousMax = process.env.STASH_AUTO_TAGS_MAX

  afterEach(() => {
    if (previousBackend === undefined) {
      delete process.env.STASH_AUTO_TAGS_BACKEND
    } else {
      process.env.STASH_AUTO_TAGS_BACKEND = previousBackend
    }
    if (previousMinScore === undefined) {
      delete process.env.STASH_AUTO_TAGS_MIN_SCORE
    } else {
      process.env.STASH_AUTO_TAGS_MIN_SCORE = previousMinScore
    }
    if (previousMax === undefined) {
      delete process.env.STASH_AUTO_TAGS_MAX
    } else {
      process.env.STASH_AUTO_TAGS_MAX = previousMax
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it("uses manual DB tags as candidates and excludes auto-only DB tags", async () => {
    process.env.STASH_AUTO_TAGS_BACKEND = "rule"
    process.env.STASH_AUTO_TAGS_MIN_SCORE = "0.7"
    process.env.STASH_AUTO_TAGS_MAX = "5"

    const { context, tempDir } = createTempContext()
    tempDirs.push(tempDir)

    const seedItemId = createItem(context, "seed-item", "seed")
    const manualTagId = createTag(context, "manualonly")
    const autoOnlyTagId = createTag(context, "autoonly")
    attachTag(context, {
      itemId: seedItemId,
      tagId: manualTagId,
      isManual: true,
      isAuto: false,
    })
    attachTag(context, {
      itemId: seedItemId,
      tagId: autoOnlyTagId,
      isManual: false,
      isAuto: true,
    })

    const targetItemId = createItem(context, "target", "manualonly autoonly")
    const { db, sqlite } = openDb(context.dbPath)
    try {
      const result = await applyAutoTags(db, {
        itemId: targetItemId,
        url: "https://example.com/target",
        title: "target",
        domain: "example.com",
        content: "manualonly autoonly",
      })

      expect(result.backend).toBe("rule")
      expect(result.applied).toContain("manualonly")
      expect(result.applied).not.toContain("autoonly")
    } finally {
      sqlite.close()
    }
  })

  it("replaces stale auto-only tags and preserves manual tags", async () => {
    process.env.STASH_AUTO_TAGS_BACKEND = "rule"
    process.env.STASH_AUTO_TAGS_MIN_SCORE = "0.62"
    process.env.STASH_AUTO_TAGS_MAX = "3"

    const { context, tempDir } = createTempContext()
    tempDirs.push(tempDir)

    const itemId = createItem(context, "replace", "TypeScript integration details")
    const pythonTagId = createTag(context, "python")
    const securityTagId = createTag(context, "security")

    attachTag(context, {
      itemId,
      tagId: pythonTagId,
      isManual: false,
      isAuto: true,
    })
    attachTag(context, {
      itemId,
      tagId: securityTagId,
      isManual: true,
      isAuto: true,
    })

    const { db, sqlite } = openDb(context.dbPath)
    try {
      const result = await applyAutoTags(db, {
        itemId,
        url: "https://example.com/replace",
        title: "replace",
        domain: "example.com",
        content: "TypeScript integration details",
      })

      expect(result.applied).toContain("typescript")

      const rows = db
        .select({
          tag: schema.tags.name,
          isManual: schema.itemTags.isManual,
          isAuto: schema.itemTags.isAuto,
        })
        .from(schema.itemTags)
        .innerJoin(schema.tags, eq(schema.tags.id, schema.itemTags.tagId))
        .where(eq(schema.itemTags.itemId, itemId))
        .all()

      const byTag = new Map(rows.map((row) => [row.tag, row]))
      expect(byTag.get("python")).toBeUndefined()
      expect(byTag.get("security")?.isManual).toBe(true)
      expect(byTag.get("security")?.isAuto).toBe(false)
      expect(byTag.get("typescript")?.isAuto).toBe(true)
    } finally {
      sqlite.close()
    }
  })
})
