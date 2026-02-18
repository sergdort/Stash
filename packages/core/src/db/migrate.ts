import fs from "node:fs"
import path from "node:path"

import { migrate as drizzleMigrate } from "drizzle-orm/better-sqlite3/migrator"

import { openDb, openSqlite, type SqliteDatabase } from "./client.js"

type MigrationStatus = {
  applied: string[]
  pending: string[]
}

type JournalEntry = {
  idx: number
  version: string
  when: number
  tag: string
  breakpoints: boolean
}

type Journal = {
  version: string
  dialect: string
  entries: JournalEntry[]
}

const MIGRATIONS_TABLE = "__stash_migrations"
const LEGACY_MIGRATIONS_TABLE = "__stash_migrations_legacy"
const JOURNAL_FILE = path.join("meta", "_journal.json")

function readJournalEntries(migrationsDir: string): JournalEntry[] {
  const journalPath = path.join(migrationsDir, JOURNAL_FILE)
  const journalContent = fs.readFileSync(journalPath, "utf8")
  const journal = JSON.parse(journalContent) as Journal
  return [...journal.entries].sort((a, b) => a.when - b.when || a.idx - b.idx)
}

function getMigrationTableColumns(sqlite: SqliteDatabase): string[] {
  const rows = sqlite.prepare(`PRAGMA table_info(${MIGRATIONS_TABLE})`).all() as Array<{
    name: string
  }>
  return rows.map((row) => row.name)
}

function migrateLegacyMigrationsTable(sqlite: SqliteDatabase, migrationsDir: string): void {
  const entriesByFile = new Map<string, number>(
    readJournalEntries(migrationsDir).map((entry) => [`${entry.tag}.sql`, entry.when]),
  )
  const legacyRows = sqlite
    .prepare(`SELECT name, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY applied_at ASC, name ASC`)
    .all() as Array<{ name: string; applied_at: number }>

  const migrateTable = sqlite.transaction(() => {
    sqlite.exec(`DROP TABLE IF EXISTS ${LEGACY_MIGRATIONS_TABLE}`)
    sqlite.exec(`ALTER TABLE ${MIGRATIONS_TABLE} RENAME TO ${LEGACY_MIGRATIONS_TABLE}`)
    sqlite.exec(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      )`,
    )

    const insert = sqlite.prepare(
      `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`,
    )

    for (const row of legacyRows) {
      insert.run(row.name, entriesByFile.get(row.name) ?? row.applied_at)
    }

    sqlite.exec(`DROP TABLE ${LEGACY_MIGRATIONS_TABLE}`)
  })

  migrateTable()
}

function ensureMigrationTableCompatibility(sqlite: SqliteDatabase, migrationsDir: string): void {
  const columns = getMigrationTableColumns(sqlite)
  if (columns.length === 0 || columns.includes("hash")) {
    return
  }

  if (columns.includes("name") && columns.includes("applied_at")) {
    migrateLegacyMigrationsTable(sqlite, migrationsDir)
    return
  }

  throw new Error(`Unsupported migrations table schema for '${MIGRATIONS_TABLE}'.`)
}

function getLastAppliedMillis(sqlite: SqliteDatabase): number | null {
  const tableExists = sqlite
    .prepare("SELECT 1 AS one FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(MIGRATIONS_TABLE) as { one: number } | undefined

  if (!tableExists) {
    return null
  }

  const row = sqlite
    .prepare(`SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`)
    .get() as { created_at: number | null } | undefined

  return row?.created_at ?? null
}

function getMigrationStatusFromJournal(
  entries: JournalEntry[],
  lastAppliedMillis: number | null,
): MigrationStatus {
  const appliedEntries =
    lastAppliedMillis === null ? [] : entries.filter((entry) => entry.when <= lastAppliedMillis)
  const pendingEntries = entries.slice(appliedEntries.length)

  return {
    applied: appliedEntries.map((entry) => `${entry.tag}.sql`),
    pending: pendingEntries.map((entry) => `${entry.tag}.sql`),
  }
}

export function getMigrationStatus(dbPath: string, migrationsDir: string): MigrationStatus {
  const entries = readJournalEntries(migrationsDir)
  const sqlite = openSqlite(dbPath)
  try {
    ensureMigrationTableCompatibility(sqlite, migrationsDir)
    const lastAppliedMillis = getLastAppliedMillis(sqlite)
    return getMigrationStatusFromJournal(entries, lastAppliedMillis)
  } finally {
    sqlite.close()
  }
}

export function runMigrations(
  dbPath: string,
  migrationsDir: string,
): { appliedCount: number; applied: string[] } {
  const status = getMigrationStatus(dbPath, migrationsDir)
  const { db, sqlite } = openDb(dbPath)
  try {
    drizzleMigrate(db, {
      migrationsFolder: migrationsDir,
      migrationsTable: MIGRATIONS_TABLE,
    })

    return { appliedCount: status.pending.length, applied: status.pending }
  } finally {
    sqlite.close()
  }
}
