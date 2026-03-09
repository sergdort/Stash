import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { CliError } from "./error.js"

const WEB_DAEMON_SHUTDOWN_TIMEOUT_MS = 10_000
const WEB_DAEMON_STATUS_POLL_MS = 200
const WEB_RESTART_BACKOFF_BASE_MS = 1_000
const WEB_RESTART_BACKOFF_MAX_MS = 30_000
const WEB_RESTART_STABLE_WINDOW_MS = 60_000
const TAILSCALE_STATUS_TIMEOUT_MS = 2_000

const modulePath = fileURLToPath(import.meta.url)
const workspaceRoot = path.resolve(path.dirname(modulePath), "../../..")

type DaemonLifecycleStatus =
  | "starting"
  | "running"
  | "degraded"
  | "stopping"
  | "stopped"
  | "crashed"

type StartWebStackOptions = {
  host: string
  apiPort: number
  pwaPort: number
  dbPath: string
  migrationsDir: string
  webDistDir: string
  audioDir?: string
}

type StartedWebStack = {
  api: { host: string; port: number }
  pwa: { host: string; port: number }
  close: () => Promise<void>
}

type StartWebStackFn = (options: StartWebStackOptions) => Promise<StartedWebStack>

export type WebCommandOptions = {
  host: string | undefined
  apiPort: number | undefined
  pwaPort: number | undefined
  daemon: boolean | undefined
  status: boolean | undefined
  stop: boolean | undefined
  foreground: boolean | undefined
}

export type WebInternalCommandOptions = {
  host: string
  apiPort: number
  pwaPort: number
  dbPath: string
  migrationsDir: string
  webDistDir: string
  audioDir: string
  runId: string | undefined
}

export type RunWebCommandContext = {
  json: boolean
  dbPath: string
  migrationsDir: string
  webDistDir: string
  audioDir: string
  defaultApiPort: number
  defaultPwaPort: number
  envHost: string | undefined
  loadStartWebStack: () => Promise<StartWebStackFn>
}

type ResolvedWebRuntime = {
  host: string
  apiPort: number
  pwaPort: number
  dbPath: string
  migrationsDir: string
  webDistDir: string
  audioDir: string
}

type WebAccessInfo = {
  bind: {
    host: string
    apiPort: number
    pwaPort: number
  }
  local: {
    apiUrl: string
    pwaUrl: string
  }
  tailnet: {
    host: string | undefined
    apiUrl: string | undefined
    pwaUrl: string | undefined
  }
  warning: string | undefined
}

type WebDaemonServiceState = {
  pid: number | undefined
  restartCount: number
  lastStartAt: string | undefined
  lastExitAt: string | undefined
  lastExit:
    | {
        code: number | null
        signal: NodeJS.Signals | null
      }
    | undefined
}

type WebDaemonState = {
  version: 1
  runId: string
  pid: number
  lifecycle: "daemon"
  workspaceRoot: string
  startedAt: string
  updatedAt: string
  status: DaemonLifecycleStatus
  logFile: string
  access: WebAccessInfo
  lastEvent?: string
  service: WebDaemonServiceState
}

type WebDaemonStatus = {
  running: boolean
  pid: number | undefined
  pidFile: string
  logFile: string
  stateFile: string
  state: WebDaemonState | undefined
}

type DaemonPaths = {
  dir: string
  pidFile: string
  logFile: string
  stateFile: string
}

type RunWebStackOutputMode = "foreground" | "runner"

type RunnerLifecycleContext = {
  runtime: ResolvedWebRuntime
  access: WebAccessInfo
}

type SupervisorServiceRuntime = {
  restartCount: number
  failureStreak: number
  child: ChildProcess | undefined
  startedAtMs: number | undefined
}

const nowIso = (): string => new Date().toISOString()

const printJson = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

const trimTrailingDot = (value: string): string => value.replace(/\.$/, "")

const buildUrl = (host: string, port: number): string => `http://${host}:${port}`

const formatExit = (code: number | null, signal: NodeJS.Signals | null): string => {
  if (signal) {
    return `with signal ${signal}`
  }
  if (code === null) {
    return "without an exit code"
  }
  return `with code ${code}`
}

const daemonDirCandidates = (): string[] => {
  const overrideDir = process.env.STASH_WEB_DAEMON_DIR?.trim()
  const candidates = overrideDir
    ? [path.resolve(overrideDir)]
    : [path.join(os.homedir(), ".stash"), path.join(workspaceRoot, ".stash")]

  return [...new Set(candidates)]
}

const buildDaemonPaths = (dir: string): DaemonPaths => ({
  dir,
  pidFile: path.join(dir, "web-daemon.pid"),
  logFile: path.join(dir, "web-daemon.log"),
  stateFile: path.join(dir, "web-daemon.state.json"),
})

const hasDaemonStateFile = (paths: DaemonPaths): boolean =>
  fs.existsSync(paths.pidFile) || fs.existsSync(paths.stateFile)

const ensureDirWritable = (dir: string): boolean => {
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.accessSync(dir, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

const resolveDaemonPaths = (mode: "read" | "write"): DaemonPaths => {
  const candidates = daemonDirCandidates().map(buildDaemonPaths)
  const existing = candidates.find((candidate) => hasDaemonStateFile(candidate))
  if (existing) {
    return existing
  }

  if (mode === "read") {
    return candidates[0] as DaemonPaths
  }

  const writable = candidates.find((candidate) => ensureDirWritable(candidate.dir))
  return writable ?? (candidates[0] as DaemonPaths)
}

let cachedDaemonPaths: DaemonPaths | undefined

const resetDaemonPathsCache = (): void => {
  cachedDaemonPaths = undefined
}

const getDaemonPaths = (mode: "read" | "write" = "read"): DaemonPaths => {
  if (cachedDaemonPaths) {
    if (mode === "read") {
      return cachedDaemonPaths
    }

    if (ensureDirWritable(cachedDaemonPaths.dir)) {
      return cachedDaemonPaths
    }
  }

  const resolved = resolveDaemonPaths(mode)
  cachedDaemonPaths = resolved
  return resolved
}

const ensureDaemonDir = (): void => {
  const paths = getDaemonPaths("write")
  fs.mkdirSync(paths.dir, { recursive: true })
}

const writeJsonFile = (filePath: string, value: unknown): void => {
  ensureDaemonDir()
  const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const serialized = JSON.stringify(value, null, 2)
  fs.writeFileSync(tempFile, serialized)

  try {
    if (process.platform === "win32" && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    fs.renameSync(tempFile, filePath)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (process.platform === "win32" && (code === "EEXIST" || code === "EPERM")) {
      fs.writeFileSync(filePath, serialized)
      return
    }
    throw error
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile)
    }
  }
}

const readJsonFile = <T>(filePath: string): T | undefined => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === "ENOENT") {
      return undefined
    }
    process.stderr.write(
      `Failed to read JSON file at ${filePath}: ${nodeError.message ?? String(error)}\n`,
    )
    return undefined
  }
}

const readDaemonPid = (): number | undefined => {
  try {
    const raw = fs.readFileSync(getDaemonPaths("read").pidFile, "utf8").trim()
    const pid = Number(raw)
    if (!Number.isInteger(pid) || pid < 1) {
      return undefined
    }
    return pid
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      return undefined
    }
    return undefined
  }
}

const writeDaemonPid = (pid: number): void => {
  ensureDaemonDir()
  fs.writeFileSync(getDaemonPaths("write").pidFile, `${pid}\n`)
}

const removeDaemonPidFile = (): void => {
  try {
    fs.unlinkSync(getDaemonPaths("read").pidFile)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "ENOENT") {
      throw error
    }
  }
}

const isPidRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ESRCH") {
      return false
    }
    if (code === "EPERM") {
      return true
    }
    return false
  }
}

const loadDaemonState = (): WebDaemonState | undefined =>
  readJsonFile<WebDaemonState>(getDaemonPaths("read").stateFile)

const persistDaemonState = (state: WebDaemonState): void => {
  state.updatedAt = nowIso()
  writeJsonFile(getDaemonPaths("write").stateFile, state)
}

const isLoopbackHost = (host: string): boolean => {
  const normalized = host.trim().toLowerCase()
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("127.") ||
    normalized === "::1" ||
    normalized === "[::1]"
  )
}

const resolveWebAccessInfo = (host: string, apiPort: number, pwaPort: number): WebAccessInfo => {
  const local = {
    apiUrl: buildUrl("127.0.0.1", apiPort),
    pwaUrl: buildUrl("127.0.0.1", pwaPort),
  }

  if (isLoopbackHost(host)) {
    return {
      bind: { host, apiPort, pwaPort },
      local,
      tailnet: {
        host: undefined,
        apiUrl: undefined,
        pwaUrl: undefined,
      },
      warning: `Web stack is bound to ${host}; Tailnet access is unavailable unless you start it with --host 0.0.0.0.`,
    }
  }

  const tailscaleCli = process.env.STASH_TAILSCALE_CLI?.trim() || "tailscale"
  const status = spawnSync(tailscaleCli, ["status", "--json"], {
    encoding: "utf8",
    timeout: TAILSCALE_STATUS_TIMEOUT_MS,
  })

  if (status.error) {
    const error = status.error as NodeJS.ErrnoException
    return {
      bind: { host, apiPort, pwaPort },
      local,
      tailnet: {
        host: undefined,
        apiUrl: undefined,
        pwaUrl: undefined,
      },
      warning:
        error.code === "ENOENT"
          ? "Tailscale CLI not found; Tailnet URLs are unavailable."
          : `Failed to query Tailscale status: ${error.message}`,
    }
  }

  if (status.signal) {
    return {
      bind: { host, apiPort, pwaPort },
      local,
      tailnet: {
        host: undefined,
        apiUrl: undefined,
        pwaUrl: undefined,
      },
      warning: `Tailscale status command timed out after ${TAILSCALE_STATUS_TIMEOUT_MS}ms.`,
    }
  }

  if (status.status !== 0) {
    const stderr = status.stderr?.trim()
    return {
      bind: { host, apiPort, pwaPort },
      local,
      tailnet: {
        host: undefined,
        apiUrl: undefined,
        pwaUrl: undefined,
      },
      warning: stderr
        ? `Tailscale status unavailable: ${stderr}`
        : "Tailscale status unavailable; Tailnet URLs are unavailable.",
    }
  }

  try {
    const parsed = JSON.parse(status.stdout) as Record<string, unknown>
    const self = parsed.Self as Record<string, unknown> | undefined
    const backendState =
      typeof parsed.BackendState === "string" ? (parsed.BackendState as string) : undefined
    const dnsName =
      typeof self?.DNSName === "string" ? trimTrailingDot(self.DNSName as string) : undefined
    const hostName = typeof self?.HostName === "string" ? self.HostName.trim() : ""
    const magicSuffix =
      typeof parsed.MagicDNSSuffix === "string" ? trimTrailingDot(parsed.MagicDNSSuffix.trim()) : ""
    const tailscaleIps = Array.isArray(self?.TailscaleIPs)
      ? self.TailscaleIPs.filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        )
      : []
    const tailnetHost =
      dnsName ||
      (hostName && magicSuffix ? `${hostName}.${magicSuffix}` : undefined) ||
      tailscaleIps[0]

    let warning: string | undefined
    if (!tailnetHost) {
      warning = "Tailscale is available, but no Tailnet hostname or IP was detected."
    } else if (backendState && backendState !== "Running") {
      warning = `Tailscale backend state is ${backendState}; Tailnet access may be unavailable.`
    }

    return {
      bind: { host, apiPort, pwaPort },
      local,
      tailnet: {
        host: tailnetHost,
        apiUrl: tailnetHost ? buildUrl(tailnetHost, apiPort) : undefined,
        pwaUrl: tailnetHost ? buildUrl(tailnetHost, pwaPort) : undefined,
      },
      warning,
    }
  } catch {
    return {
      bind: { host, apiPort, pwaPort },
      local,
      tailnet: {
        host: undefined,
        apiUrl: undefined,
        pwaUrl: undefined,
      },
      warning: "Failed to parse Tailscale status JSON; Tailnet URLs are unavailable.",
    }
  }
}

const createDaemonState = (runId: string, pid: number, access: WebAccessInfo): WebDaemonState => ({
  version: 1,
  runId,
  pid,
  lifecycle: "daemon",
  workspaceRoot,
  startedAt: nowIso(),
  updatedAt: nowIso(),
  status: "starting",
  logFile: getDaemonPaths("write").logFile,
  access,
  service: {
    pid: undefined,
    restartCount: 0,
    lastStartAt: undefined,
    lastExitAt: undefined,
    lastExit: undefined,
  },
})

const resolveCliEntryPath = (): string => {
  if (process.argv[1]) {
    return process.argv[1]
  }

  const extension = path.extname(modulePath)
  return path.resolve(path.dirname(modulePath), extension === ".ts" ? "cli.ts" : "cli.js")
}

const readWebDaemonStatus = (): WebDaemonStatus => {
  const paths = getDaemonPaths("read")
  const state = loadDaemonState()
  const pidFromFile = readDaemonPid()
  const pid = pidFromFile ?? state?.pid
  const running = pid !== undefined ? isPidRunning(pid) : false

  if (pidFromFile !== undefined && !running) {
    removeDaemonPidFile()
  }

  return {
    running,
    pid: running ? pid : undefined,
    pidFile: paths.pidFile,
    logFile: paths.logFile,
    stateFile: paths.stateFile,
    state,
  }
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const emitAccessSummary = (access: WebAccessInfo): void => {
  process.stdout.write(`PWA local: ${access.local.pwaUrl}\n`)
  process.stdout.write(`API local: ${access.local.apiUrl}\n`)
  if (access.tailnet.pwaUrl) {
    process.stdout.write(`PWA tailnet: ${access.tailnet.pwaUrl}\n`)
  }
  if (access.tailnet.apiUrl) {
    process.stdout.write(`API tailnet: ${access.tailnet.apiUrl}\n`)
  }
  if (access.warning) {
    process.stderr.write(`Warning: ${access.warning}\n`)
  }
}

const buildDaemonPayload = (
  daemon: WebDaemonStatus,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ok: true,
  command: "web",
  lifecycle: "daemon",
  daemon,
  ...extra,
})

const emitDaemonStartResult = (
  daemon: WebDaemonStatus,
  alreadyRunning: boolean,
  jsonMode: boolean,
): void => {
  if (jsonMode) {
    printJson(
      buildDaemonPayload(daemon, {
        already_running: alreadyRunning,
        access: daemon.state?.access ?? null,
      }),
    )
    return
  }

  if (alreadyRunning) {
    process.stdout.write(`Web daemon is already running (pid ${String(daemon.pid)}).\n`)
  } else {
    process.stdout.write(`Started web daemon (pid ${String(daemon.pid)}).\n`)
  }
  process.stdout.write(`State file: ${daemon.stateFile}\n`)
  process.stdout.write(`Log file: ${daemon.logFile}\n`)
  if (daemon.state?.access) {
    emitAccessSummary(daemon.state.access)
  }
  process.stdout.write("Status: stash web --status --json\n")
  process.stdout.write("Stop: stash web --stop --json\n")
}

const stopWebDaemon = async (): Promise<{
  wasRunning: boolean
  stopped: boolean
  pid?: number
  timedOut?: boolean
  permissionDenied?: boolean
}> => {
  const daemon = readWebDaemonStatus()
  const pid = daemon.pid
  if (pid === undefined || !daemon.running) {
    removeDaemonPidFile()
    return {
      wasRunning: false,
      stopped: true,
    }
  }

  try {
    process.kill(pid, "SIGTERM")
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ESRCH") {
      removeDaemonPidFile()
      return {
        wasRunning: false,
        stopped: true,
      }
    }

    if (code === "EPERM") {
      return {
        wasRunning: true,
        stopped: false,
        pid,
        permissionDenied: true,
      }
    }

    throw error
  }

  const deadline = Date.now() + WEB_DAEMON_SHUTDOWN_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (!isPidRunning(pid)) {
      removeDaemonPidFile()
      return {
        wasRunning: true,
        stopped: true,
        pid,
      }
    }

    await sleep(WEB_DAEMON_STATUS_POLL_MS)
  }

  return {
    wasRunning: true,
    stopped: false,
    pid,
    timedOut: true,
  }
}

const buildInternalWebCommandArgs = (
  command: "web-runner" | "web-supervisor",
  runtime: ResolvedWebRuntime,
  extraArgs: string[] = [],
): string[] => [
  "--db-path",
  runtime.dbPath,
  command,
  "--host",
  runtime.host,
  "--api-port",
  String(runtime.apiPort),
  "--pwa-port",
  String(runtime.pwaPort),
  "--migrations-dir",
  runtime.migrationsDir,
  "--web-dist-dir",
  runtime.webDistDir,
  "--audio-dir",
  runtime.audioDir,
  ...extraArgs,
]

const startRunnerProcess = (runtime: ResolvedWebRuntime): ChildProcess => {
  const cliEntryPath = resolveCliEntryPath()
  return spawn(
    process.execPath,
    [...process.execArgv, cliEntryPath, ...buildInternalWebCommandArgs("web-runner", runtime)],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        STASH_WEB_DAEMON_DIR: getDaemonPaths("write").dir,
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  )
}

const runSupervisorLoop = async (
  runtime: ResolvedWebRuntime,
  state: WebDaemonState,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    let settled = false
    let shuttingDown = false
    let restartTimer: NodeJS.Timeout | undefined
    const service: SupervisorServiceRuntime = {
      restartCount: 0,
      failureStreak: 0,
      child: undefined,
      startedAtMs: undefined,
    }

    const hasRunningChild = (): boolean =>
      service.child !== undefined &&
      service.child.exitCode === null &&
      service.child.signalCode === null

    const stopChild = (signal: NodeJS.Signals = "SIGTERM"): void => {
      const child = service.child
      if (!child || child.exitCode !== null || child.signalCode !== null) {
        return
      }
      child.kill(signal)
    }

    const persist = (): void => {
      persistDaemonState(state)
    }

    const cleanup = (): void => {
      process.off("SIGINT", handleSignal)
      process.off("SIGTERM", handleSignal)
      if (restartTimer) {
        clearTimeout(restartTimer)
        restartTimer = undefined
      }
    }

    const finishResolve = (): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve()
    }

    const finishReject = (error: Error): void => {
      if (settled) {
        return
      }
      settled = true
      shuttingDown = true
      stopChild("SIGTERM")
      cleanup()
      reject(error)
    }

    const refreshOverallStatus = (): void => {
      if (shuttingDown) {
        state.status = "stopping"
      } else if (hasRunningChild()) {
        state.status = "running"
      } else if (state.status === "starting") {
        state.status = "starting"
      } else {
        state.status = "degraded"
      }
      persist()
    }

    const handleSignal = (signal: NodeJS.Signals): void => {
      if (shuttingDown) {
        return
      }

      shuttingDown = true
      state.status = "stopping"
      state.lastEvent = `Received ${signal}; stopping web runner.`
      persist()

      if (restartTimer) {
        clearTimeout(restartTimer)
        restartTimer = undefined
      }

      stopChild("SIGTERM")

      if (!hasRunningChild()) {
        finishResolve()
      }
    }

    const startRunner = (): void => {
      let child: ChildProcess
      try {
        child = startRunnerProcess(runtime)
      } catch (error) {
        finishReject(
          new CliError(
            `Failed to start web runner process: ${error instanceof Error ? error.message : String(error)}`,
            "INTERNAL_ERROR",
            1,
          ),
        )
        return
      }

      service.child = child
      service.startedAtMs = Date.now()

      state.service.pid = child.pid ?? undefined
      state.service.lastStartAt = nowIso()
      state.lastEvent = `Web runner started (pid ${child.pid ?? "unknown"}).`
      refreshOverallStatus()

      child.once("error", (error) => {
        if (settled || shuttingDown) {
          return
        }

        state.status = "degraded"
        state.lastEvent = `Web runner process error: ${error.message}`
        persist()
      })

      child.once("close", (code, signal) => {
        service.child = undefined

        state.service.pid = undefined
        state.service.lastExitAt = nowIso()
        state.service.lastExit = {
          code,
          signal,
        }

        if (shuttingDown) {
          refreshOverallStatus()
          if (!hasRunningChild()) {
            finishResolve()
          }
          return
        }

        const uptimeMs = service.startedAtMs ? Date.now() - service.startedAtMs : 0
        if (uptimeMs > WEB_RESTART_STABLE_WINDOW_MS) {
          service.failureStreak = 0
        } else {
          service.failureStreak += 1
        }

        service.restartCount += 1
        state.service.restartCount = service.restartCount

        const cappedExponent = Math.min(service.failureStreak, 5)
        const backoffMs = Math.min(
          WEB_RESTART_BACKOFF_MAX_MS,
          WEB_RESTART_BACKOFF_BASE_MS * 2 ** cappedExponent,
        )

        state.status = "degraded"
        state.lastEvent = `Web runner exited ${formatExit(code, signal)}. Restarting in ${backoffMs}ms.`
        persist()

        restartTimer = setTimeout(() => {
          restartTimer = undefined
          if (shuttingDown || settled) {
            return
          }
          startRunner()
        }, backoffMs)
      })
    }

    process.on("SIGINT", handleSignal)
    process.on("SIGTERM", handleSignal)

    startRunner()
    if (!settled) {
      state.status = "running"
      state.lastEvent = "Supervisor started web runner."
      persist()
    }
  })
}

const runWebStack = async (
  lifecycleContext: RunnerLifecycleContext,
  loadStartWebStack: () => Promise<StartWebStackFn>,
  outputMode: RunWebStackOutputMode,
  jsonMode: boolean,
): Promise<void> => {
  const { runtime, access } = lifecycleContext
  if (runtime.apiPort === runtime.pwaPort) {
    throw new CliError("API and PWA ports must be different.", "VALIDATION_ERROR", 2)
  }

  const startWebStack = await loadStartWebStack()
  const web = await startWebStack({
    host: runtime.host,
    apiPort: runtime.apiPort,
    pwaPort: runtime.pwaPort,
    dbPath: runtime.dbPath,
    migrationsDir: runtime.migrationsDir,
    webDistDir: runtime.webDistDir,
    audioDir: runtime.audioDir,
  })

  if (outputMode === "foreground") {
    if (jsonMode) {
      printJson({
        ok: true,
        command: "web",
        lifecycle: "foreground",
        access,
        api: {
          host: web.api.host,
          port: web.api.port,
        },
        pwa: {
          host: web.pwa.host,
          port: web.pwa.port,
        },
      })
    } else {
      process.stdout.write("stash web running\n")
      emitAccessSummary(access)
    }
  } else {
    process.stdout.write(
      `stash web runner listening on ${runtime.host} (api ${runtime.apiPort}, pwa ${runtime.pwaPort})\n`,
    )
    if (access.tailnet.pwaUrl) {
      process.stdout.write(`stash web runner tailnet pwa ${access.tailnet.pwaUrl}\n`)
    }
    if (access.warning) {
      process.stderr.write(`Warning: ${access.warning}\n`)
    }
  }

  await new Promise<void>((resolve) => {
    let stopping = false

    const stop = (): void => {
      if (stopping) {
        return
      }
      stopping = true
      web
        .close()
        .catch(() => {
          // Ignore shutdown errors during signal handling.
        })
        .finally(() => {
          process.off("SIGINT", stop)
          process.off("SIGTERM", stop)
          resolve()
        })
    }

    process.on("SIGINT", stop)
    process.on("SIGTERM", stop)
  })
}

const resolveWebRuntime = (
  options: WebCommandOptions,
  context: RunWebCommandContext,
  daemonMode: boolean,
): ResolvedWebRuntime => {
  const host =
    options.host?.trim() || context.envHost?.trim() || (daemonMode ? "0.0.0.0" : "127.0.0.1")
  const apiPort = options.apiPort ?? context.defaultApiPort
  const pwaPort = options.pwaPort ?? context.defaultPwaPort

  return {
    host,
    apiPort,
    pwaPort,
    dbPath: context.dbPath,
    migrationsDir: context.migrationsDir,
    webDistDir: context.webDistDir,
    audioDir: context.audioDir,
  }
}

const validateControlOptions = (options: WebCommandOptions): void => {
  const daemon = options.daemon === true
  const status = options.status === true
  const stop = options.stop === true
  const foreground = options.foreground === true
  const enabledControls = [daemon, status, stop, foreground].filter(Boolean).length

  if (enabledControls > 1) {
    throw new CliError(
      "Use only one of: --daemon, --status, --stop, --foreground.",
      "VALIDATION_ERROR",
      2,
    )
  }

  if (
    (status || stop) &&
    (options.host || options.apiPort !== undefined || options.pwaPort !== undefined)
  ) {
    throw new CliError(
      "--status/--stop cannot be combined with --host, --api-port, or --pwa-port.",
      "VALIDATION_ERROR",
      2,
    )
  }
}

const startWebDaemon = async (runtime: ResolvedWebRuntime, jsonMode: boolean): Promise<void> => {
  ensureDaemonDir()
  const existingStatus = readWebDaemonStatus()
  if (existingStatus.running) {
    emitDaemonStartResult(existingStatus, true, jsonMode)
    return
  }

  const paths = getDaemonPaths("write")
  const access = resolveWebAccessInfo(runtime.host, runtime.apiPort, runtime.pwaPort)
  const runId = randomUUID()
  const cliEntryPath = resolveCliEntryPath()
  const logFd = fs.openSync(paths.logFile, "a")
  const supervisor = spawn(
    process.execPath,
    [
      ...process.execArgv,
      cliEntryPath,
      ...buildInternalWebCommandArgs("web-supervisor", runtime, ["--run-id", runId]),
    ],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        STASH_WEB_DAEMON_DIR: paths.dir,
      },
      detached: true,
      stdio: ["ignore", logFd, logFd],
    },
  )
  fs.closeSync(logFd)

  if (!supervisor.pid) {
    throw new CliError("Failed to start web daemon supervisor.", "INTERNAL_ERROR", 1)
  }

  writeDaemonPid(supervisor.pid)

  const state = createDaemonState(runId, supervisor.pid, access)
  state.lastEvent = "Daemon supervisor spawned."
  persistDaemonState(state)

  supervisor.unref()

  emitDaemonStartResult(
    {
      running: true,
      pid: supervisor.pid,
      pidFile: paths.pidFile,
      logFile: paths.logFile,
      stateFile: paths.stateFile,
      state,
    },
    false,
    jsonMode,
  )
}

export const runWebSupervisorCommand = async (
  options: WebInternalCommandOptions,
): Promise<void> => {
  const runtime: ResolvedWebRuntime = {
    host: options.host,
    apiPort: options.apiPort,
    pwaPort: options.pwaPort,
    dbPath: options.dbPath,
    migrationsDir: options.migrationsDir,
    webDistDir: options.webDistDir,
    audioDir: options.audioDir,
  }
  const access = resolveWebAccessInfo(runtime.host, runtime.apiPort, runtime.pwaPort)
  const state = createDaemonState(options.runId ?? randomUUID(), process.pid, access)
  state.lastEvent = "Daemon supervisor booting."

  writeDaemonPid(process.pid)
  persistDaemonState(state)

  try {
    await runSupervisorLoop(runtime, state)
    state.status = "stopped"
    state.lastEvent = "Daemon supervisor stopped cleanly."
    persistDaemonState(state)
  } catch (error) {
    state.status = "crashed"
    state.lastEvent =
      error instanceof Error
        ? `Daemon supervisor crashed: ${error.message}`
        : "Daemon supervisor crashed."
    persistDaemonState(state)
    throw error
  } finally {
    removeDaemonPidFile()
  }
}

export const runWebRunnerCommand = async (
  options: WebInternalCommandOptions,
  loadStartWebStack: () => Promise<StartWebStackFn>,
): Promise<void> => {
  const runtime: ResolvedWebRuntime = {
    host: options.host,
    apiPort: options.apiPort,
    pwaPort: options.pwaPort,
    dbPath: options.dbPath,
    migrationsDir: options.migrationsDir,
    webDistDir: options.webDistDir,
    audioDir: options.audioDir,
  }
  const access = resolveWebAccessInfo(runtime.host, runtime.apiPort, runtime.pwaPort)
  await runWebStack({ runtime, access }, loadStartWebStack, "runner", false)
}

export const runWebCommand = async (
  options: WebCommandOptions,
  context: RunWebCommandContext,
): Promise<void> => {
  validateControlOptions(options)

  if (options.status) {
    const daemon = readWebDaemonStatus()
    if (context.json) {
      printJson(buildDaemonPayload(daemon))
      return
    }

    if (!daemon.running) {
      process.stdout.write("Web daemon is not running.\n")
      process.stdout.write(`State file: ${daemon.stateFile}\n`)
      process.stdout.write(`Log file: ${daemon.logFile}\n`)
      return
    }

    process.stdout.write(`Web daemon is running (pid ${String(daemon.pid)}).\n`)
    process.stdout.write(`State file: ${daemon.stateFile}\n`)
    process.stdout.write(`Log file: ${daemon.logFile}\n`)
    if (daemon.state?.access) {
      emitAccessSummary(daemon.state.access)
    }
    return
  }

  if (options.stop) {
    const result = await stopWebDaemon()
    if (context.json) {
      printJson({
        ok: true,
        command: "web",
        lifecycle: "daemon",
        daemon: {
          stop_requested: true,
          was_running: result.wasRunning,
          stopped: result.stopped,
          pid: result.pid,
          timed_out: result.timedOut ?? false,
          permission_denied: result.permissionDenied ?? false,
        },
      })
      return
    }

    if (!result.wasRunning) {
      process.stdout.write("Web daemon was not running.\n")
      return
    }

    if (result.stopped) {
      process.stdout.write(`Stopped web daemon (pid ${String(result.pid)}).\n`)
      return
    }

    if (result.permissionDenied) {
      process.stdout.write(
        `Permission denied while stopping web daemon (pid ${String(result.pid)}).\n`,
      )
      return
    }

    process.stdout.write(`Timed out while stopping web daemon (pid ${String(result.pid)}).\n`)
    return
  }

  const runtime = resolveWebRuntime(options, context, options.daemon === true)
  if (options.daemon) {
    await startWebDaemon(runtime, context.json)
    return
  }

  const access = resolveWebAccessInfo(runtime.host, runtime.apiPort, runtime.pwaPort)
  await runWebStack({ runtime, access }, context.loadStartWebStack, "foreground", context.json)
}

export const __testing__ = {
  resolveWebAccessInfo,
  readWebDaemonStatus,
  buildDaemonPaths,
  buildInternalWebCommandArgs,
  isLoopbackHost,
  resetDaemonPathsCache,
}
