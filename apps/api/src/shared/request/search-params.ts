import type { FastifyRequest } from "fastify"

export function getSearchParams(request: FastifyRequest): URLSearchParams {
  return new URL(request.raw.url ?? "/", "http://localhost").searchParams
}
