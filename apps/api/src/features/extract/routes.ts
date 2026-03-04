import type { FastifyPluginAsync } from "fastify"

import type { ExtractService } from "../../../../../packages/core/src/services/contracts.js"
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

export const extractRoutes: FastifyPluginAsync<ExtractRoutesOptions> = async (fastify, options) => {
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
      const result = await options.extractService.extractItem(
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

export type ExtractRoutesOptions = {
  extractService: Pick<ExtractService, "extractItem">
}
