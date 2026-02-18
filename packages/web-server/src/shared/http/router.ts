import type { IncomingMessage } from "node:http"

import type { RouteDefinition, RouteMethod } from "./types.js"

type CompiledRoute = {
  route: RouteDefinition
  regex: RegExp
  keys: string[]
}

function compilePath(path: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = []
  const pattern = path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        keys.push(segment.slice(1))
        return "([^/]+)"
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    })
    .join("/")

  return {
    regex: new RegExp(`^${pattern}$`),
    keys,
  }
}

export function compileRoutes(routes: RouteDefinition[]): CompiledRoute[] {
  return routes.map((route) => {
    const { regex, keys } = compilePath(route.path)
    return {
      route,
      regex,
      keys,
    }
  })
}

export function matchRoute(
  compiledRoutes: CompiledRoute[],
  method: RouteMethod,
  pathname: string,
): { route: RouteDefinition; params: Record<string, string> } | undefined {
  for (const compiled of compiledRoutes) {
    if (compiled.route.method !== method) {
      continue
    }

    const match = pathname.match(compiled.regex)
    if (!match) {
      continue
    }

    const params: Record<string, string> = {}
    for (let index = 0; index < compiled.keys.length; index += 1) {
      const key = compiled.keys[index]
      const value = match[index + 1]
      if (key && value) {
        params[key] = decodeURIComponent(value)
      }
    }

    return {
      route: compiled.route,
      params,
    }
  }

  return undefined
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  }

  if (chunks.length === 0) {
    return undefined
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim()
  if (raw.length === 0) {
    return undefined
  }

  return JSON.parse(raw)
}
