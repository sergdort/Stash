import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import Database from "better-sqlite3"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { afterEach, describe, expect, it } from "vitest"

import * as schema from "../packages/core/src/db/schema.js"
import { startWebServer, type StartedWebServer } from "../packages/web-server/src/app/server.js"

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

function setItemStatus(dbPath: string, itemId: number, status: "unread" | "read" | "archived"): void {
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

describe("web server API", () => {
  const servers: StartedWebServer[] = []
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

    const health = await fetch(`${baseUrl}/api/health`).then((response) => readJson<{ ok: true }>(response))
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
      readJson<{ ok: boolean; items: Array<{ id: number }> }>(response),
    )
    expect(list.ok).toBe(true)
    expect(Array.isArray(list.items)).toBe(true)
    expect(list.items).toHaveLength(1)

    const item = await fetch(`${baseUrl}/api/items/${itemId}`).then((response) =>
      readJson<{ ok: boolean; item: { id: number } }>(response),
    )
    expect(item.ok).toBe(true)
    expect(item.item.id).toBe(itemId)

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
      readJson<
        | { ok: true; download_url: string }
        | { ok: false; error: { code: string; message: string } }
      >(response),
    )

    if (tts.ok) {
      expect(tts.download_url).toMatch(/^\/api\/audio\//)
    } else {
      expect(["TTS_PROVIDER_UNAVAILABLE", "INTERNAL_ERROR"]).toContain(tts.error.code)
    }
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

    const tagAny = await fetch(`${baseUrl}/api/items?status=active&tag=ai&tag=backend&tagMode=any`).then(
      (response) => readJson<{ ok: boolean; items: Array<{ id: number }> }>(response),
    )
    expect(tagAny.ok).toBe(true)
    expect(tagAny.items).toHaveLength(2)
    expect(tagAny.items.map((item) => item.id)).toContain(unreadSave.item.id)
    expect(tagAny.items.map((item) => item.id)).toContain(readSave.item.id)

    const tagAll = await fetch(`${baseUrl}/api/items?status=active&tag=tech&tag=backend&tagMode=all`).then(
      (response) => readJson<{ ok: boolean; items: Array<{ id: number }> }>(response),
    )
    expect(tagAll.ok).toBe(true)
    expect(tagAll.items).toHaveLength(1)
    expect(tagAll.items[0]?.id).toBe(readSave.item.id)
  })
})
