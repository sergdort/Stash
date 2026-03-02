import { eq } from "drizzle-orm"

import * as schema from "../../db/schema.js"
import { StashError } from "../../errors.js"
import { extractContent } from "../../lib/extract.js"
import { isContentExtractionError } from "../../lib/extract-x-browser.js"
import type { ExtractItemOptions, ExtractItemResult, OperationContext } from "../../types.js"
import { resolveAutoTagsRequested } from "../auto-tags/config.js"
import { applyAutoTags } from "../auto-tags/service.js"
import { getItemRowById, withReadyDbAsync } from "../common/db.js"

export async function extractItem(
  context: OperationContext,
  itemId: number,
  options: ExtractItemOptions = {},
): Promise<ExtractItemResult> {
  return withReadyDbAsync(context.dbPath, context.migrationsDir, async (db) => {
    const item = getItemRowById(db, itemId)
    if (!item) {
      throw new StashError(`Item ${itemId} not found.`, "NOT_FOUND", 3, 404)
    }

    const existing = db.select().from(schema.notes).where(eq(schema.notes.itemId, itemId)).get()
    if (existing && !options.force) {
      throw new StashError(
        `Item ${itemId} already has extracted content. Use --force to re-extract.`,
        "CONTENT_EXISTS",
        4,
        409,
      )
    }

    let extracted = null
    try {
      extracted = await extractContent(item.url)
    } catch (error) {
      if (isContentExtractionError(error)) {
        throw new StashError(error.message, "EXTRACTION_FAILED", 1, 500)
      }
      throw error
    }

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

    const runAutoTags = resolveAutoTagsRequested(options.autoTags)
    const autoTagResult = runAutoTags
      ? await applyAutoTags(db, {
          itemId,
          url: item.url,
          title: extracted.title ?? item.title ?? null,
          domain: item.domain,
          content: extracted.textContent,
        })
      : null

    const result: ExtractItemResult = {
      item_id: itemId,
      title_extracted: extracted.title || null,
      title_updated: titleUpdated,
      content_length: extracted.textContent.length,
      updated_at: timestamp.toISOString(),
    }
    if (autoTagResult) {
      result.auto_tags = autoTagResult.applied
      result.auto_tag_scores = autoTagResult.scores
      if (autoTagResult.warning) {
        result.auto_tag_warning = autoTagResult.warning
      }
    }

    return result
  })
}
