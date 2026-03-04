import type { FastifyPluginAsync } from "fastify"

import type { TagsService } from "../../../../../packages/core/src/services/contracts.js"
import { getSearchParams } from "../../shared/request/search-params.js"
import { parseItemId, parseTagBody, parseTagParam, parseTagsListQuery } from "./dto.js"

const tagsListQuerySchema = {
  type: "object",
  properties: {
    limit: { type: "string", pattern: "^[1-9][0-9]*$" },
    offset: { type: "string", pattern: "^[0-9]+$" },
  },
} as const

const tagsItemParamsSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
  },
  required: ["id"],
} as const

const tagsItemTagParamsSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    tag: { type: "string", minLength: 1 },
  },
  required: ["id", "tag"],
} as const

const addTagBodySchema = {
  type: "object",
  properties: {
    tag: { type: "string", minLength: 1 },
  },
  required: ["tag"],
} as const

export const tagsRoutes: FastifyPluginAsync<TagsRoutesOptions> = async (fastify, options) => {
  fastify.get(
    "/tags",
    {
      schema: {
        querystring: tagsListQuerySchema,
      },
    },
    async (request) => {
      const result = options.tagsService.listTags(parseTagsListQuery(getSearchParams(request)))

      return {
        ok: true,
        ...result,
      }
    },
  )

  fastify.post(
    "/items/:id/tags",
    {
      schema: {
        params: tagsItemParamsSchema,
        body: addTagBodySchema,
      },
    },
    async (request) => {
      const params = request.params as Record<string, string>
      const result = options.tagsService.addTag(parseItemId(params), parseTagBody(request.body))

      return {
        ok: true,
        ...result,
      }
    },
  )

  fastify.delete(
    "/items/:id/tags/:tag",
    {
      schema: {
        params: tagsItemTagParamsSchema,
      },
    },
    async (request) => {
      const params = request.params as Record<string, string>
      const result = options.tagsService.removeTag(parseItemId(params), parseTagParam(params))

      return {
        ok: true,
        ...result,
      }
    },
  )
}

export type TagsRoutesOptions = {
  tagsService: Pick<TagsService, "listTags" | "addTag" | "removeTag">
}
