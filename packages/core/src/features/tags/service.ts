import { and, asc, eq, sql } from "drizzle-orm"

import * as schema from "../../db/schema.js"
import type { OperationContext, TagsListInput, TagsListResult } from "../../types.js"
import {
  ensureItemExists,
  ensureTagId,
  normalizeTag,
  nowMs,
  withReadyDb,
} from "../common/db.js"

export function listTags(context: OperationContext, input: TagsListInput): TagsListResult {
  const limit = input.limit ?? 50
  const offset = input.offset ?? 0

  return withReadyDb(context.dbPath, context.migrationsDir, (db) => {
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
  })
}

export function addTag(context: OperationContext, itemId: number, tag: string): {
  item_id: number
  tag: string
  added: boolean
} {
  const normalizedTag = normalizeTag(tag)

  return withReadyDb(context.dbPath, context.migrationsDir, (db) => {
    ensureItemExists(db, itemId)
    const timestamp = new Date(nowMs())

    const result = db.transaction((tx) => {
      const tagId = ensureTagId(tx, normalizedTag, timestamp)
      return tx
        .insert(schema.itemTags)
        .values({
          itemId,
          tagId,
          createdAt: timestamp,
        })
        .onConflictDoNothing()
        .run()
    })

    return {
      item_id: itemId,
      tag: normalizedTag,
      added: Number(result.changes) > 0,
    }
  })
}

export function removeTag(context: OperationContext, itemId: number, tag: string): {
  item_id: number
  tag: string
  removed: boolean
} {
  const normalizedTag = normalizeTag(tag)

  return withReadyDb(context.dbPath, context.migrationsDir, (db) => {
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
  })
}
