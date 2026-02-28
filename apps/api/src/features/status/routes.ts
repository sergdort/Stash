import type { FastifyPluginAsync } from "fastify"

import { markRead, markUnread } from "../../../../../packages/core/src/features/status/service.js"
import type { ApiRouteOptions } from "../options.js"
import { parseItemId, parseStatusBody } from "./dto.js"

const statusParamsSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
  },
  required: ["id"],
} as const

const statusBodySchema = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["read", "unread"],
    },
  },
  required: ["status"],
} as const

export const statusRoutes: FastifyPluginAsync<ApiRouteOptions> = async (fastify, options) => {
  fastify.patch(
    "/items/:id/status",
    {
      schema: {
        params: statusParamsSchema,
        body: statusBodySchema,
      },
    },
    async (request) => {
      const params = request.params as Record<string, string>
      const status = parseStatusBody(request.body)
      const itemId = parseItemId(params)

      const result =
        status === "read"
          ? markRead(
              {
                dbPath: options.dbPath,
                migrationsDir: options.migrationsDir,
              },
              itemId,
            )
          : markUnread(
              {
                dbPath: options.dbPath,
                migrationsDir: options.migrationsDir,
              },
              itemId,
            )

      return {
        ok: true,
        ...result,
      }
    },
  )
}
