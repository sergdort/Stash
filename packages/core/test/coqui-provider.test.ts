import { afterEach, describe, expect, it } from "vitest"

import { coquiTtsProvider } from "../src/lib/tts/providers/coqui.js"

const previousMockBase64 = process.env.STASH_TTS_MOCK_BASE64

afterEach(() => {
  if (previousMockBase64 === undefined) {
    delete process.env.STASH_TTS_MOCK_BASE64
    return
  }
  process.env.STASH_TTS_MOCK_BASE64 = previousMockBase64
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
})
