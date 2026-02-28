import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import type { FastifyInstance } from "fastify"
import { afterEach, describe, expect, it } from "vitest"

import { createApiApp } from "../src/app/create-api-app.js"

function createTempPaths(): { tempDir: string; dbPath: string; audioDir: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-api-inject-"))
  return {
    tempDir,
    dbPath: path.join(tempDir, "stash.db"),
    audioDir: path.join(tempDir, "audio"),
  }
}

type InjectSetup = {
  app: FastifyInstance
  tempDir: string
}

async function setupInjectApp(): Promise<InjectSetup> {
  const { tempDir, dbPath, audioDir } = createTempPaths()
  const app = createApiApp({
    dbPath,
    migrationsDir: path.join(process.cwd(), "drizzle"),
    audioDir,
  })
  await app.ready()
  return {
    app,
    tempDir,
  }
}

describe("api inject routes", () => {
  const setups: InjectSetup[] = []

  afterEach(async () => {
    while (setups.length > 0) {
      const setup = setups.pop()
      if (!setup) {
        continue
      }

      await setup.app.close()
      fs.rmSync(setup.tempDir, { recursive: true, force: true })
    }
  })

  it("returns health and not-found envelopes", async () => {
    const setup = await setupInjectApp()
    setups.push(setup)

    const health = await setup.app.inject({
      method: "GET",
      url: "/api/health",
    })
    expect(health.statusCode).toBe(200)
    expect(health.json()).toEqual({ ok: true })

    const notFound = await setup.app.inject({
      method: "GET",
      url: "/api/does-not-exist",
    })
    expect(notFound.statusCode).toBe(404)
    expect(notFound.json()).toEqual({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
      },
    })
  })

  it("maps invalid JSON payloads to VALIDATION_ERROR", async () => {
    const setup = await setupInjectApp()
    setups.push(setup)

    const response = await setup.app.inject({
      method: "POST",
      url: "/api/items",
      headers: {
        "content-type": "application/json",
      },
      payload: '{"url":',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid JSON body.",
      },
    })
  })

  it("supports save/list/get item flows", async () => {
    const setup = await setupInjectApp()
    setups.push(setup)

    const saveResponse = await setup.app.inject({
      method: "POST",
      url: "/api/items",
      payload: {
        url: "https://example.com/inject-save",
        title: "Inject Save",
        tags: ["AI", "Backend"],
        extract: false,
      },
    })
    expect(saveResponse.statusCode).toBe(200)
    const savePayload = saveResponse.json() as {
      ok: boolean
      created: boolean
      item: { id: number; tags: string[] }
    }
    expect(savePayload.ok).toBe(true)
    expect(savePayload.created).toBe(true)
    expect(savePayload.item.tags).toEqual(["ai", "backend"])

    const listResponse = await setup.app.inject({
      method: "GET",
      url: "/api/items?status=unread",
    })
    expect(listResponse.statusCode).toBe(200)
    const listPayload = listResponse.json() as { ok: boolean; items: Array<{ id: number }> }
    expect(listPayload.ok).toBe(true)
    expect(listPayload.items).toHaveLength(1)

    const itemResponse = await setup.app.inject({
      method: "GET",
      url: `/api/items/${savePayload.item.id}`,
    })
    expect(itemResponse.statusCode).toBe(200)
    const itemPayload = itemResponse.json() as { ok: boolean; item: { id: number } }
    expect(itemPayload.ok).toBe(true)
    expect(itemPayload.item.id).toBe(savePayload.item.id)
  })

  it("returns NOT_FOUND for missing item lookups", async () => {
    const setup = await setupInjectApp()
    setups.push(setup)

    const response = await setup.app.inject({
      method: "GET",
      url: "/api/items/999999",
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Item 999999 not found.",
      },
    })
  })
})
