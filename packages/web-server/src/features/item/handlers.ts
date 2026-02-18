import { getItem } from "../../../../core/src/features/items/service.js"
import { StashError } from "../../../../core/src/errors.js"
import { sendJson } from "../../shared/http/response.js"
import type { RouteContext } from "../../shared/http/types.js"
import { parseItemId } from "./dto.js"

export function handleGetItem(context: RouteContext): void {
  const itemId = parseItemId(context.params)
  const item = getItem(
    {
      dbPath: context.dbPath,
      migrationsDir: context.migrationsDir,
    },
    itemId,
  )

  if (!item) {
    throw new StashError(`Item ${itemId} not found.`, "NOT_FOUND", 3, 404)
  }

  sendJson(context.res, 200, {
    ok: true,
    item,
  })
}
