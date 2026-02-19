import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { coquiTtsProvider } from "../src/lib/tts/providers/coqui.js"

const previousMockBase64 = process.env.STASH_TTS_MOCK_BASE64
const previousCoquiCli = process.env.STASH_COQUI_TTS_CLI
const previousEspeakCli = process.env.STASH_ESPEAK_CLI
const tempDirs: string[] = []

afterEach(async () => {
  if (previousMockBase64 === undefined) {
    delete process.env.STASH_TTS_MOCK_BASE64
  } else {
    process.env.STASH_TTS_MOCK_BASE64 = previousMockBase64
  }

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

  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe("coqui provider mock hook", () => {
  it("returns decoded audio and metadata when STASH_TTS_MOCK_BASE64 is set", async () => {
    const expectedAudio = Buffer.from("coqui-mock-audio", "utf8")
    process.env.STASH_TTS_MOCK_BASE64 = expectedAudio.toString("base64")

    const result = await coquiTtsProvider.synthesize({
      text: "hello",
      voice: "tts_models/en/vctk/vits|p241",
      format: "mp3",
    })

    expect(result.provider).toBe("coqui")
    expect(result.voice).toBe("tts_models/en/vctk/vits|p241")
    expect(result.format).toBe("mp3")
    expect(result.audio.equals(expectedAudio)).toBe(true)
  })

  it("throws TTS_PROVIDER_ERROR for invalid STASH_TTS_MOCK_BASE64", async () => {
    process.env.STASH_TTS_MOCK_BASE64 = "%%%not-base64%%%"

    await expect(
      coquiTtsProvider.synthesize({
        text: "hello",
        voice: "tts_models/en/vctk/vits|p241",
        format: "wav",
      }),
    ).rejects.toMatchObject({
      code: "TTS_PROVIDER_ERROR",
    })
  })

  it("retries with --text when cli rejects --text_file", async () => {
    delete process.env.STASH_TTS_MOCK_BASE64
    process.env.STASH_ESPEAK_CLI = "/bin/sh"

    const tempDir = await mkdtemp(path.join(tmpdir(), "stash-coqui-provider-"))
    tempDirs.push(tempDir)
    const fakeCliPath = path.join(tempDir, "fake-tts.sh")
    await writeFile(
      fakeCliPath,
      `#!/bin/sh
set -eu
out_path=""
text=""
expect_next=""
for arg in "$@"; do
  if [ "$expect_next" = "out_path" ]; then
    out_path="$arg"
    expect_next=""
    continue
  fi
  if [ "$expect_next" = "text" ]; then
    text="$arg"
    expect_next=""
    continue
  fi
  case "$arg" in
    --text_file)
      echo "error: unrecognized arguments: --text_file" >&2
      exit 2
      ;;
    --out_path)
      expect_next="out_path"
      ;;
    --text)
      expect_next="text"
      ;;
  esac
done
if [ -z "$out_path" ]; then
  echo "missing --out_path" >&2
  exit 2
fi
printf "audio:%s" "$text" > "$out_path"
`,
      "utf-8",
    )
    await chmod(fakeCliPath, 0o755)
    process.env.STASH_COQUI_TTS_CLI = fakeCliPath

    const result = await coquiTtsProvider.synthesize({
      text: "hello fallback",
      voice: "tts_models/en/vctk/vits|p241",
      format: "wav",
    })

    expect(result.provider).toBe("coqui")
    expect(result.format).toBe("wav")
    expect(result.audio.toString("utf8")).toBe("audio:hello fallback")
  })
})
