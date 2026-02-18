import type { ServerResponse } from "node:http"

export function sendJson(res: ServerResponse, statusCode: number, value: unknown): void {
  const body = JSON.stringify(value, null, 2)
  res.statusCode = statusCode
  res.setHeader("content-type", "application/json; charset=utf-8")
  res.setHeader("content-length", Buffer.byteLength(body))
  res.end(body)
}

export function sendText(res: ServerResponse, statusCode: number, value: string): void {
  res.statusCode = statusCode
  res.setHeader("content-type", "text/plain; charset=utf-8")
  res.end(value)
}
