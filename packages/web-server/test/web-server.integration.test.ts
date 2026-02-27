import { spawnSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"

import Database from "better-sqlite3"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { afterEach, describe, expect, it } from "vitest"

import * as schema from "../../core/src/db/schema.js"
import { startWebServer, startWebStack } from "../src/app/server.js"

function createTempPaths(): { tempDir: string; dbPath: string; audioDir: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-web-"))
  return {
    tempDir,
    dbPath: path.join(tempDir, "stash.db"),
    audioDir: path.join(tempDir, "audio"),
  }
}

function seedNote(dbPath: string, itemId: number, content: string): void {
  const sqlite = new Database(dbPath)
  const db = drizzle(sqlite)
  const timestamp = new Date()

  db.insert(schema.notes)
    .values({
      itemId,
      content,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: schema.notes.itemId,
      set: {
        content,
        updatedAt: timestamp,
      },
    })
    .run()

  sqlite.close()
}

function setItemStatus(
  dbPath: string,
  itemId: number,
  status: "unread" | "read" | "archived",
): void {
  const sqlite = new Database(dbPath)
  const db = drizzle(sqlite)
  const timestamp = new Date()

  if (status === "archived") {
    db.update(schema.items)
      .set({
        status,
        readAt: null,
        archivedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(schema.items.id, itemId))
      .run()
  } else if (status === "read") {
    db.update(schema.items)
      .set({
        status,
        readAt: timestamp,
        archivedAt: null,
        updatedAt: timestamp,
      })
      .where(eq(schema.items.id, itemId))
      .run()
  } else {
    db.update(schema.items)
      .set({
        status,
        readAt: null,
        archivedAt: null,
        updatedAt: timestamp,
      })
      .where(eq(schema.items.id, itemId))
      .run()
  }

  sqlite.close()
}

function setItemThumbnail(dbPath: string, itemId: number, thumbnailUrl: string | null): void {
  const sqlite = new Database(dbPath)
  const db = drizzle(sqlite)
  const timestamp = new Date()

  db.update(schema.items)
    .set({
      thumbnailUrl,
      updatedAt: timestamp,
    })
    .where(eq(schema.items.id, itemId))
    .run()

  sqlite.close()
}

type ApiError = {
  ok: false
  error: {
    code: string
    message: string
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function waitForJob(
  baseUrl: string,
  jobId: number,
  timeoutMs = 5000,
): Promise<{
  id: number
  status: "queued" | "running" | "succeeded" | "failed"
  output_file_name: string | null
  error_code: string | null
  error_message: string | null
}> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/tts-jobs/${jobId}`)
    const payload = await readJson<{
      ok: true
      job: {
        id: number
        status: "queued" | "running" | "succeeded" | "failed"
        output_file_name: string | null
        error_code: string | null
        error_message: string | null
      }
    }>(response)

    if (payload.job.status === "succeeded" || payload.job.status === "failed") {
      return payload.job
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100)
    })
  }

  throw new Error(`Timed out waiting for tts job ${jobId}`)
}

function probeLocalhostListenCapability(): boolean {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      "const net=require('node:net');const server=net.createServer();server.once('error',()=>process.exit(1));server.listen(0,'127.0.0.1',()=>server.close(()=>process.exit(0)));",
    ],
    {
      encoding: "utf8",
    },
  )

  return result.status === 0
}

async function occupyPort(host: string): Promise<{
  port: number
  close: () => Promise<void>
}> {
  const server = await new Promise<http.Server>((resolve, reject) => {
    const instance = http.createServer()
    instance.once("error", reject)
    instance.listen(0, host, () => {
      instance.off("error", reject)
      resolve(instance)
    })
  })

  const address = server.address()
  if (!address || typeof address !== "object" || !("port" in address)) {
    throw new Error("Could not resolve occupied port.")
  }

  return {
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}

const canListenOnLocalhost = probeLocalhostListenCapability()
const webServerSuite = canListenOnLocalhost ? describe : describe.skip
const webServerSuiteTitle = canListenOnLocalhost
  ? "web server API"
  : "web server API (skipped: cannot bind localhost in this environment)"

type ClosableServer = {
  close: () => Promise<void>
}

webServerSuite(webServerSuiteTitle, () => {
  const servers: ClosableServer[] = []
  const cleanupDirs: string[] = []

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop()
      if (server) {
        await server.close()
      }
    }

    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop()
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it("supports save/list/item/tag/status and extract guard flows", async () => {
    const { tempDir, dbPath, audioDir } = createTempPaths()
    cleanupDirs.push(tempDir)

    const server = await startWebServer({
      host: "127.0.0.1",
      port: 0,
      dbPath,
      migrationsDir: path.join(process.cwd(), "drizzle"),
      webDistDir: path.join(process.cwd(), "apps", "web", "dist"),
      audioDir,
    })
    servers.push(server)

    const baseUrl = `http://${server.host}:${server.port}`

    const health = await fetch(`${baseUrl}/api/health`).then((response) =>
      readJson<{ ok: true }>(response),
    )
    expect(health).toEqual({ ok: true })

    const savePayload = {
      url: "https://example.com/story",
      title: "Story",
      tags: ["AI", "news"],
      extract: false,
    }

    const save = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(savePayload),
    }).then((response) =>
      readJson<{
        ok: boolean
        created: boolean
        item: { id: number; tags: string[] }
      }>(response),
    )

    expect(save.ok).toBe(true)
    expect(save.created).toBe(true)
    expect(save.item.tags).toEqual(["ai", "news"])

    const itemId = save.item.id as number

    const list = await fetch(`${baseUrl}/api/items?status=unread`).then((response) =>
      readJson<{
        ok: boolean
        items: Array<{ id: number; has_extracted_content: boolean; tts_audio: object | null }>
      }>(response),
    )
    expect(list.ok).toBe(true)
    expect(Array.isArray(list.items)).toBe(true)
    expect(list.items).toHaveLength(1)
    expect(list.items[0]?.has_extracted_content).toBe(false)
    expect(list.items[0]?.tts_audio).toBeNull()

    const item = await fetch(`${baseUrl}/api/items/${itemId}`).then((response) =>
      readJson<{
        ok: boolean
        item: { id: number; has_extracted_content: boolean; tts_audio: object | null }
      }>(response),
    )
    expect(item.ok).toBe(true)
    expect(item.item.id).toBe(itemId)
    expect(item.item.has_extracted_content).toBe(false)
    expect(item.item.tts_audio).toBeNull()

    const tags = await fetch(`${baseUrl}/api/tags`).then((response) =>
      readJson<{ ok: boolean; tags: Array<{ name: string }> }>(response),
    )
    expect(tags.ok).toBe(true)
    expect(tags.tags).toHaveLength(2)

    const addTag = await fetch(`${baseUrl}/api/items/${itemId}/tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag: "work" }),
    }).then((response) => readJson<{ ok: boolean; added: boolean }>(response))
    expect(addTag.ok).toBe(true)
    expect(addTag.added).toBe(true)

    const removeTag = await fetch(`${baseUrl}/api/items/${itemId}/tags/work`, {
      method: "DELETE",
    }).then((response) => readJson<{ ok: boolean; removed: boolean }>(response))
    expect(removeTag.ok).toBe(true)
    expect(removeTag.removed).toBe(true)

    const markRead = await fetch(`${baseUrl}/api/items/${itemId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "read" }),
    }).then((response) => readJson<{ ok: boolean; status: string }>(response))
    expect(markRead.ok).toBe(true)
    expect(markRead.status).toBe("read")

    seedNote(dbPath, itemId, "already extracted")

    const extractConflict = await fetch(`${baseUrl}/api/items/${itemId}/extract`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: false }),
    }).then((response) => readJson<ApiError>(response))

    expect(extractConflict.ok).toBe(false)
    expect(extractConflict.error.code).toBe("CONTENT_EXISTS")

    const tts = await fetch(`${baseUrl}/api/items/${itemId}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "mp3" }),
    }).then((response) =>
      readJson<{
        ok: true
        created: boolean
        job: {
          id: number
          status: "queued" | "running"
        }
        poll_url: string
        poll_interval_ms: number
      }>(response),
    )

    expect(tts.ok).toBe(true)
    expect(tts.created).toBe(true)
    expect(tts.job.status === "queued" || tts.job.status === "running").toBe(true)
    expect(tts.poll_url).toBe(`/api/tts-jobs/${tts.job.id}`)
    expect(tts.poll_interval_ms).toBeGreaterThan(0)

    const completedJob = await waitForJob(baseUrl, tts.job.id)
    expect(completedJob.status).toBe("succeeded")
    expect(completedJob.output_file_name).toBeTruthy()

    const itemAfterTts = await fetch(`${baseUrl}/api/items/${itemId}`).then((response) =>
      readJson<{
        ok: boolean
        item: {
          id: number
          has_extracted_content: boolean
          tts_audio: {
            file_name: string
            format: "mp3" | "wav"
            provider: string
            voice: string
            bytes: number
            generated_at: string
          } | null
        }
      }>(response),
    )
    expect(itemAfterTts.ok).toBe(true)
    expect(itemAfterTts.item.id).toBe(itemId)
    expect(itemAfterTts.item.has_extracted_content).toBe(true)
    expect(itemAfterTts.item.tts_audio).not.toBeNull()
    expect(itemAfterTts.item.tts_audio?.format).toBe("mp3")
    expect(itemAfterTts.item.tts_audio?.bytes).toBeGreaterThan(0)
    expect(itemAfterTts.item.tts_audio?.file_name).toBe(completedJob.output_file_name)

    const itemJobs = await fetch(`${baseUrl}/api/items/${itemId}/tts-jobs?limit=10`).then(
      (response) =>
        readJson<{
          ok: true
          jobs: Array<{ id: number }>
          paging: { limit: number; offset: number; returned: number }
        }>(response),
    )
    expect(itemJobs.ok).toBe(true)
    expect(itemJobs.paging.returned).toBeGreaterThan(0)
    expect(itemJobs.jobs[0]?.id).toBe(tts.job.id)

    const playbackPath = `/api/audio/${encodeURIComponent(completedJob.output_file_name as string)}`
    const downloadPath = `${playbackPath}?download=1`
    const playbackResponse = await fetch(`${baseUrl}${playbackPath}`)
    expect(playbackResponse.status).toBe(200)
    expect(playbackResponse.headers.get("content-disposition")).toMatch(/^inline;/)

    const downloadResponse = await fetch(`${baseUrl}${downloadPath}`)
    expect(downloadResponse.status).toBe(200)
    expect(downloadResponse.headers.get("content-disposition")).toMatch(/^attachment;/)
  })

  it("starts split API/PWA stack and proxies API requests through PWA port", async () => {
    const { tempDir, dbPath, audioDir } = createTempPaths()
    cleanupDirs.push(tempDir)

    const stack = await startWebStack({
      host: "127.0.0.1",
      apiPort: 0,
      pwaPort: 0,
      dbPath,
      migrationsDir: path.join(process.cwd(), "drizzle"),
      webDistDir: path.join(process.cwd(), "apps", "web", "dist"),
      audioDir,
    })
    servers.push(stack)

    const apiBaseUrl = `http://${stack.api.host}:${stack.api.port}`
    const pwaBaseUrl = `http://${stack.pwa.host}:${stack.pwa.port}`

    const apiHealth = await fetch(`${apiBaseUrl}/api/health`).then((response) =>
      readJson<{ ok: true }>(response),
    )
    expect(apiHealth).toEqual({ ok: true })

    const pwaHealth = await fetch(`${pwaBaseUrl}/api/health`).then((response) =>
      readJson<{ ok: true }>(response),
    )
    expect(pwaHealth).toEqual({ ok: true })

    const root = await fetch(`${pwaBaseUrl}/`)
    expect(root.status).toBe(200)
    expect((root.headers.get("content-type") ?? "").includes("text/html")).toBe(true)
  })

  it("fails when API and PWA ports are equal", async () => {
    const { tempDir, dbPath, audioDir } = createTempPaths()
    cleanupDirs.push(tempDir)

    await expect(
      startWebStack({
        host: "127.0.0.1",
        apiPort: 4173,
        pwaPort: 4173,
        dbPath,
        migrationsDir: path.join(process.cwd(), "drizzle"),
        webDistDir: path.join(process.cwd(), "apps", "web", "dist"),
        audioDir,
      }),
    ).rejects.toThrow("API and PWA ports must be different.")
  })

  it("fails with clear message when API port is already in use", async () => {
    const { tempDir, dbPath, audioDir } = createTempPaths()
    cleanupDirs.push(tempDir)

    const blocker = await occupyPort("127.0.0.1")
    try {
      await expect(
        startWebStack({
          host: "127.0.0.1",
          apiPort: blocker.port,
          pwaPort: 0,
          dbPath,
          migrationsDir: path.join(process.cwd(), "drizzle"),
          webDistDir: path.join(process.cwd(), "apps", "web", "dist"),
          audioDir,
        }),
      ).rejects.toThrow(`API port ${blocker.port} on 127.0.0.1 is already in use.`)
    } finally {
      await blocker.close()
    }
  })

  it("fails with clear message when PWA port is already in use", async () => {
    const { tempDir, dbPath, audioDir } = createTempPaths()
    cleanupDirs.push(tempDir)

    const blocker = await occupyPort("127.0.0.1")
    try {
      await expect(
        startWebStack({
          host: "127.0.0.1",
          apiPort: 0,
          pwaPort: blocker.port,
          dbPath,
          migrationsDir: path.join(process.cwd(), "drizzle"),
          webDistDir: path.join(process.cwd(), "apps", "web", "dist"),
          audioDir,
        }),
      ).rejects.toThrow(`PWA port ${blocker.port} on 127.0.0.1 is already in use.`)
    } finally {
      await blocker.close()
    }
  })

  it("returns thumbnail_url in list and item payloads", async () => {
    const { tempDir, dbPath, audioDir } = createTempPaths()
    cleanupDirs.push(tempDir)

    const server = await startWebServer({
      host: "127.0.0.1",
      port: 0,
      dbPath,
      migrationsDir: path.join(process.cwd(), "drizzle"),
      webDistDir: path.join(process.cwd(), "apps", "web", "dist"),
      audioDir,
    })
    servers.push(server)

    const baseUrl = `http://${server.host}:${server.port}`

    const save = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/thumbnail",
        title: "Thumbnail story",
        extract: false,
      }),
    }).then((response) => readJson<{ item: { id: number } }>(response))

    const itemId = save.item.id as number

    const itemBeforeThumbnail = await fetch(`${baseUrl}/api/items/${itemId}`).then((response) =>
      readJson<{ ok: boolean; item: { id: number; thumbnail_url: string | null } }>(response),
    )
    expect(itemBeforeThumbnail.ok).toBe(true)
    expect(itemBeforeThumbnail.item.id).toBe(itemId)
    expect(itemBeforeThumbnail.item.thumbnail_url).toBeNull()

    const thumbnailUrl = "https://cdn.example.com/thumbnail.png"
    setItemThumbnail(dbPath, itemId, thumbnailUrl)

    const list = await fetch(`${baseUrl}/api/items?status=unread`).then((response) =>
      readJson<{ ok: boolean; items: Array<{ id: number; thumbnail_url: string | null }> }>(
        response,
      ),
    )
    expect(list.ok).toBe(true)
    expect(
      list.items.some((item) => item.id === itemId && item.thumbnail_url === thumbnailUrl),
    ).toBe(true)

    const itemAfterThumbnail = await fetch(`${baseUrl}/api/items/${itemId}`).then((response) =>
      readJson<{ ok: boolean; item: { id: number; thumbnail_url: string | null } }>(response),
    )
    expect(itemAfterThumbnail.ok).toBe(true)
    expect(itemAfterThumbnail.item.id).toBe(itemId)
    expect(itemAfterThumbnail.item.thumbnail_url).toBe(thumbnailUrl)
  })

  it("returns NO_CONTENT for tts when notes are missing", async () => {
    const { tempDir, dbPath, audioDir } = createTempPaths()
    cleanupDirs.push(tempDir)

    const server = await startWebServer({
      host: "127.0.0.1",
      port: 0,
      dbPath,
      migrationsDir: path.join(process.cwd(), "drizzle"),
      webDistDir: path.join(process.cwd(), "apps", "web", "dist"),
      audioDir,
    })
    servers.push(server)

    const baseUrl = `http://${server.host}:${server.port}`

    const save = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/no-content",
        extract: false,
      }),
    }).then((response) => readJson<{ item: { id: number } }>(response))

    const itemId = save.item.id as number

    const tts = await fetch(`${baseUrl}/api/items/${itemId}/tts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "mp3" }),
    }).then((response) => readJson<ApiError>(response))

    expect(tts.ok).toBe(false)
    expect(tts.error.code).toBe("NO_CONTENT")
  })

  it("supports active status and tag any/all filters", async () => {
    const { tempDir, dbPath, audioDir } = createTempPaths()
    cleanupDirs.push(tempDir)

    const server = await startWebServer({
      host: "127.0.0.1",
      port: 0,
      dbPath,
      migrationsDir: path.join(process.cwd(), "drizzle"),
      webDistDir: path.join(process.cwd(), "apps", "web", "dist"),
      audioDir,
    })
    servers.push(server)

    const baseUrl = `http://${server.host}:${server.port}`

    const unreadSave = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/unread",
        title: "Unread story",
        tags: ["tech", "ai"],
        extract: false,
      }),
    }).then((response) => readJson<{ item: { id: number } }>(response))

    const readSave = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/read",
        title: "Read story",
        tags: ["tech", "backend"],
        extract: false,
      }),
    }).then((response) => readJson<{ item: { id: number } }>(response))

    const archivedSave = await fetch(`${baseUrl}/api/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/archived",
        title: "Archived story",
        tags: ["ops"],
        extract: false,
      }),
    }).then((response) => readJson<{ item: { id: number } }>(response))

    await fetch(`${baseUrl}/api/items/${readSave.item.id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "read" }),
    })
    setItemStatus(dbPath, archivedSave.item.id, "archived")

    const activeList = await fetch(`${baseUrl}/api/items?status=active`).then((response) =>
      readJson<{ ok: boolean; items: Array<{ id: number; status: string }> }>(response),
    )
    expect(activeList.ok).toBe(true)
    expect(activeList.items.map((item) => item.id)).toContain(unreadSave.item.id)
    expect(activeList.items.map((item) => item.id)).toContain(readSave.item.id)
    expect(activeList.items.map((item) => item.id)).not.toContain(archivedSave.item.id)

    const unreadOnly = await fetch(`${baseUrl}/api/items?status=unread`).then((response) =>
      readJson<{ ok: boolean; items: Array<{ id: number }> }>(response),
    )
    expect(unreadOnly.ok).toBe(true)
    expect(unreadOnly.items).toHaveLength(1)
    expect(unreadOnly.items[0]?.id).toBe(unreadSave.item.id)

    const readOnly = await fetch(`${baseUrl}/api/items?status=read`).then((response) =>
      readJson<{ ok: boolean; items: Array<{ id: number }> }>(response),
    )
    expect(readOnly.ok).toBe(true)
    expect(readOnly.items).toHaveLength(1)
    expect(readOnly.items[0]?.id).toBe(readSave.item.id)

    const tagAny = await fetch(
      `${baseUrl}/api/items?status=active&tag=ai&tag=backend&tagMode=any`,
    ).then((response) => readJson<{ ok: boolean; items: Array<{ id: number }> }>(response))
    expect(tagAny.ok).toBe(true)
    expect(tagAny.items).toHaveLength(2)
    expect(tagAny.items.map((item) => item.id)).toContain(unreadSave.item.id)
    expect(tagAny.items.map((item) => item.id)).toContain(readSave.item.id)

    const tagAll = await fetch(
      `${baseUrl}/api/items?status=active&tag=tech&tag=backend&tagMode=all`,
    ).then((response) => readJson<{ ok: boolean; items: Array<{ id: number }> }>(response))
    expect(tagAll.ok).toBe(true)
    expect(tagAll.items).toHaveLength(1)
    expect(tagAll.items[0]?.id).toBe(readSave.item.id)
  })
})
