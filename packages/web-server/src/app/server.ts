import http from "node:http"

import { resolveAudioDir } from "../../../core/src/lib/paths.js"
import { extractRoutes } from "../features/extract/routes.js"
import { inboxRoutes } from "../features/inbox/routes.js"
import { itemRoutes } from "../features/item/routes.js"
import { saveRoutes } from "../features/save/routes.js"
import { statusRoutes } from "../features/status/routes.js"
import { tagsRoutes } from "../features/tags/routes.js"
import { ttsRoutes } from "../features/tts/routes.js"
import { compileRoutes, matchRoute, readJsonBody } from "../shared/http/router.js"
import { sendJson } from "../shared/http/response.js"
import type { RouteDefinition, RouteMethod } from "../shared/http/types.js"
import { handleRouteError } from "./error-mapper.js"
import { serveStatic } from "./static.js"

export type StartWebServerOptions = {
  host: string
  port: number
  dbPath: string
  migrationsDir: string
  webDistDir: string
  audioDir?: string
}

export type StartedWebServer = {
  server: http.Server
  host: string
  port: number
  audioDir: string
  close: () => Promise<void>
}

const healthRoutes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/health",
    handler: ({ res }) => {
      sendJson(res, 200, { ok: true })
    },
  },
]

const allRoutes = [
  ...healthRoutes,
  ...inboxRoutes,
  ...itemRoutes,
  ...saveRoutes,
  ...tagsRoutes,
  ...statusRoutes,
  ...extractRoutes,
  ...ttsRoutes,
]

export async function startWebServer(options: StartWebServerOptions): Promise<StartedWebServer> {
  const compiledRoutes = compileRoutes(allRoutes)
  const audioDir = resolveAudioDir(options.audioDir)

  const server = http.createServer(async (req, res) => {
    try {
      if (serveStatic(req, res, options.webDistDir)) {
        return
      }

      const method = (req.method ?? "GET") as RouteMethod
      const url = new URL(req.url ?? "/", "http://localhost")

      const matched = matchRoute(compiledRoutes, method, url.pathname)
      if (!matched) {
        sendJson(res, 404, {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Route not found.",
          },
        })
        return
      }

      const hasBodyMethod = method === "POST" || method === "PATCH"
      const body = hasBodyMethod ? await readJsonBody(req) : undefined

      await matched.route.handler({
        req,
        res,
        params: matched.params,
        query: url.searchParams,
        body,
        dbPath: options.dbPath,
        migrationsDir: options.migrationsDir,
        audioDir,
      })
    } catch (error) {
      handleRouteError(res, error)
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(options.port, options.host, () => {
      server.off("error", reject)
      resolve()
    })
  })

  const address = server.address()
  const resolvedPort =
    address && typeof address === "object" && "port" in address ? address.port : options.port

  return {
    server,
    host: options.host,
    port: resolvedPort,
    audioDir,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}
