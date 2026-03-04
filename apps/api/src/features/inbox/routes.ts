import type { FastifyPluginAsync } from "fastify"

import type { ItemsService } from "../../../../../packages/core/src/services/contracts.js"
import { getSearchParams } from "../../shared/request/search-params.js"
import { parseInboxQuery } from "./dto.js"

const inboxQuerySchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["unread", "read", "archived", "active"] },
    tag: {
      oneOf: [
        { type: "string" },
        {
          type: "array",
          items: { type: "string" },
        },
      ],
    },
    tagMode: { type: "string", enum: ["any", "all"] },
    limit: { type: "string", pattern: "^[1-9][0-9]*$" },
    offset: { type: "string", pattern: "^[0-9]+$" },
  },
} as const

export const inboxRoutes: FastifyPluginAsync<InboxRoutesOptions> = async (fastify, options) => {
  fastify.get(
    "/items",
    {
      schema: {
        querystring: inboxQuerySchema,
      },
    },
    async (request) => {
      const result = options.itemsService.listItems(parseInboxQuery(getSearchParams(request)))

      return {
        ok: true,
        ...result,
      }
    },
  )
}

export type InboxRoutesOptions = {
  itemsService: Pick<ItemsService, "listItems">
}
