import type { FastifyError, FastifyInstance, FastifyReply } from "fastify"

import { StashError } from "../../../../packages/core/src/errors.js"

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string): void {
  void reply.code(statusCode).send({
    ok: false,
    error: {
      code,
      message,
    },
  })
}

export function registerApiErrorHandlers(server: FastifyInstance): void {
  server.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.code === "FST_ERR_CTP_INVALID_JSON_BODY" || error instanceof SyntaxError) {
      sendError(reply, 400, "VALIDATION_ERROR", "Invalid JSON body.")
      return
    }

    if (error instanceof StashError) {
      sendError(reply, error.httpStatus, error.code, error.message)
      return
    }

    if (error.validation) {
      sendError(reply, 400, "VALIDATION_ERROR", error.message)
      return
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    sendError(reply, 500, "INTERNAL_ERROR", message)
  })

  server.setNotFoundHandler((_request, reply) => {
    sendError(reply, 404, "NOT_FOUND", "Route not found.")
  })
}
