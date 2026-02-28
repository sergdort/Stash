import type { FastifyPluginAsync } from "fastify"

import { getItem } from "../../../../../packages/core/src/features/items/service.js"
import { StashError } from "../../../../../packages/core/src/errors.js"
import type { ApiRouteOptions } from "../options.js"
import { parseItemId } from "./dto.js"

const itemParamsSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
  },
  required: ["id"],
} as const

export const itemRoutes: FastifyPluginAsync<ApiRouteOptions> = async (fastify, options) => {
  fastify.get(
    "/items/:id",
    {
      schema: {
        params: itemParamsSchema,
      },
    },
    async (request) => {
      const itemId = parseItemId(request.params as Record<string, string>)
      const item = getItem(
        {
          dbPath: options.dbPath,
          migrationsDir: options.migrationsDir,
        },
        itemId,
      )

      if (!item) {
        throw new StashError(`Item ${itemId} not found.`, "NOT_FOUND", 3, 404)
      }

      return {
        ok: true,
        item,
      }
    },
  )
}
