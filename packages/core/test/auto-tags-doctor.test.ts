import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { inspectAutoTagsHealth } from "../src/features/auto-tags/doctor.js"

const previousBackend = process.env.STASH_AUTO_TAGS_BACKEND
const previousPython = process.env.STASH_AUTO_TAGS_PYTHON
const previousHelper = process.env.STASH_AUTO_TAGS_HELPER
const previousImportFail = process.env.STASH_AUTO_TAGS_TEST_IMPORT_FAIL
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
  if (previousBackend === undefined) {
    delete process.env.STASH_AUTO_TAGS_BACKEND
  } else {
    process.env.STASH_AUTO_TAGS_BACKEND = previousBackend
  }
  if (previousPython === undefined) {
    delete process.env.STASH_AUTO_TAGS_PYTHON
  } else {
    process.env.STASH_AUTO_TAGS_PYTHON = previousPython
  }
  if (previousHelper === undefined) {
    delete process.env.STASH_AUTO_TAGS_HELPER
  } else {
    process.env.STASH_AUTO_TAGS_HELPER = previousHelper
  }
  if (previousImportFail === undefined) {
    delete process.env.STASH_AUTO_TAGS_TEST_IMPORT_FAIL
  } else {
    process.env.STASH_AUTO_TAGS_TEST_IMPORT_FAIL = previousImportFail
  }

  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe("inspectAutoTagsHealth", () => {
  it("reports healthy when python/helper/import checks pass", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "stash-auto-tags-doctor-"))
    tempDirs.push(tempDir)

    const helperPath = path.join(tempDir, "helper.py")
    await writeFile(helperPath, "print('helper')\n", "utf-8")

    const pythonPath = await writeExecutable(
      tempDir,
      "fake-python.sh",
      `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Python 3.11.0"
  exit 0
fi
if [ "$1" = "-c" ]; then
  if [ "\${STASH_AUTO_TAGS_TEST_IMPORT_FAIL:-0}" = "1" ]; then
    echo "ImportError" >&2
    exit 1
  fi
  exit 0
fi
echo '{"ok":true,"scores":[{"tag":"health","score":0.9}]}' 
exit 0
`,
    )

    process.env.STASH_AUTO_TAGS_BACKEND = "python"
    process.env.STASH_AUTO_TAGS_PYTHON = pythonPath
    process.env.STASH_AUTO_TAGS_HELPER = helperPath

    const report = inspectAutoTagsHealth()

    expect(report.backend).toBe("python")
    expect(report.healthy).toBe(true)
    expect(report.checks.find((check) => check.id === "python")?.ok).toBe(true)
    expect(report.checks.find((check) => check.id === "sentence_transformers")?.ok).toBe(true)
    expect(report.checks.find((check) => check.id === "helper_runtime")?.ok).toBe(true)
  })

  it("reports unhealthy when import check fails", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "stash-auto-tags-doctor-"))
    tempDirs.push(tempDir)

    const helperPath = path.join(tempDir, "helper.py")
    await writeFile(helperPath, "print('helper')\n", "utf-8")

    const pythonPath = await writeExecutable(
      tempDir,
      "fake-python.sh",
      `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Python 3.11.0"
  exit 0
fi
if [ "$1" = "-c" ]; then
  if [ "\${STASH_AUTO_TAGS_TEST_IMPORT_FAIL:-0}" = "1" ]; then
    echo "ImportError: sentence_transformers missing" >&2
    exit 1
  fi
  exit 0
fi
echo '{"ok":true,"scores":[{"tag":"health","score":0.9}]}' 
exit 0
`,
    )

    process.env.STASH_AUTO_TAGS_BACKEND = "python"
    process.env.STASH_AUTO_TAGS_PYTHON = pythonPath
    process.env.STASH_AUTO_TAGS_HELPER = helperPath
    process.env.STASH_AUTO_TAGS_TEST_IMPORT_FAIL = "1"

    const report = inspectAutoTagsHealth()

    expect(report.healthy).toBe(false)
    expect(report.checks.find((check) => check.id === "sentence_transformers")?.ok).toBe(false)
  })
})
