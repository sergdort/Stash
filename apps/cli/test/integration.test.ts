import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

type RunCliOptions = {
  dbPath: string
  expectedCode?: number
  env?: NodeJS.ProcessEnv
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

type TtsResponse = {
  ok: boolean
  item_id: number
  provider: string
  voice: string
  format: "mp3" | "wav"
  output_path: string
  file_name: string
  bytes: number
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
const repoRoot = path.resolve(__dirname, "../../..")
const cliPath = path.join(repoRoot, "dist", "apps", "cli", "src", "cli.js")
const articleUrl = "https://example.com/article"

function runCli(args: string[], options: RunCliOptions): CliResult {
  const { dbPath, expectedCode = 0, env = {} } = options
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      STASH_DB_PATH: dbPath,
    },
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== expectedCode) {
    throw new Error(
      `Command failed: node dist/apps/cli/src/cli.js ${args.join(" ")}
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

function upsertNoteContent(dbPath: string, itemId: number, content: string): void {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `import("better-sqlite3").then((mod) => {
  const Database = mod.default
  const db = new Database(process.env.DB_PATH)
  db.prepare(
    "insert into notes (item_id, content, updated_at) values (?, ?, ?) on conflict(item_id) do update set content=excluded.content, updated_at=excluded.updated_at"
  ).run(Number(process.env.ITEM_ID), process.env.NOTE_CONTENT ?? "", Date.now())
  db.close()
}).catch((error) => {
  console.error(error?.message ?? String(error))
  process.exit(1)
})`,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DB_PATH: dbPath,
        ITEM_ID: String(itemId),
        NOTE_CONTENT: content,
      },
    },
  )

  if (result.status !== 0) {
    throw new Error(`Failed to seed note content:\n${result.stdout}\n${result.stderr}`)
  }
}

function buildDataHtmlUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function getItemThumbnailUrl(dbPath: string, itemId: number): string | null {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `import("better-sqlite3").then((mod) => {
  const Database = mod.default
  const db = new Database(process.env.DB_PATH)
  const row = db
    .prepare("select thumbnail_url from items where id = ?")
    .get(Number(process.env.ITEM_ID))
  db.close()
  process.stdout.write(JSON.stringify(row?.thumbnail_url ?? null))
}).catch((error) => {
  console.error(error?.message ?? String(error))
  process.exit(1)
})`,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DB_PATH: dbPath,
        ITEM_ID: String(itemId),
      },
    },
  )

  if (result.status !== 0) {
    throw new Error(`Failed to read item thumbnail:\n${result.stdout}\n${result.stderr}`)
  }

  return JSON.parse(result.stdout.trim()) as string | null
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
        expect(migrationStatus.applied_count).toBe(2)
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

  describe("extraction thumbnail persistence", () => {
    it("persists thumbnail_url for save extraction and extract command flows", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        const saveExtractHtml = `<!doctype html><html><head><meta property="og:image" content="https://cdn.example.com/save-cover.png"></head><body><article><h1>Save flow</h1><p>${"Save flow content. ".repeat(24)}</p></article></body></html>`
        const saveExtractUrl = buildDataHtmlUrl(saveExtractHtml)
        const saved = runJson<SaveResponse>(["save", saveExtractUrl, "--title", "Save flow item"], {
          dbPath,
        })

        expect(getItemThumbnailUrl(dbPath, saved.item.id)).toBe("https://cdn.example.com/save-cover.png")

        const extractHtml = `<!doctype html><html><head><meta property="og:image" content="https://cdn.example.com/extract-cover.png"></head><body><article><h1>Extract flow</h1><p>${"Extract flow content. ".repeat(24)}</p></article></body></html>`
        const extractUrl = buildDataHtmlUrl(extractHtml)
        const savedWithoutExtract = runJson<SaveResponse>(
          ["save", extractUrl, "--title", "Extract flow item", "--no-extract"],
          { dbPath },
        )
        expect(getItemThumbnailUrl(dbPath, savedWithoutExtract.item.id)).toBeNull()

        runJson(["extract", String(savedWithoutExtract.item.id)], { dbPath })

        expect(getItemThumbnailUrl(dbPath, savedWithoutExtract.item.id)).toBe(
          "https://cdn.example.com/extract-cover.png",
        )
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

        const secondSave = runJson<SaveResponse>(["save", articleUrl, "--tag", "news"], { dbPath })
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

        const removeTag = runJson<TagMutationResponse>(["tag", "rm", "1", "productivity"], {
          dbPath,
        })
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

  describe("tts export", () => {
    it("writes to default ~/.stash/audio when no output overrides are provided", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        const saved = seedSavedItem(dbPath)
        upsertNoteContent(dbPath, saved.item.id, "A short article body for synthesized speech.")

        const homeDir = path.dirname(dbPath)
        const tts = runJson<TtsResponse>(["tts", String(saved.item.id)], {
          dbPath,
          env: {
            HOME: homeDir,
          },
        })

        const expectedDir = path.join(homeDir, ".stash", "audio")
        expect(tts.ok).toBe(true)
        expect(tts.item_id).toBe(saved.item.id)
        expect(tts.provider).toBe("coqui")
        expect(tts.output_path.startsWith(expectedDir)).toBe(true)
        expect(tts.file_name.includes(`id-${saved.item.id}`)).toBe(true)
        expect(tts.bytes).toBeGreaterThan(0)
        expect(fs.existsSync(tts.output_path)).toBe(true)
      } finally {
        cleanup()
      }
    })

    it("supports --audio-dir and STASH_AUDIO_DIR overrides", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        const saved = seedSavedItem(dbPath)
        upsertNoteContent(dbPath, saved.item.id, "Audio override test content.")
        const tempRoot = path.dirname(dbPath)
        const envDir = path.join(tempRoot, "env-audio")
        const flagDir = path.join(tempRoot, "flag-audio")

        const envResult = runJson<TtsResponse>(["tts", String(saved.item.id)], {
          dbPath,
          env: {
            STASH_AUDIO_DIR: envDir,
          },
        })
        expect(envResult.output_path.startsWith(envDir)).toBe(true)
        expect(fs.existsSync(envResult.output_path)).toBe(true)

        const flagResult = runJson<TtsResponse>(
          ["tts", String(saved.item.id), "--audio-dir", flagDir],
          {
            dbPath,
            env: {
              STASH_AUDIO_DIR: envDir,
            },
          },
        )
        expect(flagResult.output_path.startsWith(flagDir)).toBe(true)
        expect(fs.existsSync(flagResult.output_path)).toBe(true)
      } finally {
        cleanup()
      }
    })

    it("uses --out as highest-priority output target", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        const saved = seedSavedItem(dbPath)
        upsertNoteContent(dbPath, saved.item.id, "Explicit output path test content.")
        const tempRoot = path.dirname(dbPath)
        const explicitOutput = path.join(tempRoot, "exports", "article-audio")

        const tts = runJson<TtsResponse>(
          [
            "tts",
            String(saved.item.id),
            "--out",
            explicitOutput,
            "--audio-dir",
            path.join(tempRoot, "unused-audio-dir"),
          ],
          {
            dbPath,
            env: {
              STASH_AUDIO_DIR: path.join(tempRoot, "unused-env-dir"),
            },
          },
        )

        expect(tts.output_path).toBe(`${explicitOutput}.mp3`)
        expect(fs.existsSync(tts.output_path)).toBe(true)
      } finally {
        cleanup()
      }
    })

    it("generates unique auto filenames across repeated runs", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        const saved = seedSavedItem(dbPath)
        upsertNoteContent(dbPath, saved.item.id, "Unique file naming test content.")
        const audioDir = path.join(path.dirname(dbPath), "audio")

        const first = runJson<TtsResponse>(
          ["tts", String(saved.item.id), "--audio-dir", audioDir],
          { dbPath },
        )

        const second = runJson<TtsResponse>(
          ["tts", String(saved.item.id), "--audio-dir", audioDir],
          { dbPath },
        )

        expect(first.output_path).not.toBe(second.output_path)
        expect(fs.existsSync(first.output_path)).toBe(true)
        expect(fs.existsSync(second.output_path)).toBe(true)
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

    it("returns NOT_FOUND with exit code 3 for missing tts items", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        const missingItem = runJson<ErrorResponse>(["tts", "999"], {
          dbPath,
          expectedCode: 3,
        })
        expect(missingItem.ok).toBe(false)
        expect(missingItem.error.code).toBe("NOT_FOUND")
      } finally {
        cleanup()
      }
    })

    it("returns NO_CONTENT with exit code 2 when item has no extracted note", () => {
      const { dbPath, cleanup } = createTempDb()
      try {
        const saved = runJson<SaveResponse>(
          ["save", articleUrl, "--title", "No extract article", "--no-extract"],
          { dbPath },
        )
        const noContent = runJson<ErrorResponse>(["tts", String(saved.item.id)], {
          dbPath,
          expectedCode: 2,
        })
        expect(noContent.ok).toBe(false)
        expect(noContent.error.code).toBe("NO_CONTENT")
      } finally {
        cleanup()
      }
    })
  })
})
