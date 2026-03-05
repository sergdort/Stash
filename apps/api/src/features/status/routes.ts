import type { FastifyPluginAsync } from "fastify"

import type { StatusService } from "@stash/core"
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

export const statusRoutes: FastifyPluginAsync<StatusRoutesOptions> = async (fastify, options) => {
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
          ? options.statusService.markRead(itemId)
          : options.statusService.markUnread(itemId)

      return {
        ok: true,
        ...result,
      }
    },
  )
}

export type StatusRoutesOptions = {
  statusService: Pick<StatusService, "markRead" | "markUnread">
}
