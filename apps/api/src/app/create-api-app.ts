import Fastify, { type FastifyInstance } from "fastify"
import type { CoreServices } from "@stash/core"
import { extractRoutes } from "../features/extract/routes.js"
import { inboxRoutes } from "../features/inbox/routes.js"
import { itemRoutes } from "../features/item/routes.js"
import { saveRoutes } from "../features/save/routes.js"
import { statusRoutes } from "../features/status/routes.js"
import { tagsRoutes } from "../features/tags/routes.js"
import { ttsRoutes } from "../features/tts/routes.js"
import { registerApiErrorHandlers } from "./error-handler.js"

export type CreateApiAppOptions = {
  services: CoreServices
  audioDir: string
}

export function createApiApp(options: CreateApiAppOptions): FastifyInstance {
  const server = Fastify({
    logger: false,
  })
  const { services } = options

  // Fastify's default JSON parser rejects empty bodies (e.g. DELETE with Content-Type: application/json).
  // Override it to treat empty bodies as undefined instead of an error.
  server.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (body === "") {
      done(null, undefined)
      return
    }
    try {
      done(null, JSON.parse(body as string))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  registerApiErrorHandlers(server)

  server.register(
    async (api) => {
      api.get("/health", async () => ({ ok: true }))

      api.register(inboxRoutes, { itemsService: services.items })
      api.register(itemRoutes, { itemsService: services.items })
      api.register(saveRoutes, { itemsService: services.items })
      api.register(tagsRoutes, { tagsService: services.tags })
      api.register(statusRoutes, { statusService: services.status })
      api.register(extractRoutes, { extractService: services.extract })
      api.register(ttsRoutes, {
        ttsJobsService: services.ttsJobs,
        audioDir: options.audioDir,
      })
    },
    { prefix: "/api" },
  )

  return server
}
