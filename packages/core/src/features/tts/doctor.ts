import { spawnSync } from "node:child_process"

import { resolveBinary } from "../../lib/tts/command.js"

type ProbeResult = {
  ok: boolean
  exitCode: number | null
  output: string
  message: string | null
}

export type TtsDependencyCheckId = "coqui_cli" | "espeak" | "ffmpeg"

export type TtsDependencyCheck = {
  id: TtsDependencyCheckId
  required: boolean
  ok: boolean
  path: string | null
  message: string | null
}

export type CoquiCliFeatures = {
  supports_text_file: boolean
  supports_progress_bar: boolean
}

export type TtsDoctorReport = {
  provider: "coqui"
  healthy: boolean
  checks: TtsDependencyCheck[]
  coqui_cli_features: CoquiCliFeatures
  invocation_strategy: "text_file_then_fallback_text"
}

function truncateMessage(value: string): string {
  const normalized = value.trim().replaceAll(/\s+/g, " ")
  if (normalized.length <= 300) {
    return normalized
  }
  return `${normalized.slice(0, 300)}...`
}

function probeBinary(pathToBinary: string, args: string[]): ProbeResult {
  const result = spawnSync(pathToBinary, args, {
    encoding: "utf-8",
  })

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()
  if (result.error) {
    return {
      ok: false,
      exitCode: null,
      output,
      message: truncateMessage(result.error.message),
    }
  }

  const exitCode = typeof result.status === "number" ? result.status : null
  const ok = exitCode === 0
  const message = ok ? null : truncateMessage(output || `exit code ${String(exitCode)}`)

  return {
    ok,
    exitCode,
    output,
    message,
  }
}

function resolveCoquiCliPath(): string | null {
  const home = process.env.HOME || ""
  return resolveBinary({
    envVar: "STASH_COQUI_TTS_CLI",
    binaryNames: ["tts"],
    fallbackPaths: [
      "/usr/local/Caskroom/miniconda/base/envs/coqui/bin/tts",
      `${home}/.local/bin/tts`,
    ],
  })
}

function resolveEspeakCliPath(): string | null {
  return resolveBinary({
    envVar: "STASH_ESPEAK_CLI",
    binaryNames: ["espeak-ng", "espeak"],
  })
}

function resolveFfmpegCliPath(): string | null {
  return resolveBinary({
    envVar: "STASH_FFMPEG_CLI",
    binaryNames: ["ffmpeg"],
  })
}

function buildCheck(
  id: TtsDependencyCheckId,
  required: boolean,
  pathToBinary: string | null,
  probeArgs: string[],
): { check: TtsDependencyCheck; probe: ProbeResult | null } {
  if (!pathToBinary) {
    return {
      check: {
        id,
        required,
        ok: false,
        path: null,
        message: "Not found in PATH and no override env var is set.",
      },
      probe: null,
    }
  }

  const probe = probeBinary(pathToBinary, probeArgs)
  return {
    check: {
      id,
      required,
      ok: probe.ok,
      path: pathToBinary,
      message: probe.message,
    },
    probe,
  }
}

export function inspectCoquiTtsHealth(): TtsDoctorReport {
  const coqui = buildCheck("coqui_cli", true, resolveCoquiCliPath(), ["--help"])
  const espeak = buildCheck("espeak", true, resolveEspeakCliPath(), ["--version"])
  const ffmpeg = buildCheck("ffmpeg", false, resolveFfmpegCliPath(), ["-version"])

  const coquiHelpOutput = coqui.probe?.output ?? ""
  const coquiCliFeatures: CoquiCliFeatures = {
    supports_text_file: coquiHelpOutput.includes("--text_file"),
    supports_progress_bar: coquiHelpOutput.includes("--progress_bar"),
  }

  const checks = [coqui.check, espeak.check, ffmpeg.check]
  const healthy = checks.every((check) => !check.required || check.ok)

  return {
    provider: "coqui",
    healthy,
    checks,
    coqui_cli_features: coquiCliFeatures,
    invocation_strategy: "text_file_then_fallback_text",
  }
}
