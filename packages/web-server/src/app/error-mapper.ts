import { StashError } from "../../../core/src/errors.js"
import { sendJson } from "../shared/http/response.js"

export function handleRouteError(res: Parameters<typeof sendJson>[0], error: unknown): void {
  if (error instanceof SyntaxError) {
    sendJson(res, 400, {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid JSON body.",
      },
    })
    return
  }

  if (error instanceof StashError) {
    sendJson(res, error.httpStatus, {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    })
    return
  }

  const message = error instanceof Error ? error.message : "Unknown error"
  sendJson(res, 500, {
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message,
    },
  })
}
