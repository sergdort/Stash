import fs from "node:fs"
import { spawnSync } from "node:child_process"

import { resolveAutoTagConfig } from "./config.js"
import type { AutoTagDependencyCheck, AutoTagsDoctorReport } from "./types.js"

function truncateMessage(value: string): string {
  const normalized = value.trim().replaceAll(/\s+/g, " ")
  if (normalized.length <= 300) {
    return normalized
  }
  return `${normalized.slice(0, 300)}...`
}

function probeBinary(pathToBinary: string, args: string[]): {
  ok: boolean
  output: string
  message: string | null
} {
  const result = spawnSync(pathToBinary, args, { encoding: "utf-8" })
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()

  if (result.error) {
    return {
      ok: false,
      output,
      message: truncateMessage(result.error.message),
    }
  }

  const ok = result.status === 0
  return {
    ok,
    output,
    message: ok ? null : truncateMessage(output || `exit code ${String(result.status)}`),
  }
}

function buildPythonCheck(pathToBinary: string | null, required: boolean): AutoTagDependencyCheck {
  if (!pathToBinary) {
    return {
      id: "python",
      required,
      ok: false,
      path: null,
      message: "Python not found in PATH and STASH_AUTO_TAGS_PYTHON is not set.",
    }
  }

  const probe = probeBinary(pathToBinary, ["--version"])
  return {
    id: "python",
    required,
    ok: probe.ok,
    path: pathToBinary,
    message: probe.message,
  }
}

function buildHelperCheck(helperPath: string, required: boolean): AutoTagDependencyCheck {
  if (!fs.existsSync(helperPath)) {
    return {
      id: "helper_script",
      required,
      ok: false,
      path: helperPath,
      message: "Auto-tags helper script not found.",
    }
  }

  return {
    id: "helper_script",
    required,
    ok: true,
    path: helperPath,
    message: null,
  }
}

function buildImportCheck(
  pythonBin: string | null,
  required: boolean,
): AutoTagDependencyCheck {
  if (!pythonBin) {
    return {
      id: "sentence_transformers",
      required,
      ok: false,
      path: null,
      message: "Python is unavailable.",
    }
  }

  const probe = probeBinary(pythonBin, [
    "-c",
    "import sentence_transformers; import numpy; import torch; print('ok')",
  ])

  return {
    id: "sentence_transformers",
    required,
    ok: probe.ok,
    path: pythonBin,
    message: probe.message,
  }
}

function buildHelperRuntimeCheck(options: {
  pythonBin: string | null
  helperPath: string
  model: string
  required: boolean
}): AutoTagDependencyCheck {
  if (!options.pythonBin) {
    return {
      id: "helper_runtime",
      required: options.required,
      ok: false,
      path: null,
      message: "Python is unavailable.",
    }
  }

  if (!fs.existsSync(options.helperPath)) {
    return {
      id: "helper_runtime",
      required: options.required,
      ok: false,
      path: options.helperPath,
      message: "Auto-tags helper script not found.",
    }
  }

  const payload = JSON.stringify({
    model: options.model,
    text: "health check",
    candidates: [
      {
        tag: "health",
        descriptor: "health check",
      },
    ],
  })
  const probe = spawnSync(options.pythonBin, [options.helperPath], {
    input: payload,
    encoding: "utf-8",
  })

  if (probe.error) {
    return {
      id: "helper_runtime",
      required: options.required,
      ok: false,
      path: options.helperPath,
      message: truncateMessage(probe.error.message),
    }
  }

  if (probe.status !== 0) {
    const output = `${probe.stdout ?? ""}\n${probe.stderr ?? ""}`
    return {
      id: "helper_runtime",
      required: options.required,
      ok: false,
      path: options.helperPath,
      message: truncateMessage(output || `exit code ${String(probe.status)}`),
    }
  }

  return {
    id: "helper_runtime",
    required: options.required,
    ok: true,
    path: options.helperPath,
    message: null,
  }
}

export function inspectAutoTagsHealth(): AutoTagsDoctorReport {
  const config = resolveAutoTagConfig()
  const required = config.backend === "python"

  const checks: AutoTagDependencyCheck[] = [
    buildPythonCheck(config.pythonBin, required),
    buildHelperCheck(config.helperPath, required),
    buildImportCheck(config.pythonBin, required),
    buildHelperRuntimeCheck({
      pythonBin: config.pythonBin,
      helperPath: config.helperPath,
      model: config.model,
      required,
    }),
  ]

  const healthy = checks.every((check) => !check.required || check.ok)

  return {
    backend: config.backend,
    healthy,
    model: config.model,
    helper_path: config.helperPath,
    python_path: config.pythonBin,
    checks,
  }
}
