#!/usr/bin/env node
import { spawn } from "node:child_process"

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm"

const processes = [
  { name: "api", args: ["run", "dev:api"] },
  { name: "web", args: ["run", "dev:web"] },
]

/** @type {Map<string, import("node:child_process").ChildProcess>} */
const children = new Map()
let shuttingDown = false
let exitCode = 0

function stopOthers(excludeName) {
  for (const [name, child] of children) {
    if (name === excludeName) {
      continue
    }
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM")
    }
  }
}

function shutdownAll(signal) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal)
    }
  }
}

for (const proc of processes) {
  const child = spawn(pnpmCommand, proc.args, {
    stdio: "inherit",
    env: process.env,
  })
  children.set(proc.name, child)

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return
    }

    if (signal) {
      exitCode = 1
    } else if (typeof code === "number" && code !== 0) {
      exitCode = code
    }

    shuttingDown = true
    stopOthers(proc.name)
  })
}

process.on("SIGINT", () => shutdownAll("SIGINT"))
process.on("SIGTERM", () => shutdownAll("SIGTERM"))
process.on("SIGHUP", () => shutdownAll("SIGHUP"))

const interval = setInterval(() => {
  const alive = [...children.values()].some((child) => child.exitCode === null && child.signalCode === null)
  if (alive) {
    return
  }

  clearInterval(interval)
  process.exit(exitCode)
}, 100)
