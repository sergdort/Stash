import { spawn, spawnSync } from "node:child_process"

export function resolveBinary(options: {
  envVar?: string
  binaryNames: string[]
  fallbackPaths?: string[]
}): string | null {
  const { envVar, binaryNames, fallbackPaths = [] } = options

  if (envVar) {
    const envValue = process.env[envVar]?.trim()
    if (envValue) return envValue
  }

  for (const name of binaryNames) {
    const lookup = spawnSync("sh", ["-lc", `command -v ${name}`], { encoding: "utf-8" })
    const found = lookup.stdout?.trim()
    if (found) return found
  }

  for (const p of fallbackPaths) {
    const check = spawnSync("sh", ["-lc", `[ -x "${p}" ] && echo ok`], { encoding: "utf-8" })
    if (check.stdout?.trim() === "ok") return p
  }

  return null
}

export async function runCommand(bin: string, args: string[], stdinText?: string): Promise<{ code: number; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const proc = spawn(bin, args)
    let stderr = ""

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on("error", (err) => {
      reject(err)
    })

    if (stdinText !== undefined) {
      proc.stdin.write(stdinText)
      proc.stdin.end()
    }

    proc.on("close", (code) => {
      resolve({ code: code ?? -1, stderr })
    })
  })
}
