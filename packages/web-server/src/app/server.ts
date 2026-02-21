import http from "node:http"

import { startTtsWorker } from "../../../core/src/features/tts/jobs.js"
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

export type StartApiServerOptions = {
  host: string
  port: number
  dbPath: string
  migrationsDir: string
  // Kept for compatibility with legacy startWebServer callers.
  webDistDir?: string
  audioDir?: string
  ttsWorkerPollMs?: number
}

export type StartedApiServer = {
  server: http.Server
  host: string
  port: number
  audioDir: string
  close: () => Promise<void>
}

export type StartPwaServerOptions = {
  host: string
  port: number
  webDistDir: string
  apiHost: string
  apiPort: number
}

export type StartedPwaServer = {
  server: http.Server
  host: string
  port: number
  close: () => Promise<void>
}

export type StartWebStackOptions = {
  host: string
  apiPort: number
  pwaPort: number
  dbPath: string
  migrationsDir: string
  webDistDir: string
  audioDir?: string
  ttsWorkerPollMs?: number
}

export type StartedWebStack = {
  api: { host: string; port: number }
  pwa: { host: string; port: number }
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

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  )
}

function createListenError(role: "API" | "PWA", host: string, port: number, error: unknown): Error {
  if (isErrnoException(error) && error.code === "EADDRINUSE") {
    const wrapped = new Error(`${role} port ${port} on ${host} is already in use.`) as NodeJS.ErrnoException
    wrapped.code = "EADDRINUSE"
    return wrapped
  }

  if (error instanceof Error) {
    return error
  }

  return new Error(String(error))
}

async function listenServer(
  server: http.Server,
  role: "API" | "PWA",
  host: string,
  port: number,
): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      reject(createListenError(role, host, port, error))
    }
    server.once("error", onError)
    server.listen(port, host, () => {
      server.off("error", onError)
      resolve()
    })
  })

  const address = server.address()
  return address && typeof address === "object" && "port" in address ? address.port : port
}

async function closeHttpServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

async function proxyApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  apiHost: string,
  apiPort: number,
): Promise<void> {
  await new Promise<void>((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) {
        return
      }
      done = true
      resolve()
    }

    const proxyReq = http.request(
      {
        host: apiHost,
        port: apiPort,
        method: req.method ?? "GET",
        path: req.url ?? "/",
        headers: {
          ...req.headers,
          host: `${apiHost}:${apiPort}`,
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
        proxyRes.pipe(res)
        proxyRes.once("end", finish)
        proxyRes.once("close", finish)
      },
    )

    proxyReq.once("error", () => {
      if (!res.headersSent) {
        sendJson(res, 502, {
          ok: false,
          error: {
            code: "BAD_GATEWAY",
            message: "Failed to proxy request to API server.",
          },
        })
      } else {
        res.destroy()
      }
      finish()
    })

    req.once("error", () => {
      proxyReq.destroy()
      finish()
    })

    req.pipe(proxyReq)
  })
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/")
}

export async function startApiServer(options: StartApiServerOptions): Promise<StartedApiServer> {
  const compiledRoutes = compileRoutes(allRoutes)
  const audioDir = resolveAudioDir(options.audioDir)
  const workerOptions = { audioDir } as { audioDir: string; pollMs?: number }
  if (options.ttsWorkerPollMs !== undefined) {
    workerOptions.pollMs = options.ttsWorkerPollMs
  }

  const ttsWorker = startTtsWorker(
    {
      dbPath: options.dbPath,
      migrationsDir: options.migrationsDir,
    },
    workerOptions,
  )

  const server = http.createServer(async (req, res) => {
    try {
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

  let resolvedPort = options.port
  try {
    resolvedPort = await listenServer(server, "API", options.host, options.port)
  } catch (error) {
    await ttsWorker.stop()
    throw error
  }

  return {
    server,
    host: options.host,
    port: resolvedPort,
    audioDir,
    close: async () => {
      await ttsWorker.stop()
      await closeHttpServer(server)
    },
  }
}

export async function startPwaServer(options: StartPwaServerOptions): Promise<StartedPwaServer> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    if (isApiPath(url.pathname)) {
      await proxyApiRequest(req, res, options.apiHost, options.apiPort)
      return
    }

    if (serveStatic(req, res, options.webDistDir)) {
      return
    }

    sendJson(res, 404, {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
      },
    })
  })

  const resolvedPort = await listenServer(server, "PWA", options.host, options.port)

  return {
    server,
    host: options.host,
    port: resolvedPort,
    close: async () => {
      await closeHttpServer(server)
    },
  }
}

export async function startWebStack(options: StartWebStackOptions): Promise<StartedWebStack> {
  if (options.apiPort === options.pwaPort) {
    throw new Error("API and PWA ports must be different.")
  }

  const api = await startApiServer({
    host: options.host,
    port: options.apiPort,
    dbPath: options.dbPath,
    migrationsDir: options.migrationsDir,
    ...(options.audioDir !== undefined ? { audioDir: options.audioDir } : {}),
    ...(options.ttsWorkerPollMs !== undefined ? { ttsWorkerPollMs: options.ttsWorkerPollMs } : {}),
  })

  try {
    const pwa = await startPwaServer({
      host: options.host,
      port: options.pwaPort,
      webDistDir: options.webDistDir,
      apiHost: api.host,
      apiPort: api.port,
    })

    return {
      api: { host: api.host, port: api.port },
      pwa: { host: pwa.host, port: pwa.port },
      close: async () => {
        await pwa.close()
        await api.close()
      },
    }
  } catch (error) {
    await api.close()
    throw error
  }
}

export async function startWebServer(options: StartApiServerOptions): Promise<StartedApiServer> {
  return startApiServer(options)
}

export type StartWebServerOptions = StartApiServerOptions
export type StartedWebServer = StartedApiServer
