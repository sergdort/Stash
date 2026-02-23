#!/usr/bin/env node
import { spawn } from "node:child_process"
import fs from "node:fs"
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

function readExpectedNodeMajor() {
  try {
    const raw = fs.readFileSync(new URL("../.nvmrc", import.meta.url), "utf8")
    const firstLine = raw.split(/\r?\n/, 1)[0]?.trim() ?? ""
    if (firstLine.length === 0) {
      return undefined
    }

    const match = /^v?(\d+)$/.exec(firstLine)
    if (!match) {
      return undefined
    }

    const major = Number.parseInt(match[1], 10)
    return Number.isInteger(major) ? major : undefined
  } catch (error) {
    const nodeError = /** @type {{ code?: string }} */ (error)
    if (nodeError.code === "ENOENT") {
      return undefined
    }
    throw error
  }
}

function maybeWarnNodeVersionMismatch() {
  const expectedMajor = readExpectedNodeMajor()
  if (expectedMajor === undefined) {
    return
  }

  const currentVersion = process.versions.node
  const currentMajorText = currentVersion.split(".", 1)[0]
  const currentMajor = Number.parseInt(currentMajorText ?? "", 10)
  if (!Number.isInteger(currentMajor) || currentMajor === expectedMajor) {
    return
  }

  process.stderr.write(
    `[stash] Warning: running Node ${currentVersion}, but this repo expects Node ${expectedMajor}.x (from .nvmrc).\n`,
  )
  process.stderr.write(
    "[stash] Native modules like better-sqlite3 are ABI-specific and may fail after switching Node versions.\n",
  )
  process.stderr.write(
    "[stash] Fix: run `nvm use`, then `pnpm rebuild better-sqlite3` (or `pnpm install` if rebuild fails).\n",
  )
}

function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!command) {
    process.stderr.write("Usage: node scripts/with-env.mjs <command> [args...]\n")
    process.exit(2)
  }

  maybeLoadDotEnv()
  maybeWarnNodeVersionMismatch()

  const child = spawn(command, args, {
    stdio: "inherit",
    env: process.env,
  })

  let childExited = false

  const forwardSignal = (signal) => {
    if (childExited) {
      return
    }
    try {
      child.kill(signal)
    } catch {
      // Ignore errors if the child is already gone.
    }
  }

  process.on("SIGINT", () => {
    forwardSignal("SIGINT")
  })
  process.on("SIGTERM", () => {
    forwardSignal("SIGTERM")
  })
  process.on("SIGHUP", () => {
    forwardSignal("SIGHUP")
  })

  child.on("exit", (code, signal) => {
    childExited = true
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })
}

main()
