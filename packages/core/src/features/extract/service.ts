import { eq } from "drizzle-orm"

import * as schema from "../../db/schema.js"
import { StashError } from "../../errors.js"
import { extractContent } from "../../lib/extract.js"
import type { ExtractItemResult, OperationContext } from "../../types.js"
import { getItemRowById, withReadyDbAsync } from "../common/db.js"

export async function extractItem(
  context: OperationContext,
  itemId: number,
  force = false,
): Promise<ExtractItemResult> {
  return withReadyDbAsync(context.dbPath, context.migrationsDir, async (db) => {
    const item = getItemRowById(db, itemId)
    if (!item) {
      throw new StashError(`Item ${itemId} not found.`, "NOT_FOUND", 3, 404)
    }

    const existing = db.select().from(schema.notes).where(eq(schema.notes.itemId, itemId)).get()
    if (existing && !force) {
      throw new StashError(
        `Item ${itemId} already has extracted content. Use --force to re-extract.`,
        "CONTENT_EXISTS",
        4,
        409,
      )
    }

    const extracted = await extractContent(item.url)
    if (!extracted?.textContent) {
      throw new StashError("Failed to extract content", "EXTRACTION_FAILED", 1, 500)
    }

    const timestamp = new Date()

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

    const titleUpdated = Boolean(extracted.title && !item.title)
    if (titleUpdated && extracted.title) {
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

    return {
      item_id: itemId,
      title_extracted: extracted.title || null,
      title_updated: titleUpdated,
      content_length: extracted.textContent.length,
      updated_at: timestamp.toISOString(),
    }
  })
}
