import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

type RunCliOptions = {
  dbPath: string
  expectedCode?: number
}

type CliResult = {
  stdout: string
  stderr: string
}

type StashItem = {
  id: number
  url: string
  tags: string[]
  status: "unread" | "read" | "archived"
}

type ListResponse = {
  ok: boolean
  items: StashItem[]
}

type DoctorResponse = {
  ok: boolean
  applied_count: number
  pending_count: number
}

type MigrateResponse = {
  ok: boolean
  applied_count: number
  applied: string[]
}

type SaveResponse = {
  ok: boolean
  created: boolean
  item: StashItem
}

type TagsListResponse = {
  ok: boolean
  tags: Array<{ name: string; item_count: number }>
}

type TagMutationResponse = {
  ok: boolean
  added?: boolean
  removed?: boolean
}

type MarkResponse = {
  ok: boolean
  action: "mark_read" | "mark_unread"
  status: "read" | "unread"
}

type ErrorResponse = {
  ok: false
  error: {
    code: string
    message: string
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const cliPath = path.join(repoRoot, "dist", "cli.js")
const articleUrl = "https://example.com/article"

function runCli(args: string[], options: RunCliOptions): CliResult {
  const { dbPath, expectedCode = 0 } = options
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      STASH_DB_PATH: dbPath,
    },
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== expectedCode) {
    throw new Error(
      `Command failed: node dist/cli.js ${args.join(" ")}
expected exit code: ${expectedCode}
actual exit code: ${String(result.status)}
stdout:
${result.stdout}
stderr:
${result.stderr}`,
    )
  }

  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  }
}

function runJson<T>(args: string[], options: RunCliOptions): T {
  const { stdout } = runCli([...args, "--json"], options)
  if (stdout.length === 0) {
    throw new Error(`Expected JSON output for command: ${args.join(" ")}`)
  }
  return JSON.parse(stdout) as T
}

function probeSqliteBinding(): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    [
      "-e",
      "import('better-sqlite3').then((mod) => { const Database = mod.default; const db = new Database(':memory:'); db.close(); process.exit(0); }).catch((error) => { console.error(error?.message ?? String(error)); process.exit(1); })",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  )
}

function createTempDb(): { dbPath: string; cleanup: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-integration-"))
  const dbPath = path.join(tempDir, "stash.db")
  const cleanup = (): void => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  return { dbPath, cleanup }
}

function seedSavedItem(dbPath: string): SaveResponse {
  return runJson<SaveResponse>(
    ["save", articleUrl, "--title", "Example article", "--tag", "AI", "--tag", "cli"],
    { dbPath },
  )
}

const sqliteProbe = probeSqliteBinding()
const sqliteProbeOutput = `${sqliteProbe.stdout}\n${sqliteProbe.stderr}`
const sqliteBindingsMissing =
  sqliteProbe.status !== 0 && sqliteProbeOutput.includes("Could not locate the bindings file")

if (sqliteProbe.status !== 0 && !sqliteBindingsMissing) {
  throw new Error(`Failed to load better-sqlite3 before tests:\n${sqliteProbeOutput}`)
}

const integrationSuite = sqliteBindingsMissing ? describe.skip : describe
const integrationTitle = sqliteBindingsMissing
  ? "integration: stash CLI (skipped: better-sqlite3 native bindings unavailable)"
  : "integration: stash CLI"

integrationSuite(integrationTitle, () => {
  describe("database bootstrap", () => {
    it("auto-applies migration on first list call", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        const preMigrationList = runJson<ListResponse>(["list"], { dbPath })
        expect(preMigrationList.ok).toBe(true)
        expect(preMigrationList.items).toEqual([])
      } finally {
        cleanup()
      }
    })

    it("reports expected migration status after bootstrap", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        runJson<ListResponse>(["list"], { dbPath })

        const migrationStatus = runJson<DoctorResponse>(["db", "doctor"], { dbPath })
        expect(migrationStatus.ok).toBe(true)
        expect(migrationStatus.applied_count).toBe(1)
        expect(migrationStatus.pending_count).toBe(0)
      } finally {
        cleanup()
      }
    })

    it("keeps db migrate idempotent", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        runJson<ListResponse>(["list"], { dbPath })

        const firstMigrate = runJson<MigrateResponse>(["db", "migrate"], { dbPath })
        expect(firstMigrate.ok).toBe(true)
        expect(firstMigrate.applied_count).toBe(0)
        expect(firstMigrate.applied).toEqual([])

        const secondMigrate = runJson<MigrateResponse>(["db", "migrate"], { dbPath })
        expect(secondMigrate.ok).toBe(true)
        expect(secondMigrate.applied_count).toBe(0)
      } finally {
        cleanup()
      }
    })
  })

  describe("save/list/tag lifecycle", () => {
    it("creates unread items with normalized tags", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        const firstSave = seedSavedItem(dbPath)
        expect(firstSave.ok).toBe(true)
        expect(firstSave.created).toBe(true)
        expect(firstSave.item.status).toBe("unread")
        expect(firstSave.item.tags).toEqual(["ai", "cli"])
      } finally {
        cleanup()
      }
    })

    it("deduplicates save by URL and merges tags", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        seedSavedItem(dbPath)

        const secondSave = runJson<SaveResponse>(
          ["save", articleUrl, "--tag", "news"],
          { dbPath },
        )
        expect(secondSave.ok).toBe(true)
        expect(secondSave.created).toBe(false)
        expect(secondSave.item.tags).toEqual(["ai", "cli", "news"])
      } finally {
        cleanup()
      }
    })

    it("supports status and tag filters", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        seedSavedItem(dbPath)
        runJson<SaveResponse>(["save", articleUrl, "--tag", "news"], { dbPath })

        const unreadList = runJson<ListResponse>(["list", "--status", "unread"], { dbPath })
        expect(unreadList.ok).toBe(true)
        expect(unreadList.items).toHaveLength(1)
        expect(unreadList.items[0]?.url).toBe(articleUrl)

        const anyTagList = runJson<ListResponse>(
          ["list", "--tag", "ai", "--tag", "missing", "--tag-mode", "any"],
          { dbPath },
        )
        expect(anyTagList.items).toHaveLength(1)

        const allTagList = runJson<ListResponse>(
          ["list", "--tag", "ai", "--tag", "news", "--tag-mode", "all"],
          { dbPath },
        )
        expect(allTagList.items).toHaveLength(1)

        const nonMatchingAllTagList = runJson<ListResponse>(
          ["list", "--tag", "ai", "--tag", "missing", "--tag-mode", "all"],
          { dbPath },
        )
        expect(nonMatchingAllTagList.items).toHaveLength(0)
      } finally {
        cleanup()
      }
    })

    it("lists tags and keeps add/rm idempotent", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        seedSavedItem(dbPath)
        runJson<SaveResponse>(["save", articleUrl, "--tag", "news"], { dbPath })

        const tagsBeforeMutation = runJson<TagsListResponse>(["tags", "list"], { dbPath })
        expect(tagsBeforeMutation.tags).toEqual([
          { name: "ai", item_count: 1 },
          { name: "cli", item_count: 1 },
          { name: "news", item_count: 1 },
        ])

        const addTag = runJson<TagMutationResponse>(["tag", "add", "1", "productivity"], { dbPath })
        expect(addTag.ok).toBe(true)
        expect(addTag.added).toBe(true)

        const addTagAgain = runJson<TagMutationResponse>(["tag", "add", "1", "productivity"], {
          dbPath,
        })
        expect(addTagAgain.ok).toBe(true)
        expect(addTagAgain.added).toBe(false)

        const tagsAfterAdd = runJson<TagsListResponse>(["tags", "list"], { dbPath })
        expect(tagsAfterAdd.tags).toEqual([
          { name: "ai", item_count: 1 },
          { name: "cli", item_count: 1 },
          { name: "news", item_count: 1 },
          { name: "productivity", item_count: 1 },
        ])

        const removeTag = runJson<TagMutationResponse>(["tag", "rm", "1", "productivity"], { dbPath })
        expect(removeTag.ok).toBe(true)
        expect(removeTag.removed).toBe(true)

        const removeTagAgain = runJson<TagMutationResponse>(["tag", "rm", "1", "productivity"], {
          dbPath,
        })
        expect(removeTagAgain.ok).toBe(true)
        expect(removeTagAgain.removed).toBe(false)
      } finally {
        cleanup()
      }
    })
  })

  describe("status transitions", () => {
    it("marks read then unread via alias and reflects filtered lists", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        seedSavedItem(dbPath)

        const markRead = runJson<MarkResponse>(["mark", "read", "1"], { dbPath })
        expect(markRead.ok).toBe(true)
        expect(markRead.action).toBe("mark_read")
        expect(markRead.status).toBe("read")

        const listRead = runJson<ListResponse>(["list", "--status", "read"], { dbPath })
        expect(listRead.items).toHaveLength(1)
        expect(listRead.items[0]?.id).toBe(1)

        const aliasUnread = runJson<MarkResponse>(["unread", "1"], { dbPath })
        expect(aliasUnread.ok).toBe(true)
        expect(aliasUnread.action).toBe("mark_unread")
        expect(aliasUnread.status).toBe("unread")

        const listUnread = runJson<ListResponse>(["list", "--status", "unread"], { dbPath })
        expect(listUnread.items).toHaveLength(1)
        expect(listUnread.items[0]?.id).toBe(1)
      } finally {
        cleanup()
      }
    })

    it("supports read alias for mark read", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        seedSavedItem(dbPath)

        const aliasRead = runJson<MarkResponse>(["read", "1"], { dbPath })
        expect(aliasRead.ok).toBe(true)
        expect(aliasRead.action).toBe("mark_read")
        expect(aliasRead.status).toBe("read")
      } finally {
        cleanup()
      }
    })
  })

  describe("error contracts", () => {
    it("returns NOT_FOUND with exit code 3 for missing items", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        const missingItem = runJson<ErrorResponse>(["mark", "read", "999"], {
          dbPath,
          expectedCode: 3,
        })
        expect(missingItem.ok).toBe(false)
        expect(missingItem.error.code).toBe("NOT_FOUND")
      } finally {
        cleanup()
      }
    })
  })
})
