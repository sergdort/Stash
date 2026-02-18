import type { IncomingMessage, ServerResponse } from "node:http"

export type RouteMethod = "GET" | "POST" | "PATCH" | "DELETE"

export type RouteContext = {
  req: IncomingMessage
  res: ServerResponse
  params: Record<string, string>
  query: URLSearchParams
  body: unknown
  dbPath: string
  migrationsDir: string
  audioDir: string
}

export type RouteHandler = (context: RouteContext) => Promise<void> | void

export type RouteDefinition = {
  method: RouteMethod
  path: string
  handler: RouteHandler
}
