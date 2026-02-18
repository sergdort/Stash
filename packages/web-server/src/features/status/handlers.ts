import { markRead, markUnread } from "../../../../core/src/features/status/service.js"
import { sendJson } from "../../shared/http/response.js"
import type { RouteContext } from "../../shared/http/types.js"
import { parseItemId, parseStatusBody } from "./dto.js"

export function handleSetStatus(context: RouteContext): void {
  const itemId = parseItemId(context.params)
  const status = parseStatusBody(context.body)

  const result =
    status === "read"
      ? markRead(
          {
            dbPath: context.dbPath,
            migrationsDir: context.migrationsDir,
          },
          itemId,
        )
      : markUnread(
          {
            dbPath: context.dbPath,
            migrationsDir: context.migrationsDir,
          },
          itemId,
        )

  sendJson(context.res, 200, {
    ok: true,
    ...result,
  })
}
