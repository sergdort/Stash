import { addTag, listTags, removeTag } from "../../../../core/src/features/tags/service.js"
import { sendJson } from "../../shared/http/response.js"
import type { RouteContext } from "../../shared/http/types.js"
import { parseItemId, parseTagBody, parseTagParam, parseTagsListQuery } from "./dto.js"

export function handleListTags(context: RouteContext): void {
  const result = listTags(
    {
      dbPath: context.dbPath,
      migrationsDir: context.migrationsDir,
    },
    parseTagsListQuery(context.query),
  )

  sendJson(context.res, 200, {
    ok: true,
    ...result,
  })
}

export function handleAddTag(context: RouteContext): void {
  const result = addTag(
    {
      dbPath: context.dbPath,
      migrationsDir: context.migrationsDir,
    },
    parseItemId(context.params),
    parseTagBody(context.body),
  )

  sendJson(context.res, 200, {
    ok: true,
    ...result,
  })
}

export function handleRemoveTag(context: RouteContext): void {
  const result = removeTag(
    {
      dbPath: context.dbPath,
      migrationsDir: context.migrationsDir,
    },
    parseItemId(context.params),
    parseTagParam(context.params),
  )

  sendJson(context.res, 200, {
    ok: true,
    ...result,
  })
}
