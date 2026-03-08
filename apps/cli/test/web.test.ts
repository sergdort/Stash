import net from "node:net"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { __testing__ } from "../src/web.js"

type RunCliOptions = {
  dbPath: string
  expectedCode?: number
  env?: NodeJS.ProcessEnv
}

type CliResult = {
  stdout: string
  stderr: string
}

type DaemonStatusResponse = {
  ok: true
  command: "web"
  lifecycle: "daemon"
  daemon: {
    running: boolean
    pid?: number
    pidFile: string
    logFile: string
    stateFile: string
    state?: {
      status: "starting" | "running" | "degraded" | "stopping" | "stopped" | "crashed"
      access: {
        local: { apiUrl: string; pwaUrl: string }
        tailnet: { host?: string; apiUrl?: string; pwaUrl?: string }
        warning?: string
      }
    }
  }
  already_running?: boolean
  access?: {
    local: { apiUrl: string; pwaUrl: string }
    tailnet: { host?: string; apiUrl?: string; pwaUrl?: string }
    warning?: string
  } | null
}

type DaemonStopResponse = {
  ok: true
  command: "web"
  lifecycle: "daemon"
  daemon: {
    stop_requested: true
    was_running: boolean
    stopped: boolean
    pid?: number
    timed_out: boolean
    permission_denied: boolean
  }
}

type ErrorResponse = {
  ok: false
  error: {
    code: string
    message: string
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "../../..")
const cliPath = path.join(repoRoot, "apps", "cli", "dist", "cli.js")

function probeSqliteBinding(): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    [
      "-e",
      "import('better-sqlite3').then((mod) => { const Database = mod.default; const db = new Database(':memory:'); db.close(); process.exit(0); }).catch((error) => { console.error(error?.message ?? String(error)); process.exit(1); })",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  )
}

async function canBindLocalListener(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once("error", (error: NodeJS.ErrnoException) => {
      server.close()
      resolve(error.code !== "EPERM")
    })
    server.listen(0, "127.0.0.1", () => {
      server.close(() => resolve(true))
    })
  })
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address !== "object") {
        reject(new Error("Failed to resolve free port."))
        return
      }
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(address.port)
      })
    })
  })
}

function runCli(args: string[], options: RunCliOptions): CliResult {
  const { dbPath, expectedCode = 0, env = {} } = options
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      STASH_DB_PATH: dbPath,
    },
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== expectedCode) {
    throw new Error(
      `Command failed: node apps/cli/dist/cli.js ${args.join(" ")}
expected exit code: ${expectedCode}
actual exit code: ${String(result.status)}
stdout:
${result.stdout}
stderr:
${result.stderr}`,
    )
  }

  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  }
}

function runJson<T>(args: string[], options: RunCliOptions): T {
  const { stdout } = runCli([...args, "--json"], options)
  if (stdout.length === 0) {
    throw new Error(`Expected JSON output for command: ${args.join(" ")}`)
  }
  return JSON.parse(stdout) as T
}

function createTempDb(): { dbPath: string; cleanup: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-web-cli-"))
  const dbPath = path.join(tempDir, "stash.db")
  const cleanup = (): void => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  return { dbPath, cleanup }
}

function createTempDaemonEnv(): {
  env: NodeJS.ProcessEnv
  cleanup: () => void
  daemonDir: string
} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-web-daemon-"))
  const daemonDir = path.join(tempDir, ".stash-daemon")
  const audioDir = path.join(tempDir, "audio")
  const tailscalePath = path.join(tempDir, "tailscale")
  fs.mkdirSync(audioDir, { recursive: true })
  fs.writeFileSync(
    tailscalePath,
    `#!/bin/sh
cat <<'JSON'
{
  "BackendState": "Running",
  "MagicDNSSuffix": "tail123.ts.net",
  "Self": {
    "HostName": "stash-macbook",
    "DNSName": "stash-macbook.tail123.ts.net.",
    "TailscaleIPs": ["100.64.0.10"]
  }
}
JSON
`,
    "utf8",
  )
  fs.chmodSync(tailscalePath, 0o755)

  return {
    daemonDir,
    env: {
      STASH_WEB_DAEMON_DIR: daemonDir,
      STASH_AUDIO_DIR: audioDir,
      STASH_TAILSCALE_CLI: tailscalePath,
    },
    cleanup: () => {
      fs.rmSync(tempDir, { recursive: true, force: true })
    },
  }
}

async function waitForDaemonRunning(
  dbPath: string,
  env: NodeJS.ProcessEnv,
  timeoutMs = 8_000,
): Promise<DaemonStatusResponse> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const status = runJson<DaemonStatusResponse>(["web", "--status"], { dbPath, env })
    if (status.daemon.running) {
      return status
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error("Timed out waiting for web daemon to report running status.")
}

const sqliteProbe = probeSqliteBinding()
const sqliteProbeOutput = `${sqliteProbe.stdout}\n${sqliteProbe.stderr}`
const sqliteBindingsMissing =
  sqliteProbe.status !== 0 && sqliteProbeOutput.includes("Could not locate the bindings file")
const listenerProbe = await canBindLocalListener()

const webSuite = sqliteBindingsMissing || !listenerProbe ? describe.skip : describe

webSuite("cli web daemon", () => {
  it("starts, reports status, is idempotent, and stops cleanly", async () => {
    const { dbPath, cleanup } = createTempDb()
    const daemonEnv = createTempDaemonEnv()
    const apiPort = await getFreePort()
    const pwaPort = await getFreePort()

    try {
      const started = runJson<DaemonStatusResponse>(
        ["web", "--daemon", "--api-port", String(apiPort), "--pwa-port", String(pwaPort)],
        {
          dbPath,
          env: daemonEnv.env,
        },
      )

      expect(started.ok).toBe(true)
      expect(started.lifecycle).toBe("daemon")
      expect(started.daemon.running).toBe(true)
      expect(started.access?.local.pwaUrl).toBe(`http://127.0.0.1:${pwaPort}`)
      expect(started.access?.tailnet.pwaUrl).toBe(`http://stash-macbook.tail123.ts.net:${pwaPort}`)

      const runningStatus = await waitForDaemonRunning(dbPath, daemonEnv.env)
      expect(runningStatus.daemon.pid).toBeTruthy()
      expect(runningStatus.daemon.state?.access.tailnet.apiUrl).toBe(
        `http://stash-macbook.tail123.ts.net:${apiPort}`,
      )

      const startedAgain = runJson<DaemonStatusResponse>(
        ["web", "--daemon", "--api-port", String(apiPort), "--pwa-port", String(pwaPort)],
        {
          dbPath,
          env: daemonEnv.env,
        },
      )
      expect(startedAgain.already_running).toBe(true)
      expect(startedAgain.daemon.pid).toBe(runningStatus.daemon.pid)

      const stopped = runJson<DaemonStopResponse>(["web", "--stop"], {
        dbPath,
        env: daemonEnv.env,
      })
      expect(stopped.daemon.stop_requested).toBe(true)
      expect(stopped.daemon.stopped).toBe(true)

      const stoppedStatus = runJson<DaemonStatusResponse>(["web", "--status"], {
        dbPath,
        env: daemonEnv.env,
      })
      expect(stoppedStatus.daemon.running).toBe(false)
    } finally {
      try {
        runJson<DaemonStopResponse>(["web", "--stop"], {
          dbPath,
          env: daemonEnv.env,
        })
      } catch {
        // Ignore cleanup failures if the daemon never started.
      }
      daemonEnv.cleanup()
      cleanup()
    }
  })

  it("rejects invalid daemon control flag combinations and status/stop overrides", () => {
    const { dbPath, cleanup } = createTempDb()
    try {
      const controlsError = runJson<ErrorResponse>(["web", "--daemon", "--status"], {
        dbPath,
        expectedCode: 2,
      })
      expect(controlsError.ok).toBe(false)
      expect(controlsError.error.code).toBe("VALIDATION_ERROR")

      const overrideError = runJson<ErrorResponse>(["web", "--status", "--api-port", "4173"], {
        dbPath,
        expectedCode: 2,
      })
      expect(overrideError.ok).toBe(false)
      expect(overrideError.error.code).toBe("VALIDATION_ERROR")
    } finally {
      cleanup()
    }
  })
})

describe("web helper behavior", () => {
  it("returns a loopback warning instead of Tailnet URLs when bound to localhost", () => {
    const access = __testing__.resolveWebAccessInfo("127.0.0.1", 4173, 5173)
    expect(access.local.pwaUrl).toBe("http://127.0.0.1:5173")
    expect(access.tailnet.pwaUrl).toBeUndefined()
    expect(access.warning).toContain("--host 0.0.0.0")
  })

  it("cleans up stale daemon pid files when the process is not running", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-web-status-"))
    const previousDaemonDir = process.env.STASH_WEB_DAEMON_DIR
    process.env.STASH_WEB_DAEMON_DIR = tempDir

    try {
      const paths = __testing__.buildDaemonPaths(tempDir)
      fs.mkdirSync(tempDir, { recursive: true })
      fs.writeFileSync(paths.pidFile, "999999\n", "utf8")
      fs.writeFileSync(
        paths.stateFile,
        JSON.stringify(
          {
            version: 1,
            runId: "stale-run",
            pid: 999999,
            lifecycle: "daemon",
            workspaceRoot: repoRoot,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: "crashed",
            logFile: paths.logFile,
            access: {
              bind: { host: "0.0.0.0", apiPort: 4173, pwaPort: 5173 },
              local: {
                apiUrl: "http://127.0.0.1:4173",
                pwaUrl: "http://127.0.0.1:5173",
              },
              tailnet: {
                host: undefined,
                apiUrl: undefined,
                pwaUrl: undefined,
              },
              warning: "stale",
            },
            service: {
              pid: undefined,
              restartCount: 1,
              lastStartAt: undefined,
              lastExitAt: undefined,
              lastExit: undefined,
            },
          },
          null,
          2,
        ),
        "utf8",
      )

      const status = __testing__.readWebDaemonStatus()
      expect(status.running).toBe(false)
      expect(fs.existsSync(paths.pidFile)).toBe(false)
      expect(status.state?.status).toBe("crashed")
    } finally {
      if (previousDaemonDir === undefined) {
        delete process.env.STASH_WEB_DAEMON_DIR
      } else {
        process.env.STASH_WEB_DAEMON_DIR = previousDaemonDir
      }
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
