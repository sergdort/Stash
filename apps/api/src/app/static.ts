import fs from "node:fs"
import path from "node:path"
import type { IncomingMessage, ServerResponse } from "node:http"

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
}

export function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  webDistDir: string,
): boolean {
  const method = req.method ?? "GET"
  if (method !== "GET" && method !== "HEAD") {
    return false
  }

  const url = new URL(req.url ?? "/", "http://localhost")
  const pathname = url.pathname

  if (pathname.startsWith("/api/")) {
    return false
  }

  const hasDist = fs.existsSync(webDistDir)
  if (!hasDist) {
    if (pathname === "/" || pathname === "/index.html") {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>stash web</title></head><body><h1>stash web</h1><p>Frontend assets are not built yet. Run the web build before using UI.</p></body></html>`
      res.statusCode = 200
      res.setHeader("content-type", "text/html; charset=utf-8")
      res.end(html)
      return true
    }

    return false
  }

  const filePath =
    pathname === "/"
      ? path.join(webDistDir, "index.html")
      : path.join(webDistDir, pathname.slice(1))

  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(path.resolve(webDistDir))) {
    res.statusCode = 403
    res.end("Forbidden")
    return true
  }

  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    const ext = path.extname(resolved).toLowerCase()
    res.statusCode = 200
    res.setHeader("content-type", MIME_TYPES[ext] ?? "application/octet-stream")
    fs.createReadStream(resolved).pipe(res)
    return true
  }

  const indexPath = path.join(webDistDir, "index.html")
  if (fs.existsSync(indexPath)) {
    res.statusCode = 200
    res.setHeader("content-type", "text/html; charset=utf-8")
    fs.createReadStream(indexPath).pipe(res)
    return true
  }

  return false
}
