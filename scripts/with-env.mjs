#!/usr/bin/env node
import { spawn } from "node:child_process"
import dotenv from "dotenv"

function maybeLoadDotEnv() {
  const result = dotenv.config({
    path: ".env",
    override: false,
    quiet: true,
  })

  if (result.error) {
    const nodeError = /** @type {{ code?: string }} */ (result.error)
    if (nodeError.code !== "ENOENT") {
      throw result.error
    }
  }
}

function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!command) {
    process.stderr.write("Usage: node scripts/with-env.mjs <command> [args...]\n")
    process.exit(2)
  }

  maybeLoadDotEnv()

  const child = spawn(command, args, {
    stdio: "inherit",
    env: process.env,
  })

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })
}

main()
