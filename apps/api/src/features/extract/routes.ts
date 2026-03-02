import type { FastifyPluginAsync } from "fastify"

import { extractItem } from "../../../../../packages/core/src/features/extract/service.js"
import type { ApiRouteOptions } from "../options.js"
import { parseAutoTags, parseForce, parseItemId } from "./dto.js"

const extractParamsSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
  },
  required: ["id"],
} as const

const extractBodySchema = {
  type: "object",
  properties: {
    force: { type: "boolean" },
    autoTags: { type: "boolean" },
  },
} as const

export const extractRoutes: FastifyPluginAsync<ApiRouteOptions> = async (fastify, options) => {
  fastify.post(
    "/items/:id/extract",
    {
      schema: {
        params: extractParamsSchema,
        body: extractBodySchema,
      },
    },
    async (request) => {
      const autoTags = parseAutoTags(request.body)
      const result = await extractItem(
        {
          dbPath: options.dbPath,
          migrationsDir: options.migrationsDir,
        },
        parseItemId(request.params as Record<string, string>),
        {
          force: parseForce(request.body),
          ...(autoTags !== undefined ? { autoTags } : {}),
        },
      )

      return {
        ok: true,
        ...result,
      }
    },
  )
}
