import Fastify, { type FastifyInstance } from "fastify"

import type { ApiRouteOptions } from "../features/options.js"
import { extractRoutes } from "../features/extract/routes.js"
import { inboxRoutes } from "../features/inbox/routes.js"
import { itemRoutes } from "../features/item/routes.js"
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
