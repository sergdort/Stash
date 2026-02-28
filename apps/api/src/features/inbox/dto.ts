import type {
  ListItemsInput,
  ListItemsStatusFilter,
  TagMode,
} from "../../../../../packages/core/src/types.js"
import { asNonNegativeInt, asPositiveInt } from "../../shared/validation/parse.js"

export function parseInboxQuery(query: URLSearchParams): ListItemsInput {
  const status = query.get("status") ?? undefined
  const tagMode = query.get("tagMode") ?? undefined
  const limitRaw = query.get("limit") ?? undefined
  const offsetRaw = query.get("offset") ?? undefined
  const tags = query.getAll("tag")

  const input: ListItemsInput = {
    limit: limitRaw ? asPositiveInt(limitRaw, "limit") : 20,
    offset: offsetRaw ? asNonNegativeInt(offsetRaw, "offset") : 0,
  }

  if (status) {
    input.status = status as ListItemsStatusFilter
  }

  if (tags.length > 0) {
    input.tags = tags
  }

  if (tagMode) {
    input.tagMode = tagMode as TagMode
  }

  return input
}
