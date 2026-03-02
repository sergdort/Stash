import Fastify, { type FastifyInstance } from "fastify"
import { extractRoutes } from "../features/extract/routes.js"
import { inboxRoutes } from "../features/inbox/routes.js"
import { itemRoutes } from "../features/item/routes.js"
import type { ApiRouteOptions } from "../features/options.js"
import { saveRoutes } from "../features/save/routes.js"
import { statusRoutes } from "../features/status/routes.js"
import { tagsRoutes } from "../features/tags/routes.js"
import { ttsRoutes } from "../features/tts/routes.js"
import { registerApiErrorHandlers } from "./error-handler.js"

export type CreateApiAppOptions = ApiRouteOptions

export function createApiApp(options: CreateApiAppOptions): FastifyInstance {
  const server = Fastify({
    logger: false,
  })

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

      api.register(inboxRoutes, options)
      api.register(itemRoutes, options)
      api.register(saveRoutes, options)
      api.register(tagsRoutes, options)
      api.register(statusRoutes, options)
      api.register(extractRoutes, options)
      api.register(ttsRoutes, options)
    },
    { prefix: "/api" },
  )

  return server
}
