import type { FastifyPluginAsync } from "fastify"

import { StashError, type ItemsService } from "@stash/core"
import { parseItemId } from "./dto.js"

const itemParamsSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
  },
  required: ["id"],
} as const

export const itemRoutes: FastifyPluginAsync<ItemRoutesOptions> = async (fastify, options) => {
  fastify.get(
    "/items/:id",
    {
      schema: {
        params: itemParamsSchema,
      },
    },
    async (request) => {
      const itemId = parseItemId(request.params as Record<string, string>)
      const item = options.itemsService.getItem(itemId)

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

export type ItemRoutesOptions = {
  itemsService: Pick<ItemsService, "getItem">
}
