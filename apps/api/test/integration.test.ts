import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { createApiApp } from "../src/app/create-api-app.js"

type SaveResponse = {
  ok: boolean
  created: boolean
  item: {
    id: number
    url: string
    tags: string[]
    status: "unread" | "read" | "archived"
  }
}

type ListResponse = {
  ok: boolean
  items: Array<{
    id: number
    url: string
    tags: string[]
    status: "unread" | "read" | "archived"
  }>
  paging: {
    limit: number
    offset: number
    returned: number
  }
}

type ItemResponse = {
  ok: boolean
  item: {
    id: number
    url: string
    tags: string[]
    status: "unread" | "read" | "archived"
  }
}

type StatusResponse = {
  ok: boolean
  item_id: number
  action: "mark_read" | "mark_unread"
  status: "read" | "unread"
}

type ExtractResponse = {
  ok: boolean
  item_id: number
  title_extracted: string | null
  title_updated: boolean
  content_length: number
  updated_at: string
}

type TagsListResponse = {
  ok: boolean
  tags: Array<{ name: string; item_count: number }>
  paging: {
    limit: number
    offset: number
    returned: number
  }
}

type TagMutationResponse = {
  ok: boolean
  item_id: number
  tag: string
  added?: boolean
  removed?: boolean
}

type TtsEnqueueResponse = {
  ok: boolean
  created: boolean
  job: {
    id: number
    item_id: number
    status: "queued" | "running"
  }
  poll_interval_ms: number
  poll_url: string
}

type TtsJobResponse = {
  ok: boolean
  job: {
    id: number
    item_id: number
    status: "queued" | "running" | "succeeded" | "failed"
    output_file_name: string | null
  }
}

type TtsJobsListResponse = {
  ok: boolean
  jobs: Array<{
    id: number
    item_id: number
    status: "queued" | "running" | "succeeded" | "failed"
  }>
  paging: {
    limit: number
    offset: number
    returned: number
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "../../..")
const migrationsDir = path.join(repoRoot, "drizzle")

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

function createTempPaths(): { dbPath: string; audioDir: string; cleanup: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-api-integration-"))
  const dbPath = path.join(tempDir, "stash.db")
  const audioDir = path.join(tempDir, "audio")
  const cleanup = (): void => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  return { dbPath, audioDir, cleanup }
}

function buildDataHtmlUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function parseJson<T>(payload: string): T {
  return JSON.parse(payload) as T
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
  ? "integration: stash API (skipped: better-sqlite3 native bindings unavailable)"
  : "integration: stash API"

integrationSuite(integrationTitle, () => {
  it("keeps endpoint response contracts stable across save/list/item/status/extract/tags/tts flows", async () => {
    const { dbPath, audioDir, cleanup } = createTempPaths()
    const app = createApiApp({
      dbPath,
      migrationsDir,
      audioDir,
    })

    try {
      const articleUrl = buildDataHtmlUrl(
        "<!doctype html><html><body><article><h1>API integration article</h1><p>Testing extraction and route contracts for API.</p></article></body></html>",
      )

      const saveRes = await app.inject({
        method: "POST",
        url: "/api/items",
        payload: {
          url: articleUrl,
          title: "API item",
          tags: ["API", "test"],
          extract: false,
        },
      })
      expect(saveRes.statusCode).toBe(200)
      const saveBody = parseJson<SaveResponse>(saveRes.payload)
      expect(Object.keys(saveBody).sort()).toEqual(["created", "item", "ok"])
      expect(saveBody.ok).toBe(true)
      expect(saveBody.created).toBe(true)
      expect(saveBody.item.tags).toEqual(["api", "test"])

      const itemId = saveBody.item.id

      const listRes = await app.inject({
        method: "GET",
        url: "/api/items",
      })
      expect(listRes.statusCode).toBe(200)
      const listBody = parseJson<ListResponse>(listRes.payload)
      expect(Object.keys(listBody).sort()).toEqual(["items", "ok", "paging"])
      expect(listBody.ok).toBe(true)
      expect(listBody.items[0]?.id).toBe(itemId)

      const getItemRes = await app.inject({
        method: "GET",
        url: `/api/items/${itemId}`,
      })
      expect(getItemRes.statusCode).toBe(200)
      const getItemBody = parseJson<ItemResponse>(getItemRes.payload)
      expect(Object.keys(getItemBody).sort()).toEqual(["item", "ok"])
      expect(getItemBody.ok).toBe(true)
      expect(getItemBody.item.id).toBe(itemId)

      const patchStatusRes = await app.inject({
        method: "PATCH",
        url: `/api/items/${itemId}/status`,
        payload: { status: "read" },
      })
      expect(patchStatusRes.statusCode).toBe(200)
      const patchStatusBody = parseJson<StatusResponse>(patchStatusRes.payload)
      expect(Object.keys(patchStatusBody).sort()).toEqual(["action", "item_id", "ok", "status"])
      expect(patchStatusBody.ok).toBe(true)
      expect(patchStatusBody.action).toBe("mark_read")
      expect(patchStatusBody.status).toBe("read")

      const extractRes = await app.inject({
        method: "POST",
        url: `/api/items/${itemId}/extract`,
        payload: {},
      })
      expect(extractRes.statusCode).toBe(200)
      const extractBody = parseJson<ExtractResponse>(extractRes.payload)
      expect(Object.keys(extractBody).sort()).toEqual([
        "content_length",
        "item_id",
        "ok",
        "title_extracted",
        "title_updated",
        "updated_at",
      ])
      expect(extractBody.ok).toBe(true)
      expect(extractBody.item_id).toBe(itemId)
      expect(extractBody.content_length).toBeGreaterThan(0)

      const tagsListRes = await app.inject({
        method: "GET",
        url: "/api/tags",
      })
      expect(tagsListRes.statusCode).toBe(200)
      const tagsListBody = parseJson<TagsListResponse>(tagsListRes.payload)
      expect(Object.keys(tagsListBody).sort()).toEqual(["ok", "paging", "tags"])
      expect(tagsListBody.ok).toBe(true)
      expect(tagsListBody.tags.map((entry) => entry.name)).toContain("api")

      const addTagRes = await app.inject({
        method: "POST",
        url: `/api/items/${itemId}/tags`,
        payload: { tag: "backend" },
      })
      expect(addTagRes.statusCode).toBe(200)
      const addTagBody = parseJson<TagMutationResponse>(addTagRes.payload)
      expect(Object.keys(addTagBody).sort()).toEqual(["added", "item_id", "ok", "tag"])
      expect(addTagBody.ok).toBe(true)
      expect(addTagBody.added).toBe(true)
      expect(addTagBody.tag).toBe("backend")

      const removeTagRes = await app.inject({
        method: "DELETE",
        url: `/api/items/${itemId}/tags/backend`,
      })
      expect(removeTagRes.statusCode).toBe(200)
      const removeTagBody = parseJson<TagMutationResponse>(removeTagRes.payload)
      expect(Object.keys(removeTagBody).sort()).toEqual(["item_id", "ok", "removed", "tag"])
      expect(removeTagBody.ok).toBe(true)
      expect(removeTagBody.removed).toBe(true)

      const enqueueTtsRes = await app.inject({
        method: "POST",
        url: `/api/items/${itemId}/tts`,
        payload: {},
      })
      expect(enqueueTtsRes.statusCode).toBe(202)
      const enqueueTtsBody = parseJson<TtsEnqueueResponse>(enqueueTtsRes.payload)
      expect(Object.keys(enqueueTtsBody).sort()).toEqual([
        "created",
        "job",
        "ok",
        "poll_interval_ms",
        "poll_url",
      ])
      expect(enqueueTtsBody.ok).toBe(true)
      expect(enqueueTtsBody.created).toBe(true)
      expect(enqueueTtsBody.job.item_id).toBe(itemId)
      expect(enqueueTtsBody.poll_url).toBe(`/api/tts-jobs/${enqueueTtsBody.job.id}`)

      const getJobRes = await app.inject({
        method: "GET",
        url: `/api/tts-jobs/${enqueueTtsBody.job.id}`,
      })
      expect(getJobRes.statusCode).toBe(200)
      const getJobBody = parseJson<TtsJobResponse>(getJobRes.payload)
      expect(Object.keys(getJobBody).sort()).toEqual(["job", "ok"])
      expect(getJobBody.ok).toBe(true)
      expect(getJobBody.job.id).toBe(enqueueTtsBody.job.id)

      const itemJobsRes = await app.inject({
        method: "GET",
        url: `/api/items/${itemId}/tts-jobs`,
      })
      expect(itemJobsRes.statusCode).toBe(200)
      const itemJobsBody = parseJson<TtsJobsListResponse>(itemJobsRes.payload)
      expect(Object.keys(itemJobsBody).sort()).toEqual(["jobs", "ok", "paging"])
      expect(itemJobsBody.ok).toBe(true)
      expect(itemJobsBody.jobs[0]?.id).toBe(enqueueTtsBody.job.id)
    } finally {
      await app.close()
      cleanup()
    }
  })
})
