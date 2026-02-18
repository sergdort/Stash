import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { buildFriendlyFilename, ensureUniqueFilePath, slugify } from "../src/lib/tts/files.js"

describe("tts file helpers", () => {
  it("slugifies to lowercase ascii with dash separators", () => {
    const slug = slugify("  AI Agents: Résumé + Scale!  ", 80)
    expect(slug).toBe("ai-agents-resume-scale")
  })

  it("builds a friendly filename with required tokens", () => {
    const fileName = buildFriendlyFilename({
      itemId: 42,
      title: "AI Agents at Scale",
      voice: "en-US-AriaNeural",
      format: "mp3",
      now: new Date("2026-02-17T15:30:45Z"),
    })

    expect(
      fileName.startsWith("2026-02-17_ai-agents-at-scale_id-42_en-us-aria-neural_153045_"),
    ).toBe(true)
    expect(fileName.endsWith(".mp3")).toBe(true)
  })

  it("uses untitled fallback when title is empty", () => {
    const fileName = buildFriendlyFilename({
      itemId: 7,
      title: null,
      voice: "en-US-AriaNeural",
      format: "wav",
      now: new Date("2026-02-17T15:30:45Z"),
    })

    expect(fileName.includes("_untitled-item-7_")).toBe(true)
    expect(fileName.endsWith(".wav")).toBe(true)
  })

  it("adds numeric suffix when target path already exists", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-tts-files-"))
    try {
      const first = path.join(tempDir, "sample.mp3")
      fs.writeFileSync(first, "one")

      const second = ensureUniqueFilePath(first)
      expect(second).toBe(path.join(tempDir, "sample_2.mp3"))

      fs.writeFileSync(second, "two")
      const third = ensureUniqueFilePath(first)
      expect(third).toBe(path.join(tempDir, "sample_3.mp3"))
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
