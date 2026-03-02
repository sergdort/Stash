import { spawn } from "node:child_process"

import { StashError } from "../../errors.js"
import type { AutoTagCandidate } from "./types.js"

type PythonScoreResponse = {
  ok: true
  scores: Array<{ tag: string; score: number }>
}

type PythonErrorResponse = {
  ok: false
  error: {
    code: string
    message: string
  }
}

function parsePythonResponse(raw: string): PythonScoreResponse {
  const parsed = JSON.parse(raw) as PythonScoreResponse | PythonErrorResponse
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid helper response.")
  }

  if ("ok" in parsed && parsed.ok === false) {
    throw new Error(`${parsed.error.code}: ${parsed.error.message}`)
  }

  if (!("ok" in parsed) || parsed.ok !== true || !Array.isArray(parsed.scores)) {
    throw new Error("Invalid helper score payload.")
  }

  return parsed
}

export async function scoreTagsWithPython(options: {
  pythonBin: string
  helperPath: string
  model: string
  text: string
  candidates: AutoTagCandidate[]
}): Promise<Map<string, number>> {
  const payload = JSON.stringify({
    model: options.model,
    text: options.text,
    candidates: options.candidates,
  })

  const result = await new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const proc = spawn(options.pythonBin, [options.helperPath], {
        stdio: ["pipe", "pipe", "pipe"],
      })
      let stdout = ""
      let stderr = ""

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString()
      })

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      proc.on("error", (error) => {
        reject(error)
      })

      proc.stdin.write(payload)
      proc.stdin.end()

      proc.on("close", (code) => {
        resolve({
          code: code ?? -1,
          stdout,
          stderr,
        })
      })
    },
  )

  if (result.code !== 0) {
    const message = result.stderr.trim() || `helper exited with ${result.code}`
    throw new StashError(
      `Auto-tags helper failed: ${message}`,
      "AUTO_TAGS_BACKEND_UNAVAILABLE",
      1,
      500,
    )
  }

  const parsed = parsePythonResponse(result.stdout.trim())
  const scores = new Map<string, number>()
  for (const row of parsed.scores) {
    if (typeof row.tag !== "string") {
      continue
    }
    const score = Number(row.score)
    if (!Number.isFinite(score)) {
      continue
    }
    scores.set(row.tag, score)
  }

  return scores
}
