import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    url: text("url").notNull(),
    title: text("title"),
    domain: text("domain"),
    status: text("status").notNull().default("unread"),
    isStarred: integer("is_starred", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" })
  },
  (table) => ({
    urlUnique: uniqueIndex("items_url_unique").on(table.url),
    statusCheck: check(
      "items_status_check",
      sql`${table.status} in ('unread','read','archived')`
    ),
    statusCreatedIdx: index("idx_items_status_created").on(table.status, table.createdAt, table.id),
    createdIdx: index("idx_items_created").on(table.createdAt, table.id)
  })
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Normalize to lowercase in the app for deterministic uniqueness.
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => ({
    nameUnique: uniqueIndex("tags_name_unique").on(table.name)
  })
);

export const itemTags = sqliteTable(
  "item_tags",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.itemId, table.tagId] }),
    tagItemIdx: index("idx_item_tags_tag_item").on(table.tagId, table.itemId)
  })
);

export const notes = sqliteTable("notes", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  content: text("content").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});
