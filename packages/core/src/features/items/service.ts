import { and, desc, eq, exists, inArray, sql, type SQL } from "drizzle-orm"

import * as schema from "../../db/schema.js"
import { extractContent } from "../../lib/extract.js"
import type {
  ListItemsInput,
  ListItemsResult,
  OperationContext,
  SaveItemInput,
  SaveItemResult,
} from "../../types.js"
import {
  ensureTagId,
  getExtractedContentForItem,
  getExtractedContentMap,
  getItemAudioForItem,
  getItemAudioMap,
  getItemRowById,
  type ItemRow,
  getItemTags,
  getTagsMap,
  normalizeTags,
  nowMs,
  serializeItem,
  whereAnd,
  withReadyDb,
  withReadyDbAsync,
} from "../common/db.js"
import { parseListItemsStatusFilter, parseTagMode, parseUrl } from "../common/validation.js"

export async function saveItem(
  context: OperationContext,
  input: SaveItemInput,
): Promise<SaveItemResult> {
  const parsedUrl = parseUrl(input.url)
  const normalizedTags = normalizeTags(input.tags ?? [])

  return withReadyDbAsync(context.dbPath, context.migrationsDir, async (db) => {
    const existing = db
      .select()
      .from(schema.items)
      .where(eq(schema.items.url, parsedUrl.toString()))
      .get()
    const timestamp = new Date(nowMs())
    let created = false
    let itemId: number | undefined

    db.transaction((tx) => {
      if (existing) {
        itemId = existing.id
        if (!existing.title && input.title) {
          tx.update(schema.items)
            .set({
              title: input.title.trim(),
              updatedAt: timestamp,
            })
            .where(eq(schema.items.id, existing.id))
            .run()
        }
      } else {
        const result = tx
          .insert(schema.items)
          .values({
            url: parsedUrl.toString(),
            title: input.title?.trim() || null,
            domain: parsedUrl.hostname,
            status: "unread",
            isStarred: false,
            createdAt: timestamp,
            updatedAt: timestamp,
            readAt: null,
            archivedAt: null,
          })
          .run()

        itemId = Number(result.lastInsertRowid)
        created = true
      }

      if (itemId === undefined) {
        throw new Error("Saved item id could not be determined.")
      }

      for (const tag of normalizedTags) {
        const tagId = ensureTagId(tx, tag, timestamp)
        tx.insert(schema.itemTags)
          .values({
            itemId,
            tagId,
            createdAt: timestamp,
          })
          .onConflictDoNothing()
          .run()
      }
    })

    if (itemId === undefined) {
      throw new Error("Saved item id could not be determined.")
    }

    if (input.extract !== false && created) {
      try {
        const extracted = await extractContent(parsedUrl.toString())
        if (extracted?.textContent) {
          db.insert(schema.notes)
            .values({
              itemId,
              content: extracted.textContent,
              updatedAt: timestamp,
            })
            .onConflictDoUpdate({
              target: schema.notes.itemId,
              set: {
                content: extracted.textContent,
                updatedAt: timestamp,
              },
            })
            .run()

          if (extracted.title && !input.title) {
            db.update(schema.items)
              .set({
                title: extracted.title,
                thumbnailUrl: extracted.thumbnailUrl ?? null,
                updatedAt: timestamp,
              })
              .where(eq(schema.items.id, itemId))
              .run()
          } else {
            db.update(schema.items)
              .set({
                thumbnailUrl: extracted.thumbnailUrl ?? null,
                updatedAt: timestamp,
              })
              .where(eq(schema.items.id, itemId))
              .run()
          }
        }
      } catch {
        // Keep save action successful even when extraction fails.
      }
    }

    const row = getItemRowById(db, itemId)
    if (!row) {
      throw new Error("Saved item could not be reloaded.")
    }

    return {
      created,
      item: serializeItem(
        row,
        getItemTags(db, row.id),
        getExtractedContentForItem(db, row.id),
        getItemAudioForItem(db, row.id),
      ),
    }
  })
}

export function listItems(context: OperationContext, input: ListItemsInput): ListItemsResult {
  const limit = input.limit ?? 20
  const offset = input.offset ?? 0
  const tagMode = parseTagMode(input.tagMode ?? "any")
  const tags = normalizeTags(input.tags ?? [])
  const status = input.status ? parseListItemsStatusFilter(input.status) : undefined

  return withReadyDb(context.dbPath, context.migrationsDir, (db) => {
    const conditions: SQL[] = []

    if (status) {
      if (status === "active") {
        conditions.push(inArray(schema.items.status, ["unread", "read"]))
      } else {
        conditions.push(eq(schema.items.status, status))
      }
    }

    if (tags.length > 0) {
      if (tagMode === "any") {
        const subquery = db
          .select({ one: sql<number>`1` })
          .from(schema.itemTags)
          .innerJoin(schema.tags, eq(schema.tags.id, schema.itemTags.tagId))
          .where(and(eq(schema.itemTags.itemId, schema.items.id), inArray(schema.tags.name, tags)))
        conditions.push(exists(subquery))
      } else {
        for (const tag of tags) {
          const subquery = db
            .select({ one: sql<number>`1` })
            .from(schema.itemTags)
            .innerJoin(schema.tags, eq(schema.tags.id, schema.itemTags.tagId))
            .where(and(eq(schema.itemTags.itemId, schema.items.id), eq(schema.tags.name, tag)))
          conditions.push(exists(subquery))
        }
      }
    }

    const rows = db
      .select()
      .from(schema.items)
      .where(whereAnd(conditions))
      .orderBy(desc(schema.items.createdAt), desc(schema.items.id))
      .limit(limit)
      .offset(offset)
      .all() as ItemRow[]

    const tagsMap = getTagsMap(
      db,
      rows.map((row) => row.id),
    )
    const extractedContentMap = getExtractedContentMap(
      db,
      rows.map((row) => row.id),
    )
    const itemAudioMap = getItemAudioMap(
      db,
      rows.map((row) => row.id),
    )

    const items = rows.map((row) =>
      serializeItem(
        row,
        tagsMap.get(row.id) ?? [],
        extractedContentMap.get(row.id) ?? false,
        itemAudioMap.get(row.id) ?? null,
      ),
    )

    return {
      items,
      paging: {
        limit,
        offset,
        returned: items.length,
      },
    }
  })
}

export function getItem(
  context: OperationContext,
  itemId: number,
): SaveItemResult["item"] | undefined {
  return withReadyDb(context.dbPath, context.migrationsDir, (db) => {
    const row = getItemRowById(db, itemId)
    if (!row) {
      return undefined
    }
    return serializeItem(
      row,
      getItemTags(db, row.id),
      getExtractedContentForItem(db, row.id),
      getItemAudioForItem(db, row.id),
    )
  })
}
