import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    url: text("url").notNull(),
    title: text("title"),
    thumbnailUrl: text("thumbnail_url"),
    domain: text("domain"),
    status: text("status").notNull().default("unread"),
    isStarred: integer("is_starred", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("items_url_unique").on(table.url),
    check("items_status_check", sql`${table.status} in ('unread','read','archived')`),
    index("idx_items_status_created").on(table.status, table.createdAt, table.id),
    index("idx_items_created").on(table.createdAt, table.id),
  ],
)

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Normalize to lowercase in the app for deterministic uniqueness.
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("tags_name_unique").on(table.name)],
)

export const itemTags = sqliteTable(
  "item_tags",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.tagId] }),
    index("idx_item_tags_tag_item").on(table.tagId, table.itemId),
  ],
)

export const notes = sqliteTable("notes", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  content: text("content").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})

export const itemAudio = sqliteTable(
  "item_audio",
  {
    itemId: integer("item_id")
      .primaryKey()
      .references(() => items.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    provider: text("provider").notNull(),
    voice: text("voice").notNull(),
    format: text("format").notNull(),
    bytes: integer("bytes").notNull(),
    generatedAt: integer("generated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [check("item_audio_format_check", sql`${table.format} in ('mp3','wav')`)],
)

export const ttsJobs = sqliteTable(
  "tts_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    voice: text("voice").notNull(),
    format: text("format").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    outputFileName: text("output_file_name"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    check(
      "tts_jobs_status_check",
      sql`${table.status} in ('queued','running','succeeded','failed')`,
    ),
    check("tts_jobs_format_check", sql`${table.format} in ('mp3','wav')`),
    index("idx_tts_jobs_status_created").on(table.status, table.createdAt, table.id),
    index("idx_tts_jobs_item_created").on(table.itemId, table.createdAt, table.id),
    uniqueIndex("idx_tts_jobs_item_active")
      .on(table.itemId)
      .where(sql`${table.status} in ('queued','running')`),
  ],
)
