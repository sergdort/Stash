import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { inspectCoquiTtsHealth } from "../src/features/tts/doctor.js"

const previousCoquiCli = process.env.STASH_COQUI_TTS_CLI
const previousEspeakCli = process.env.STASH_ESPEAK_CLI
const previousFfmpegCli = process.env.STASH_FFMPEG_CLI
const tempDirs: string[] = []

async function writeExecutable(
  tempDir: string,
  fileName: string,
  content: string,
): Promise<string> {
  const filePath = path.join(tempDir, fileName)
  await writeFile(filePath, content, "utf-8")
  await chmod(filePath, 0o755)
  return filePath
}

afterEach(async () => {
  if (previousCoquiCli === undefined) {
    delete process.env.STASH_COQUI_TTS_CLI
  } else {
    process.env.STASH_COQUI_TTS_CLI = previousCoquiCli
  }

  if (previousEspeakCli === undefined) {
    delete process.env.STASH_ESPEAK_CLI
  } else {
    process.env.STASH_ESPEAK_CLI = previousEspeakCli
  }

  if (previousFfmpegCli === undefined) {
    delete process.env.STASH_FFMPEG_CLI
  } else {
    process.env.STASH_FFMPEG_CLI = previousFfmpegCli
  }

  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe("inspectCoquiTtsHealth", () => {
  it("reports healthy when required binaries are available", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "stash-tts-doctor-"))
    tempDirs.push(tempDir)

    const coquiPath = await writeExecutable(
      tempDir,
      "fake-tts.sh",
      `#!/bin/sh
if [ "$1" = "--help" ]; then
  echo "usage: tts [--text_file TEXT_FILE] [--progress_bar PROGRESS_BAR]"
  exit 0
fi
exit 0
`,
    )
    const espeakPath = await writeExecutable(
      tempDir,
      "fake-espeak.sh",
      `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "espeak-ng 1.0"
  exit 0
fi
exit 0
`,
    )

    process.env.STASH_COQUI_TTS_CLI = coquiPath
    process.env.STASH_ESPEAK_CLI = espeakPath
    delete process.env.STASH_FFMPEG_CLI

    const report = inspectCoquiTtsHealth()

    expect(report.healthy).toBe(true)
    expect(report.provider).toBe("coqui")
    expect(report.invocation_strategy).toBe("text_file_then_fallback_text")
    expect(report.coqui_cli_features.supports_text_file).toBe(true)
    expect(report.coqui_cli_features.supports_progress_bar).toBe(true)
    expect(report.checks.find((check) => check.id === "coqui_cli")?.ok).toBe(true)
    expect(report.checks.find((check) => check.id === "espeak")?.ok).toBe(true)
    expect(report.checks.find((check) => check.id === "ffmpeg")?.required).toBe(false)
  })

  it("reports unhealthy when espeak is unavailable", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "stash-tts-doctor-"))
    tempDirs.push(tempDir)

    const coquiPath = await writeExecutable(
      tempDir,
      "fake-tts.sh",
      `#!/bin/sh
if [ "$1" = "--help" ]; then
  echo "usage: tts [--text TEXT] [--progress_bar PROGRESS_BAR]"
  exit 0
fi
exit 0
`,
    )

    process.env.STASH_COQUI_TTS_CLI = coquiPath
    process.env.STASH_ESPEAK_CLI = path.join(tempDir, "missing-espeak")

    const report = inspectCoquiTtsHealth()

    expect(report.healthy).toBe(false)
    expect(report.coqui_cli_features.supports_text_file).toBe(false)
    expect(report.coqui_cli_features.supports_progress_bar).toBe(true)
    expect(report.checks.find((check) => check.id === "coqui_cli")?.ok).toBe(true)
    expect(report.checks.find((check) => check.id === "espeak")?.ok).toBe(false)
  })
})
