#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { Command, InvalidArgumentError } from "commander"
import { and, asc, desc, eq, exists, inArray, type SQL, sql } from "drizzle-orm"

import { openDb, type StashDb } from "../../../packages/core/src/db/client.js"
import { getMigrationStatus, runMigrations } from "../../../packages/core/src/db/migrate.js"
import * as schema from "../../../packages/core/src/db/schema.js"
import { StashError } from "../../../packages/core/src/errors.js"
import { inspectCoquiTtsHealth } from "../../../packages/core/src/features/tts/doctor.js"
import {
  enqueueTtsJob,
  getTtsJob,
  runTtsWorkerOnce,
  startTtsWorker,
  waitForTtsJob,
} from "../../../packages/core/src/features/tts/jobs.js"
import { extractContent } from "../../../packages/core/src/lib/extract.js"
import { isContentExtractionError } from "../../../packages/core/src/lib/extract-x-browser.js"
import {
  DEFAULT_AUDIO_DIR,
  DEFAULT_DB_PATH,
  resolveAudioDir,
  resolveDbPath,
} from "../../../packages/core/src/lib/paths.js"
import { startWebStack } from "../../../packages/web-server/src/index.js"

const CLI_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_MIGRATIONS_DIR = resolveExistingPath([
  path.resolve(CLI_DIR, "../../../drizzle"),
  path.resolve(CLI_DIR, "../../../../drizzle"),
  path.resolve(process.cwd(), "drizzle"),
])
const DEFAULT_WEB_DIST_DIR = resolveExistingPath([
  path.resolve(CLI_DIR, "../../../apps/web/dist"),
  path.resolve(CLI_DIR, "../../../../apps/web/dist"),
  path.resolve(process.cwd(), "apps/web/dist"),
])
const DEFAULT_WEB_HOST = process.env.STASH_WEB_HOST ?? "127.0.0.1"
const DEFAULT_API_PORT = process.env.STASH_API_PORT
  ? parsePort(process.env.STASH_API_PORT)
  : 4173
const DEFAULT_PWA_PORT = process.env.STASH_PWA_PORT
  ? parsePort(process.env.STASH_PWA_PORT)
  : 5173
const DEFAULT_TTS_VOICE = "tts_models/en/vctk/vits|p241" // Coqui male voice

type ItemStatus = "unread" | "read" | "archived"
type TagMode = "any" | "all"

type ItemRow = typeof schema.items.$inferSelect & { status: ItemStatus }
type Db = StashDb
type DbExecutor = Pick<Db, "insert" | "select">

type StashItem = {
  id: number
  url: string
  title: string | null
  domain: string | null
  status: ItemStatus
  is_starred: boolean
  tags: string[]
  created_at: string
  updated_at: string
  read_at: string | null
  archived_at: string | null
}

class CliError extends Error {
  code: string
  exitCode: number

  constructor(message: string, code: string, exitCode: number) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("Expected a positive integer.")
  }
  return parsed
}

function parseNonNegativeInt(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError("Expected a non-negative integer.")
  }
  return parsed
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value]
}

function resolveExistingPath(candidates: string[]): string {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return candidates[0] as string
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function printError(message: string, jsonMode: boolean, code: string, exitCode: number): never {
  if (jsonMode) {
    printJson({
      ok: false,
      error: {
        code,
        message,
      },
    })
  } else {
    process.stderr.write(`${message}\n`)
  }
  process.exit(exitCode)
}

function ensureDbDirectory(dbPath: string): void {
  const dir = path.dirname(dbPath)
  fs.mkdirSync(dir, { recursive: true })
}

function nowMs(): number {
  return Date.now()
}

function toIso(value: Date | number | null): string | null {
  if (value === null) {
    return null
  }
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

function normalizeTag(tag: string): string {
  const normalized = tag.trim().toLowerCase()
  if (normalized.length === 0) {
    throw new CliError("Tag cannot be empty.", "VALIDATION_ERROR", 2)
  }
  return normalized
}

function normalizeTags(tags: string[]): string[] {
  const values = tags.map(normalizeTag)
  return [...new Set(values)]
}

function parseItemId(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CliError("Item id must be a positive integer.", "VALIDATION_ERROR", 2)
  }
  return parsed
}

function parsePort(value: string): number {
  const port = parsePositiveInt(value)
  if (port > 65535) {
    throw new InvalidArgumentError("Expected a valid port in range 1..65535.")
  }
  return port
}

function parseUrl(value: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new CliError(`Invalid URL: ${value}`, "VALIDATION_ERROR", 2)
  }
}

function serializeItem(row: ItemRow, tags: string[]): StashItem {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    domain: row.domain,
    status: row.status,
    is_starred: row.isStarred,
    tags,
    created_at: toIso(row.createdAt) as string,
    updated_at: toIso(row.updatedAt) as string,
    read_at: toIso(row.readAt),
    archived_at: toIso(row.archivedAt),
  }
}

function handleActionError(error: unknown, jsonMode: boolean): never {
  if (error instanceof StashError) {
    printError(error.message, jsonMode, error.code, error.exitCode)
  }

  if (error instanceof CliError) {
    printError(error.message, jsonMode, error.code, error.exitCode)
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "EADDRINUSE"
  ) {
    const message = error instanceof Error ? error.message : "Address already in use."
    printError(message, jsonMode, "VALIDATION_ERROR", 2)
  }

  const message = error instanceof Error ? error.message : "Unknown error"
  if (
    message.includes("Could not locate the bindings file") ||
    message.includes("better_sqlite3.node")
  ) {
    printError(
      "SQLite native bindings are missing for better-sqlite3. Run `pnpm approve-builds`, then `pnpm rebuild better-sqlite3`.",
      jsonMode,
      "SQLITE_BINDINGS_MISSING",
      2,
    )
  }

  if (message.includes("no such table")) {
    printError(
      "Database schema is not initialized. Run `stash db migrate`.",
      jsonMode,
      "MIGRATION_REQUIRED",
      2,
    )
  }

  printError(message, jsonMode, "INTERNAL_ERROR", 1)
}

function withDb<T>(dbPath: string, action: (db: Db) => T): T {
  ensureDbDirectory(dbPath)
  const { db, sqlite } = openDb(dbPath)
  try {
    return action(db)
  } finally {
    sqlite.close()
  }
}

async function withDbAsync<T>(dbPath: string, action: (db: Db) => Promise<T>): Promise<T> {
  ensureDbDirectory(dbPath)
  const { db, sqlite } = openDb(dbPath)
  try {
    return await action(db)
  } finally {
    sqlite.close()
  }
}

function resolveMigrationsDir(value?: string): string {
  if (!value || value.trim().length === 0) {
    return DEFAULT_MIGRATIONS_DIR
  }
  return path.resolve(value)
}

function ensureMigrationsDirExists(migrationsDir: string): void {
  if (!fs.existsSync(migrationsDir)) {
    throw new CliError(
      `Migrations directory not found: ${migrationsDir}`,
      "MIGRATIONS_DIR_NOT_FOUND",
      2,
    )
  }
}

function ensureDbReady(dbPath: string): void {
  const migrationsDir = resolveMigrationsDir()
  ensureMigrationsDirExists(migrationsDir)
  ensureDbDirectory(dbPath)
  runMigrations(dbPath, migrationsDir)
}

function withReadyDb<T>(dbPath: string, action: (db: Db) => T): T {
  ensureDbReady(dbPath)
  return withDb(dbPath, action)
}

async function withReadyDbAsync<T>(dbPath: string, action: (db: Db) => Promise<T>): Promise<T> {
  ensureDbReady(dbPath)
  return withDbAsync(dbPath, action)
}

function getItemRowById(db: Db, id: number): ItemRow | undefined {
  return db.select().from(schema.items).where(eq(schema.items.id, id)).get() as ItemRow | undefined
}

function getItemTags(db: Db, itemId: number): string[] {
  const rows = db
    .select({ name: schema.tags.name })
    .from(schema.itemTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.itemTags.tagId))
    .where(eq(schema.itemTags.itemId, itemId))
    .orderBy(asc(schema.tags.name))
    .all()
  return rows.map((row) => row.name)
}

function getTagsMap(db: Db, itemIds: number[]): Map<number, string[]> {
  const map = new Map<number, string[]>()
  if (itemIds.length === 0) {
    return map
  }

  const rows = db
    .select({
      itemId: schema.itemTags.itemId,
      name: schema.tags.name,
    })
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

function ensureTagId(db: DbExecutor, tag: string, createdAt: Date): number {
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
    throw new CliError(`Could not resolve tag '${tag}'.`, "INTERNAL_ERROR", 1)
  }
  return row.id
}

function ensureItemExists(db: Db, itemId: number): void {
  const row = db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(eq(schema.items.id, itemId))
    .get()
  if (!row) {
    throw new CliError(`Item ${itemId} not found.`, "NOT_FOUND", 3)
  }
}

function runDbAction<T>(jsonMode: boolean, action: () => T | Promise<T>): T | Promise<T> {
  try {
    const result = action()
    if (result instanceof Promise) {
      return result.catch((error: unknown) => handleActionError(error, jsonMode))
    }
    return result
  } catch (error) {
    handleActionError(error, jsonMode)
  }
}

const program = new Command()

program
  .name("stash")
  .description("Local-first read-later CLI")
  .version("0.1.0")
  .option(
    "--db-path <path>",
    "Path to SQLite database file",
    process.env.STASH_DB_PATH ?? DEFAULT_DB_PATH,
  )

program.addHelpText(
  "afterAll",
  `
Quick Reference:
  stash save <url> [--title <text>] [--tag <name> ...] [--json]
  stash list [--status unread|read|archived] [--tag <name> ...] [--tag-mode any|all] [--limit <n>] [--offset <n>] [--json]
  stash tags list [--limit <n>] [--offset <n>] [--json]
  stash tag add <id> <tag> [--json]
  stash tag rm <id> <tag> [--json]
  stash mark read <id> [--json]
  stash mark unread <id> [--json]
  stash read <id> [--json]
  stash unread <id> [--json]
  stash extract <id> [--force] [--json]
  stash tts <id> [--voice <name>] [--format mp3|wav] [--wait] [--json]
  stash tts status <jobId> [--json]
  stash tts doctor [--json]
  stash jobs worker [--poll-ms <n>] [--once] [--json]
  stash web [--host <host>] [--api-port <n>] [--pwa-port <n>]
  stash db migrate [--json] [--migrations-dir <path>]
  stash db doctor [--json] [--migrations-dir <path>] [--limit <n>]

Use \`stash <command> --help\` for detailed options and examples.
`,
)

const dbCommand = program.command("db").description("Database utilities")

dbCommand.addHelpText(
  "after",
  `
Examples:
  stash db migrate --json
  stash db doctor --json
  stash db doctor --limit 20
`,
)

dbCommand
  .command("migrate")
  .description("Run pending SQL migrations")
  .option("--json", "Print machine-readable JSON output")
  .option("--migrations-dir <path>", "Path to migrations directory", DEFAULT_MIGRATIONS_DIR)
  .action((options: { json?: boolean; migrationsDir: string }) => {
    const jsonMode = Boolean(options.json)
    runDbAction(jsonMode, () => {
      const dbPath = resolveDbPath(program.opts().dbPath as string)
      const migrationsDir = resolveMigrationsDir(options.migrationsDir)

      ensureMigrationsDirExists(migrationsDir)

      ensureDbDirectory(dbPath)
      const result = runMigrations(dbPath, migrationsDir)

      if (jsonMode) {
        printJson({
          ok: true,
          db_path: dbPath,
          migrations_dir: migrationsDir,
          applied_count: result.appliedCount,
          applied: result.applied,
        })
        return
      }

      process.stdout.write(`Applied ${result.appliedCount} migration(s).\n`)
      if (result.applied.length > 0) {
        process.stdout.write(`${result.applied.join("\n")}\n`)
      }
    })
  })

dbCommand
  .command("doctor")
  .description("Inspect database and migration status")
  .option("--json", "Print machine-readable JSON output")
  .option("--migrations-dir <path>", "Path to migrations directory", DEFAULT_MIGRATIONS_DIR)
  .option("--limit <n>", "Limit rows returned for preview output", parsePositiveInt, 5)
  .action((options: { json?: boolean; migrationsDir: string; limit: number }) => {
    const jsonMode = Boolean(options.json)
    runDbAction(jsonMode, () => {
      const dbPath = resolveDbPath(program.opts().dbPath as string)
      const migrationsDir = resolveMigrationsDir(options.migrationsDir)

      ensureMigrationsDirExists(migrationsDir)

      const dbExists = fs.existsSync(dbPath)
      const status = dbExists
        ? getMigrationStatus(dbPath, migrationsDir)
        : {
            applied: [],
            pending: fs
              .readdirSync(migrationsDir)
              .filter((name) => name.endsWith(".sql"))
              .sort((a, b) => a.localeCompare(b)),
          }

      if (jsonMode) {
        printJson({
          ok: true,
          db_path: dbPath,
          db_exists: dbExists,
          migrations_dir: migrationsDir,
          applied_count: status.applied.length,
          pending_count: status.pending.length,
          applied: status.applied.slice(-options.limit),
          pending: status.pending.slice(0, options.limit),
        })
        return
      }

      process.stdout.write(`db_path: ${dbPath}\n`)
      process.stdout.write(`db_exists: ${dbExists}\n`)
      process.stdout.write(`applied: ${status.applied.length}\n`)
      process.stdout.write(`pending: ${status.pending.length}\n`)
      if (status.pending.length > 0) {
        process.stdout.write(
          `pending_preview:\n${status.pending.slice(0, options.limit).join("\n")}\n`,
        )
      }
    })
  })

program
  .command("save <url>")
  .description("Save a URL to stash")
  .option("--title <text>", "Optional title")
  .option("--tag <name>", "Tag to attach (repeatable)", collectValues, [])
  .option("--no-extract", "Skip content extraction")
  .option("--json", "Print machine-readable JSON output")
  .action(
    async (
      url: string,
      options: { title?: string; tag: string[]; extract?: boolean; json?: boolean },
    ) => {
      const jsonMode = Boolean(options.json)

      return runDbAction(jsonMode, async () =>
        withReadyDbAsync(resolveDbPath(program.opts().dbPath as string), async (db) => {
          const parsedUrl = parseUrl(url)
          const normalizedTags = normalizeTags(options.tag ?? [])
          const existing = db
            .select()
            .from(schema.items)
            .where(eq(schema.items.url, parsedUrl.toString()))
            .get() as ItemRow | undefined
          const timestamp = new Date(nowMs())
          let created = false
          let itemId: number | undefined

          db.transaction((tx) => {
            if (existing) {
              itemId = existing.id
              if (!existing.title && options.title) {
                tx.update(schema.items)
                  .set({
                    title: options.title.trim(),
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
                  title: options.title?.trim() || null,
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
              throw new CliError("Saved item id could not be determined.", "INTERNAL_ERROR", 1)
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
            throw new CliError("Saved item id could not be determined.", "INTERNAL_ERROR", 1)
          }

          const row = getItemRowById(db, itemId)
          if (!row) {
            throw new CliError("Saved item could not be reloaded.", "INTERNAL_ERROR", 1)
          }

          // Extract content if not disabled
          if (options.extract !== false && created) {
            try {
              const extracted = await extractContent(parsedUrl.toString())
              if (extracted?.textContent) {
                // Save to notes table
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

                // Update title if we got a better one
                if (extracted.title && !options.title) {
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
            } catch (error) {
              console.error("Failed to extract content:", error)
              // Continue without extraction on error
            }
          }

          const item = serializeItem(row, getItemTags(db, row.id))

          if (jsonMode) {
            printJson({
              ok: true,
              created,
              item,
            })
            return
          }

          process.stdout.write(`${created ? "saved" : "exists"} #${item.id} ${item.url}\n`)
        }),
      )
    },
  )

program
  .command("tts <id> [jobId]")
  .description(
    "Queue TTS generation, check TTS job status (`stash tts status <jobId>`), or run `stash tts doctor`.",
  )
  .option("--voice <name>", "Voice name for synthesis", DEFAULT_TTS_VOICE)
  .option("--format <format>", "Audio format: mp3|wav", "mp3")
  .option("--wait", "Wait for completion after enqueueing")
  .option("--poll-ms <n>", "Polling interval for wait/status output", parsePositiveInt, 1500)
  .option("--json", "Print machine-readable JSON output")
  .action(
    async (
      id: string,
      jobId: string | undefined,
      options: {
        voice: string
        format: string
        wait?: boolean
        pollMs: number
        json?: boolean
      },
    ) => {
      const jsonMode = Boolean(options.json)
      const dbPath = resolveDbPath(program.opts().dbPath as string)
      const context = {
        dbPath,
        migrationsDir: resolveMigrationsDir(),
      }

      return runDbAction(jsonMode, async () => {
        if (id === "doctor") {
          if (jobId !== undefined) {
            throw new CliError(
              "Unexpected extra argument for `stash tts doctor`.",
              "VALIDATION_ERROR",
              2,
            )
          }

          const report = inspectCoquiTtsHealth()
          if (jsonMode) {
            printJson({
              ok: true,
              ...report,
            })
          } else {
            process.stdout.write(`tts doctor: ${report.healthy ? "healthy" : "unhealthy"}\n`)
            for (const check of report.checks) {
              const requirement = check.required ? "required" : "optional"
              const status = check.ok ? "ok" : "failed"
              const resolvedPath = check.path ?? "-"
              process.stdout.write(`${check.id} (${requirement}): ${status} [${resolvedPath}]\n`)
              if (check.message) {
                process.stdout.write(`  ${check.message}\n`)
              }
            }
            process.stdout.write(
              `coqui flags: --text_file=${report.coqui_cli_features.supports_text_file ? "yes" : "no"} --progress_bar=${report.coqui_cli_features.supports_progress_bar ? "yes" : "no"}\n`,
            )
            process.stdout.write(
              `invocation strategy: ${report.invocation_strategy.replaceAll("_", " ")}\n`,
            )
          }

          if (!report.healthy) {
            process.exitCode = 2
          }
          return
        }

        if (id === "status") {
          if (!jobId) {
            throw new CliError(
              "Job id is required: stash tts status <jobId>",
              "VALIDATION_ERROR",
              2,
            )
          }
          const parsedJobId = parseItemId(jobId)
          const job = getTtsJob(context, parsedJobId)

          if (jsonMode) {
            printJson({
              ok: true,
              job,
            })
            return
          }

          const suffix = job.error_message ? ` (${job.error_message})` : ""
          process.stdout.write(`tts job #${job.id} ${job.status}${suffix}\n`)
          return
        }

        if (jobId !== undefined) {
          throw new CliError(
            "Unexpected extra argument for `stash tts <id>`.",
            "VALIDATION_ERROR",
            2,
          )
        }

        const itemId = parseItemId(id)
        const enqueue = enqueueTtsJob(context, {
          itemId,
          voice: options.voice,
          format: options.format,
        })

        if (!options.wait) {
          if (jsonMode) {
            printJson({
              ok: true,
              created: enqueue.created,
              job_id: enqueue.job.id,
              status: enqueue.job.status,
              poll_interval_ms: enqueue.poll_interval_ms,
            })
            return
          }

          process.stdout.write(
            `${enqueue.created ? "queued" : "existing"} tts job #${enqueue.job.id} for item #${itemId}\n`,
          )
          return
        }

        const audioDir = resolveAudioDir(process.env.STASH_AUDIO_DIR ?? DEFAULT_AUDIO_DIR)
        const worker = startTtsWorker(context, {
          pollMs: options.pollMs,
          audioDir,
        })

        try {
          const completed = await waitForTtsJob(context, enqueue.job.id, {
            pollMs: options.pollMs,
          })

          if (completed.status === "failed") {
            const code = completed.error_code ?? "INTERNAL_ERROR"
            const exitCode = code === "NO_CONTENT" ? 2 : code === "NOT_FOUND" ? 3 : 1
            throw new CliError(completed.error_message ?? "TTS job failed.", code, exitCode)
          }

          const fileName = completed.output_file_name
          if (!fileName) {
            throw new CliError(
              `TTS job ${completed.id} completed without output file.`,
              "INTERNAL_ERROR",
              1,
            )
          }
          const outputPath = path.join(audioDir, fileName)

          if (jsonMode) {
            printJson({
              ok: true,
              job_id: completed.id,
              item_id: completed.item_id,
              status: completed.status,
              output_file_name: fileName,
              output_path: outputPath,
            })
            return
          }

          process.stdout.write(`generated #${completed.item_id} ${outputPath}\n`)
        } finally {
          await worker.stop()
        }
      })
    },
  )

program
  .command("extract <id>")
  .description("Extract or re-extract content for an item")
  .option("--force", "Re-extract even if content already exists")
  .option("--json", "Print machine-readable JSON output")
  .action(async (id: string, options: { force?: boolean; json?: boolean }) => {
    const jsonMode = Boolean(options.json)

    return runDbAction(jsonMode, async () =>
      withReadyDbAsync(resolveDbPath(program.opts().dbPath as string), async (db) => {
        const itemId = parseItemId(id)

        // Get the item
        const item = getItemRowById(db, itemId)
        if (!item) {
          throw new CliError(`Item ${itemId} not found.`, "NOT_FOUND", 3)
        }

        // Check if content already exists
        const existing = db.select().from(schema.notes).where(eq(schema.notes.itemId, itemId)).get()

        if (existing && !options.force) {
          if (jsonMode) {
            printJson({
              ok: false,
              error: {
                code: "CONTENT_EXISTS",
                message: `Item ${itemId} already has extracted content. Use --force to re-extract.`,
              },
            })
            return
          }
          throw new CliError(
            `Item ${itemId} already has extracted content. Use --force to re-extract.`,
            "CONTENT_EXISTS",
            4,
          )
        }

        // Extract content
        let extracted = null
        let extractionError = null
        try {
          extracted = await extractContent(item.url)
        } catch (error) {
          if (isContentExtractionError(error)) {
            const message = error.message
            if (jsonMode) {
              process.stderr.write(`${message}\n`)
            }
            extractionError = message
          } else {
            extractionError = error instanceof Error ? error.message : String(error)
          }
        }

        if (!extracted || !extracted.textContent) {
          if (jsonMode) {
            printJson({
              ok: false,
              error: {
                code: "EXTRACTION_FAILED",
                message: extractionError || "Failed to extract content",
              },
            })
            return
          }
          throw new CliError(
            `Failed to extract content: ${extractionError || "No readable content found"}`,
            "EXTRACTION_FAILED",
            1,
          )
        }

        // Save to notes table
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

        // Update title if we got a better one and item doesn't have one
        if (extracted.title && !item.title) {
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

        if (jsonMode) {
          printJson({
            ok: true,
            item_id: itemId,
            title_extracted: extracted.title || null,
            title_updated: Boolean(extracted.title && !item.title),
            content_length: extracted.textContent.length,
            updated_at: timestamp.toISOString(),
          })
          return
        }

        process.stdout.write(
          `extracted #${itemId} ${item.url} (${extracted.textContent.length} chars)\n`,
        )
      }),
    )
  })

program
  .command("list")
  .description("List stashed items")
  .option("--status <status>", "Filter by status: unread|read|archived")
  .option("--tag <name>", "Filter by tag (repeatable)", collectValues, [])
  .option("--tag-mode <mode>", "Tag filter mode: any|all", "any")
  .option("--limit <n>", "Max rows to return", parsePositiveInt, 20)
  .option("--offset <n>", "Rows to skip", parseNonNegativeInt, 0)
  .option("--json", "Print machine-readable JSON output")
  .action(
    (options: {
      status?: string
      tag: string[]
      tagMode: string
      limit: number
      offset: number
      json?: boolean
    }) => {
      const jsonMode = Boolean(options.json)
      const tagMode = options.tagMode as TagMode
      const status = options.status as ItemStatus | undefined

      if (status && !["unread", "read", "archived"].includes(status)) {
        printError(
          "Invalid status. Use unread, read, or archived.",
          jsonMode,
          "VALIDATION_ERROR",
          2,
        )
      }
      if (!["any", "all"].includes(tagMode)) {
        printError("Invalid tag mode. Use any or all.", jsonMode, "VALIDATION_ERROR", 2)
      }

      runDbAction(jsonMode, () =>
        withReadyDb(resolveDbPath(program.opts().dbPath as string), (db) => {
          const tags = normalizeTags(options.tag ?? [])
          const conditions: SQL[] = []

          if (status) {
            conditions.push(eq(schema.items.status, status))
          }

          if (tags.length > 0) {
            if (tagMode === "any") {
              const subquery = db
                .select({ one: sql<number>`1` })
                .from(schema.itemTags)
                .innerJoin(schema.tags, eq(schema.tags.id, schema.itemTags.tagId))
                .where(
                  and(eq(schema.itemTags.itemId, schema.items.id), inArray(schema.tags.name, tags)),
                )
              conditions.push(exists(subquery))
            } else {
              for (const tag of tags) {
                const subquery = db
                  .select({ one: sql<number>`1` })
                  .from(schema.itemTags)
                  .innerJoin(schema.tags, eq(schema.tags.id, schema.itemTags.tagId))
                  .where(
                    and(eq(schema.itemTags.itemId, schema.items.id), eq(schema.tags.name, tag)),
                  )
                conditions.push(exists(subquery))
              }
            }
          }

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined
          const rows = db
            .select()
            .from(schema.items)
            .where(whereClause)
            .orderBy(desc(schema.items.createdAt), desc(schema.items.id))
            .limit(options.limit)
            .offset(options.offset)
            .all() as ItemRow[]

          const tagsMap = getTagsMap(
            db,
            rows.map((row) => row.id),
          )
          const items = rows.map((row) => serializeItem(row, tagsMap.get(row.id) ?? []))

          if (jsonMode) {
            printJson({
              ok: true,
              items,
              paging: {
                limit: options.limit,
                offset: options.offset,
                returned: items.length,
              },
            })
            return
          }

          if (items.length === 0) {
            process.stdout.write("No items found.\n")
            return
          }

          for (const item of items) {
            const displayTitle = item.title ?? item.url
            const displayTags = item.tags.length > 0 ? ` [${item.tags.join(", ")}]` : ""
            process.stdout.write(`#${item.id} ${item.status} ${displayTitle}${displayTags}\n`)
          }
        }),
      )
    },
  )

const tagsCommand = program.command("tags").description("Tag utilities")

tagsCommand.addHelpText(
  "after",
  `
Examples:
  stash tags list
  stash tags list --limit 100 --offset 0 --json
`,
)

tagsCommand
  .command("list")
  .description("List all available tags")
  .option("--limit <n>", "Max rows to return", parsePositiveInt, 50)
  .option("--offset <n>", "Rows to skip", parseNonNegativeInt, 0)
  .option("--json", "Print machine-readable JSON output")
  .action((options: { limit: number; offset: number; json?: boolean }) => {
    const jsonMode = Boolean(options.json)

    runDbAction(jsonMode, () =>
      withReadyDb(resolveDbPath(program.opts().dbPath as string), (db) => {
        const rows = db
          .select({
            name: schema.tags.name,
            itemCount: sql<number>`count(${schema.itemTags.itemId})`,
          })
          .from(schema.tags)
          .leftJoin(schema.itemTags, eq(schema.itemTags.tagId, schema.tags.id))
          .groupBy(schema.tags.id)
          .orderBy(asc(schema.tags.name))
          .limit(options.limit)
          .offset(options.offset)
          .all()

        const tags = rows.map((row) => ({ name: row.name, item_count: Number(row.itemCount) }))

        if (jsonMode) {
          printJson({
            ok: true,
            tags,
            paging: {
              limit: options.limit,
              offset: options.offset,
              returned: tags.length,
            },
          })
          return
        }

        if (tags.length === 0) {
          process.stdout.write("No tags found.\n")
          return
        }

        for (const tag of tags) {
          process.stdout.write(`${tag.name}\t${tag.item_count}\n`)
        }
      }),
    )
  })

const tagCommand = program.command("tag").description("Manage item tags")

tagCommand.addHelpText(
  "after",
  `
Examples:
  stash tag add 1 ai
  stash tag rm 1 ai --json
`,
)

tagCommand
  .command("add <id> <tag>")
  .description("Attach a tag to an item")
  .option("--json", "Print machine-readable JSON output")
  .action((id: string, tag: string, options: { json?: boolean }) => {
    const jsonMode = Boolean(options.json)

    runDbAction(jsonMode, () =>
      withReadyDb(resolveDbPath(program.opts().dbPath as string), (db) => {
        const itemId = parseItemId(id)
        const normalizedTag = normalizeTag(tag)
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
        const added = Number(result.changes) > 0

        if (jsonMode) {
          printJson({
            ok: true,
            item_id: itemId,
            tag: normalizedTag,
            added,
          })
          return
        }

        process.stdout.write(`${added ? "added" : "exists"} tag '${normalizedTag}' on #${itemId}\n`)
      }),
    )
  })

tagCommand
  .command("rm <id> <tag>")
  .description("Remove a tag from an item")
  .option("--json", "Print machine-readable JSON output")
  .action((id: string, tag: string, options: { json?: boolean }) => {
    const jsonMode = Boolean(options.json)

    runDbAction(jsonMode, () =>
      withReadyDb(resolveDbPath(program.opts().dbPath as string), (db) => {
        const itemId = parseItemId(id)
        const normalizedTag = normalizeTag(tag)
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

        if (jsonMode) {
          printJson({
            ok: true,
            item_id: itemId,
            tag: normalizedTag,
            removed,
          })
          return
        }

        process.stdout.write(
          `${removed ? "removed" : "missing"} tag '${normalizedTag}' on #${itemId}\n`,
        )
      }),
    )
  })

function markItemStatus(
  status: Exclude<ItemStatus, "archived">,
  itemId: number,
): { itemId: number; status: ItemStatus } {
  const dbPath = resolveDbPath(program.opts().dbPath as string)

  return withReadyDb(dbPath, (db) => {
    const timestamp = new Date(nowMs())
    const update =
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

    if (Number(update.changes) === 0) {
      throw new CliError(`Item ${itemId} not found.`, "NOT_FOUND", 3)
    }

    return { itemId, status }
  })
}

const markCommand = program.command("mark").description("Mark item states")

markCommand.addHelpText(
  "after",
  `
Examples:
  stash mark read 1
  stash mark unread 1 --json
`,
)

markCommand
  .command("read <id>")
  .description("Mark item as read")
  .option("--json", "Print machine-readable JSON output")
  .action((id: string, options: { json?: boolean }) => {
    const jsonMode = Boolean(options.json)

    runDbAction(jsonMode, () => {
      const itemId = parseItemId(id)
      const result = markItemStatus("read", itemId)
      if (jsonMode) {
        printJson({
          ok: true,
          item_id: result.itemId,
          action: "mark_read",
          status: result.status,
        })
        return
      }
      process.stdout.write(`marked #${result.itemId} as read\n`)
    })
  })

markCommand
  .command("unread <id>")
  .description("Mark item as unread")
  .option("--json", "Print machine-readable JSON output")
  .action((id: string, options: { json?: boolean }) => {
    const jsonMode = Boolean(options.json)

    runDbAction(jsonMode, () => {
      const itemId = parseItemId(id)
      const result = markItemStatus("unread", itemId)
      if (jsonMode) {
        printJson({
          ok: true,
          item_id: result.itemId,
          action: "mark_unread",
          status: result.status,
        })
        return
      }
      process.stdout.write(`marked #${result.itemId} as unread\n`)
    })
  })

const jobsCommand = program.command("jobs").description("Background job workers")

jobsCommand
  .command("worker")
  .description("Run TTS background worker loop")
  .option("--poll-ms <n>", "Polling interval in milliseconds", parsePositiveInt, 1500)
  .option("--once", "Process at most one queued job and exit")
  .option("--json", "Print machine-readable JSON output")
  .action(async (options: { pollMs: number; once?: boolean; json?: boolean }) => {
    const jsonMode = Boolean(options.json)

    return runDbAction(jsonMode, async () => {
      const context = {
        dbPath: resolveDbPath(program.opts().dbPath as string),
        migrationsDir: resolveMigrationsDir(),
      }
      const audioDir = resolveAudioDir(process.env.STASH_AUDIO_DIR ?? DEFAULT_AUDIO_DIR)

      if (options.once) {
        const processed = await runTtsWorkerOnce(context, { audioDir })
        if (jsonMode) {
          printJson({
            ok: true,
            processed: Boolean(processed),
            job: processed,
          })
          return
        }

        if (!processed) {
          process.stdout.write("No queued TTS jobs.\n")
          return
        }

        process.stdout.write(`Processed tts job #${processed.id} (${processed.status}).\n`)
        return
      }

      const worker = startTtsWorker(context, {
        pollMs: options.pollMs,
        audioDir,
      })

      if (jsonMode) {
        printJson({
          ok: true,
          status: "running",
          poll_ms: options.pollMs,
        })
      } else {
        process.stdout.write(`tts worker running (poll ${options.pollMs}ms)\n`)
      }

      await new Promise<void>((resolve) => {
        const stop = (): void => {
          void worker.stop().finally(() => {
            process.off("SIGINT", stop)
            process.off("SIGTERM", stop)
            resolve()
          })
        }
        process.on("SIGINT", stop)
        process.on("SIGTERM", stop)
      })
    })
  })

program
  .command("web")
  .description("Run local web frontend (PWA) + REST API servers")
  .option("--host <host>", "Host to bind API and PWA servers", DEFAULT_WEB_HOST)
  .option("--api-port <n>", "Port to bind API server", parsePort, DEFAULT_API_PORT)
  .option("--pwa-port <n>", "Port to bind PWA server", parsePort, DEFAULT_PWA_PORT)
  .action(async (options: { host: string; apiPort: number; pwaPort: number }) => {
    return runDbAction(false, async () => {
      if (options.apiPort === options.pwaPort) {
        throw new CliError("API and PWA ports must be different.", "VALIDATION_ERROR", 2)
      }

      const dbPath = resolveDbPath(program.opts().dbPath as string)
      const migrationsDir = resolveMigrationsDir()
      const web = await startWebStack({
        host: options.host,
        apiPort: options.apiPort,
        pwaPort: options.pwaPort,
        dbPath,
        migrationsDir,
        webDistDir: DEFAULT_WEB_DIST_DIR,
        audioDir: resolveAudioDir(process.env.STASH_AUDIO_DIR ?? DEFAULT_AUDIO_DIR),
      })

      process.stdout.write(`stash web running\n`)
      process.stdout.write(`API: http://${web.api.host}:${web.api.port}\n`)
      process.stdout.write(`PWA: http://${web.pwa.host}:${web.pwa.port}\n`)

      await new Promise<void>((resolve) => {
        const stop = (): void => {
          web
            .close()
            .catch(() => {
              // Ignore shutdown errors during signal handling.
            })
            .finally(() => {
              process.off("SIGINT", stop)
              process.off("SIGTERM", stop)
              resolve()
            })
        }

        process.on("SIGINT", stop)
        process.on("SIGTERM", stop)
      })
    })
  })

program
  .command("read <id>")
  .description("Alias for mark read")
  .option("--json", "Print machine-readable JSON output")
  .action((id: string, options: { json?: boolean }) => {
    const jsonMode = Boolean(options.json)
    runDbAction(jsonMode, () => {
      const itemId = parseItemId(id)
      const result = markItemStatus("read", itemId)
      if (jsonMode) {
        printJson({
          ok: true,
          item_id: result.itemId,
          action: "mark_read",
          status: result.status,
        })
        return
      }
      process.stdout.write(`marked #${result.itemId} as read\n`)
    })
  })

program
  .command("unread <id>")
  .description("Alias for mark unread")
  .option("--json", "Print machine-readable JSON output")
  .action((id: string, options: { json?: boolean }) => {
    const jsonMode = Boolean(options.json)
    runDbAction(jsonMode, () => {
      const itemId = parseItemId(id)
      const result = markItemStatus("unread", itemId)
      if (jsonMode) {
        printJson({
          ok: true,
          item_id: result.itemId,
          action: "mark_unread",
          status: result.status,
        })
        return
      }
      process.stdout.write(`marked #${result.itemId} as unread\n`)
    })
  })

program.configureOutput({
  outputError: (str, write) => {
    write(str)
  },
})

try {
  const argv = [...process.argv]
  const separatorIndex = argv.indexOf("--")
  if (separatorIndex !== -1) {
    argv.splice(separatorIndex, 1)
  }
  program.parse(argv)
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error"
  process.stderr.write(`${message}\n`)
  process.exit(2)
}
