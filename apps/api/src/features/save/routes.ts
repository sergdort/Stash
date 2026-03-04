import type { FastifyPluginAsync } from "fastify"

import type { ItemsService } from "@stash/core"
import { parseSaveBody } from "./dto.js"

const saveBodySchema = {
  type: "object",
  properties: {
    url: { type: "string", minLength: 1 },
    title: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string" },
    },
    extract: { type: "boolean" },
    autoTags: { type: "boolean" },
  },
  required: ["url"],
} as const

export const saveRoutes: FastifyPluginAsync<SaveRoutesOptions> = async (fastify, options) => {
  fastify.post(
    "/items",
    {
      schema: {
        body: saveBodySchema,
      },
    },
    async (request) => {
      const result = await options.itemsService.saveItem(parseSaveBody(request.body))

      return {
        ok: true,
        ...result,
      }
    },
  )
}

export type SaveRoutesOptions = {
  itemsService: Pick<ItemsService, "saveItem">
}
