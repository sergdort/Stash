import { extractItem } from "../../../../core/src/features/extract/service.js"
import { sendJson } from "../../shared/http/response.js"
import type { RouteContext } from "../../shared/http/types.js"
import { parseForce, parseItemId } from "./dto.js"

export async function handleExtractItem(context: RouteContext): Promise<void> {
  const result = await extractItem(
    {
      dbPath: context.dbPath,
      migrationsDir: context.migrationsDir,
    },
    parseItemId(context.params),
    parseForce(context.body),
  )

  sendJson(context.res, 200, {
    ok: true,
    ...result,
  })
}
