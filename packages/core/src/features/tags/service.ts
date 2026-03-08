import { and, asc, eq, sql } from "drizzle-orm"

import * as schema from "../../db/schema.js"
import type { TagsListInput, TagsListResult } from "../../types.js"
import { type Db, ensureItemExists, ensureTagId, normalizeTag, nowMs } from "../common/db.js"

export function listTags(db: Db, input: TagsListInput): TagsListResult {
  const limit = input.limit ?? 50
  const offset = input.offset ?? 0

  const rows = db
    .select({
      name: schema.tags.name,
      itemCount: sql<number>`count(${schema.itemTags.itemId})`,
    })
    .from(schema.tags)
    .leftJoin(schema.itemTags, eq(schema.itemTags.tagId, schema.tags.id))
    .groupBy(schema.tags.id)
    .orderBy(asc(schema.tags.name))
    .limit(limit)
    .offset(offset)
    .all()

  const tags = rows.map((row) => ({ name: row.name, item_count: Number(row.itemCount) }))

  return {
    tags,
    paging: {
      limit,
      offset,
      returned: tags.length,
    },
  }
}

export function addTag(
  db: Db,
  itemId: number,
  tag: string,
): {
  item_id: number
  tag: string
  added: boolean
} {
  const normalizedTag = normalizeTag(tag)

  ensureItemExists(db, itemId)
  const timestamp = new Date(nowMs())
  const existing = db
    .select({
      isManual: schema.itemTags.isManual,
    })
    .from(schema.itemTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.itemTags.tagId))
    .where(and(eq(schema.itemTags.itemId, itemId), eq(schema.tags.name, normalizedTag)))
    .get()

  db.transaction((tx) => {
    const tagId = ensureTagId(tx, normalizedTag, timestamp)
    tx.insert(schema.itemTags)
      .values({
        itemId,
        tagId,
        createdAt: timestamp,
        isManual: true,
        isAuto: false,
        autoScore: null,
        autoSource: null,
        autoModel: null,
        autoUpdatedAt: null,
      })
      .onConflictDoUpdate({
        target: [schema.itemTags.itemId, schema.itemTags.tagId],
        set: {
          isManual: true,
        },
      })
      .run()
  })

  return {
    item_id: itemId,
    tag: normalizedTag,
    added: !existing || !existing.isManual,
  }
}

export function removeTag(
  db: Db,
  itemId: number,
  tag: string,
): {
  item_id: number
  tag: string
  removed: boolean
} {
  const normalizedTag = normalizeTag(tag)

  ensureItemExists(db, itemId)

  const row = db
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(eq(schema.tags.name, normalizedTag))
    .get()

  let removed = false
  if (row) {
    const result = db
      .delete(schema.itemTags)
      .where(and(eq(schema.itemTags.itemId, itemId), eq(schema.itemTags.tagId, row.id)))
      .run()
    removed = Number(result.changes) > 0
  }

  return {
    item_id: itemId,
    tag: normalizedTag,
    removed,
  }
}
