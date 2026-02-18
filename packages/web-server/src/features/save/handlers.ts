import { saveItem } from "../../../../core/src/features/items/service.js"
import { sendJson } from "../../shared/http/response.js"
import type { RouteContext } from "../../shared/http/types.js"
import { parseSaveBody } from "./dto.js"

export async function handleSaveItem(context: RouteContext): Promise<void> {
  const result = await saveItem(
    {
      dbPath: context.dbPath,
      migrationsDir: context.migrationsDir,
    },
    parseSaveBody(context.body),
  )

  sendJson(context.res, 200, {
    ok: true,
    ...result,
  })
}
