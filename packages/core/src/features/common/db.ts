import fs from "node:fs"
import path from "node:path"

import { and, asc, eq, inArray, type SQL } from "drizzle-orm"

import { openDb, type StashDb } from "../../db/client.js"
import { runMigrations } from "../../db/migrate.js"
import * as schema from "../../db/schema.js"
import { StashError } from "../../errors.js"
import type { ItemStatus, ItemTtsAudio, StashItem } from "../../types.js"

export type Db = StashDb
export type DbExecutor = Pick<Db, "insert" | "select">
export type ItemRow = typeof schema.items.$inferSelect & { status: ItemStatus }
export type ItemAudioRow = typeof schema.itemAudio.$inferSelect

export function nowMs(): number {
  return Date.now()
}

export function ensureDbDirectory(dbPath: string): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
}

export function ensureDbReady(dbPath: string, migrationsDir: string): void {
  ensureDbDirectory(dbPath)
  runMigrations(dbPath, migrationsDir)
}

export function withDb<T>(dbPath: string, action: (db: Db) => T): T {
  ensureDbDirectory(dbPath)
  const { db, sqlite } = openDb(dbPath)
  try {
    return action(db)
  } finally {
    sqlite.close()
  }
}

export async function withDbAsync<T>(dbPath: string, action: (db: Db) => Promise<T>): Promise<T> {
  ensureDbDirectory(dbPath)
  const { db, sqlite } = openDb(dbPath)
  try {
    return await action(db)
  } finally {
    sqlite.close()
  }
}

export function withReadyDb<T>(dbPath: string, migrationsDir: string, action: (db: Db) => T): T {
  ensureDbReady(dbPath, migrationsDir)
  return withDb(dbPath, action)
}

export async function withReadyDbAsync<T>(
  dbPath: string,
  migrationsDir: string,
  action: (db: Db) => Promise<T>,
): Promise<T> {
  ensureDbReady(dbPath, migrationsDir)
  return withDbAsync(dbPath, action)
}

export function toIso(value: Date | number | null): string | null {
  if (value === null) {
    return null
  }
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

export function normalizeTag(tag: string): string {
  const normalized = tag.trim().toLowerCase()
  if (normalized.length === 0) {
    throw new StashError("Tag cannot be empty.", "VALIDATION_ERROR", 2, 400)
  }
  return normalized
}

export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map(normalizeTag))]
}

export function parseItemId(value: string | number): number {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new StashError("Item id must be a positive integer.", "VALIDATION_ERROR", 2, 400)
  }
  return parsed
}

export function getItemRowById(db: Db, id: number): ItemRow | undefined {
  return db.select().from(schema.items).where(eq(schema.items.id, id)).get() as ItemRow | undefined
}

export function getItemTags(db: Db, itemId: number): string[] {
  const rows = db
    .select({ name: schema.tags.name })
    .from(schema.itemTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.itemTags.tagId))
    .where(eq(schema.itemTags.itemId, itemId))
    .orderBy(asc(schema.tags.name))
    .all()
  return rows.map((row) => row.name)
}

export function getTagsMap(db: Db, itemIds: number[]): Map<number, string[]> {
  const map = new Map<number, string[]>()
  if (itemIds.length === 0) {
    return map
  }

  const rows = db
    .select({ itemId: schema.itemTags.itemId, name: schema.tags.name })
    .from(schema.itemTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.itemTags.tagId))
    .where(inArray(schema.itemTags.itemId, itemIds))
    .orderBy(asc(schema.tags.name))
    .all()

  for (const row of rows) {
    const values = map.get(row.itemId) ?? []
    values.push(row.name)
    map.set(row.itemId, values)
  }

  return map
}

export function getExtractedContentMap(db: Db, itemIds: number[]): Map<number, boolean> {
  const map = new Map<number, boolean>()
  if (itemIds.length === 0) {
    return map
  }

  const rows = db
    .select({ itemId: schema.notes.itemId, content: schema.notes.content })
    .from(schema.notes)
    .where(inArray(schema.notes.itemId, itemIds))
    .all()

  for (const row of rows) {
    map.set(row.itemId, row.content.trim().length > 0)
  }

  return map
}

export function getExtractedContentForItem(db: Db, itemId: number): boolean {
  const row = db
    .select({ content: schema.notes.content })
    .from(schema.notes)
    .where(eq(schema.notes.itemId, itemId))
    .get()

  return row ? row.content.trim().length > 0 : false
}

function serializeItemAudio(row: ItemAudioRow): ItemTtsAudio {
  return {
    file_name: row.fileName,
    format: row.format as "mp3" | "wav",
    provider: row.provider,
    voice: row.voice,
    bytes: row.bytes,
    generated_at: toIso(row.generatedAt) as string,
  }
}

export function getItemAudioMap(db: Db, itemIds: number[]): Map<number, ItemTtsAudio> {
  const map = new Map<number, ItemTtsAudio>()
  if (itemIds.length === 0) {
    return map
  }

  const rows = db
    .select()
    .from(schema.itemAudio)
    .where(inArray(schema.itemAudio.itemId, itemIds))
    .all()

  for (const row of rows) {
    map.set(row.itemId, serializeItemAudio(row))
  }

  return map
}

export function getItemAudioForItem(db: Db, itemId: number): ItemTtsAudio | null {
  const row = db.select().from(schema.itemAudio).where(eq(schema.itemAudio.itemId, itemId)).get()
  return row ? serializeItemAudio(row) : null
}

export function serializeItem(
  row: ItemRow,
  tags: string[],
  hasExtractedContent: boolean,
  ttsAudio: ItemTtsAudio | null,
): StashItem {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    thumbnail_url: row.thumbnailUrl,
    domain: row.domain,
    status: row.status,
    is_starred: row.isStarred,
    has_extracted_content: hasExtractedContent,
    tts_audio: ttsAudio,
    tags,
    created_at: toIso(row.createdAt) as string,
    updated_at: toIso(row.updatedAt) as string,
    read_at: toIso(row.readAt),
    archived_at: toIso(row.archivedAt),
  }
}

export function ensureTagId(db: DbExecutor, tag: string, createdAt: Date): number {
  db.insert(schema.tags)
    .values({
      name: tag,
      createdAt,
    })
    .onConflictDoNothing({ target: schema.tags.name })
    .run()

  const row = db
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(eq(schema.tags.name, tag))
    .get()

  if (!row) {
    throw new StashError(`Could not resolve tag '${tag}'.`, "INTERNAL_ERROR", 1, 500)
  }

  return row.id
}

export function ensureItemExists(db: Db, itemId: number): void {
  const row = db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(eq(schema.items.id, itemId))
    .get()

  if (!row) {
    throw new StashError(`Item ${itemId} not found.`, "NOT_FOUND", 3, 404)
  }
}

export function whereAnd(conditions: SQL[]): SQL | undefined {
  return conditions.length > 0 ? and(...conditions) : undefined
}
