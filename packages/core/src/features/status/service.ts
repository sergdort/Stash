import { eq } from "drizzle-orm"

import * as schema from "../../db/schema.js"
import { StashError } from "../../errors.js"
import type { OperationContext } from "../../types.js"
import { nowMs, withReadyDb } from "../common/db.js"

function markItemStatus(
  context: OperationContext,
  itemId: number,
  status: "read" | "unread",
): { item_id: number; action: "mark_read" | "mark_unread"; status: "read" | "unread" } {
  return withReadyDb(context.dbPath, context.migrationsDir, (db) => {
    const timestamp = new Date(nowMs())

    const result =
      status === "read"
        ? db
            .update(schema.items)
            .set({
              status: "read",
              readAt: timestamp,
              archivedAt: null,
              updatedAt: timestamp,
            })
            .where(eq(schema.items.id, itemId))
            .run()
        : db
            .update(schema.items)
            .set({
              status: "unread",
              readAt: null,
              archivedAt: null,
              updatedAt: timestamp,
            })
            .where(eq(schema.items.id, itemId))
            .run()

    if (Number(result.changes) === 0) {
      throw new StashError(`Item ${itemId} not found.`, "NOT_FOUND", 3, 404)
    }

    return {
      item_id: itemId,
      action: status === "read" ? "mark_read" : "mark_unread",
      status,
    }
  })
}

export function markRead(
  context: OperationContext,
  itemId: number,
): {
  item_id: number
  action: "mark_read"
  status: "read"
} {
  return markItemStatus(context, itemId, "read") as {
    item_id: number
    action: "mark_read"
    status: "read"
  }
}

export function markUnread(
  context: OperationContext,
  itemId: number,
): {
  item_id: number
  action: "mark_unread"
  status: "unread"
} {
  return markItemStatus(context, itemId, "unread") as {
    item_id: number
    action: "mark_unread"
    status: "unread"
  }
}
