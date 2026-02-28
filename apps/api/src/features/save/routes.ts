import type { FastifyPluginAsync } from "fastify"

import { saveItem } from "../../../../../packages/core/src/features/items/service.js"
import type { ApiRouteOptions } from "../options.js"
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
  },
  required: ["url"],
} as const

export const saveRoutes: FastifyPluginAsync<ApiRouteOptions> = async (fastify, options) => {
  fastify.post(
    "/items",
    {
      schema: {
        body: saveBodySchema,
      },
    },
    async (request) => {
      const result = await saveItem(
        {
          dbPath: options.dbPath,
          migrationsDir: options.migrationsDir,
        },
        parseSaveBody(request.body),
      )

      return {
        ok: true,
        ...result,
      }
    },
  )
}
