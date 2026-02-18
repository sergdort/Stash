import { listItems } from "../../../../core/src/features/items/service.js"
import { sendJson } from "../../shared/http/response.js"
import type { RouteContext } from "../../shared/http/types.js"
import { parseInboxQuery } from "./dto.js"

export function handleInboxList(context: RouteContext): void {
  const result = listItems(
    {
      dbPath: context.dbPath,
      migrationsDir: context.migrationsDir,
    },
    parseInboxQuery(context.query),
  )

  sendJson(context.res, 200, {
    ok: true,
    ...result,
  })
}
