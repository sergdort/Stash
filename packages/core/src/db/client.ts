import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"

import * as schema from "./schema.js"

export type SqliteDatabase = Database.Database
export type StashDb = BetterSQLite3Database<typeof schema>
export type OpenDbResult = {
  db: StashDb
  sqlite: SqliteDatabase
}

export function openSqlite(dbPath: string): SqliteDatabase {
  const sqlite = new Database(dbPath)
  sqlite.pragma("foreign_keys = ON")
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("busy_timeout = 5000")
  return sqlite
}

export function openDb(dbPath: string): OpenDbResult {
  const sqlite = openSqlite(dbPath)
  const db = drizzle(sqlite, { schema }) as StashDb
  return { db, sqlite }
}
