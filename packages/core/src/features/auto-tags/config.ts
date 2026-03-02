import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import type { AutoTagBackend, AutoTagConfig } from "./types.js"

const DEFAULT_MAX_TAGS = 3
const DEFAULT_MIN_SCORE = 0.62
const DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false
  }
  return fallback
}

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseScoreEnv(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  if (parsed < 0 || parsed > 1) {
    return fallback
  }
  return parsed
}

function resolveModuleCandidate(relativePath: string): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const srcCandidate = path.resolve(moduleDir, `../../../../../${relativePath}`)
  const distCandidate = path.resolve(moduleDir, `../../../../../../${relativePath}`)
  return fs.existsSync(srcCandidate) ? srcCandidate : distCandidate
}

function resolveDefaultSeedTagsPath(): string {
  const cwdCandidate = path.resolve(process.cwd(), "config/seed-tags.json")
  if (fs.existsSync(cwdCandidate)) {
    return cwdCandidate
  }
  return resolveModuleCandidate("config/seed-tags.json")
}

function resolveDefaultHelperPath(): string {
  const cwdCandidate = path.resolve(process.cwd(), "scripts/auto-tags-embed.py")
  if (fs.existsSync(cwdCandidate)) {
    return cwdCandidate
  }
  return resolveModuleCandidate("scripts/auto-tags-embed.py")
}

function resolveDefaultPythonBin(): string | null {
  const fromEnv = process.env.STASH_AUTO_TAGS_PYTHON?.trim()
  if (fromEnv) {
    return fromEnv
  }

  const candidates = ["python3", "python"]
  for (const candidate of candidates) {
    const lookup = spawnSync("sh", ["-lc", `command -v ${candidate}`], { encoding: "utf-8" })
    const found = lookup.stdout?.trim()
    if (found) {
      return found
    }
  }

  return null
}

function parseBackend(value: string | undefined): AutoTagBackend {
  const normalized = value?.trim().toLowerCase()
  if (normalized === "rule") {
    return "rule"
  }
  return "python"
}

export function resolveAutoTagConfig(): AutoTagConfig {
  const helperPath = process.env.STASH_AUTO_TAGS_HELPER?.trim() || resolveDefaultHelperPath()
  const seedTagsPath = resolveDefaultSeedTagsPath()

  return {
    enabled: parseBooleanEnv(process.env.STASH_AUTO_TAGS_ENABLED, false),
    maxTags: parsePositiveIntEnv(process.env.STASH_AUTO_TAGS_MAX, DEFAULT_MAX_TAGS),
    minScore: parseScoreEnv(process.env.STASH_AUTO_TAGS_MIN_SCORE, DEFAULT_MIN_SCORE),
    model: process.env.STASH_AUTO_TAGS_MODEL?.trim() || DEFAULT_MODEL,
    backend: parseBackend(process.env.STASH_AUTO_TAGS_BACKEND),
    pythonBin: resolveDefaultPythonBin(),
    helperPath,
    seedTagsPath,
  }
}

export function resolveAutoTagsRequested(explicit: boolean | undefined): boolean {
  if (explicit !== undefined) {
    return explicit
  }
  return resolveAutoTagConfig().enabled
}
