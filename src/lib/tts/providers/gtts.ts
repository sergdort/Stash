import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import type { TtsProvider, TtsRequest, TtsResult, TtsFormat } from "../types.js"
import { TtsProviderError } from "../types.js"
import { resolveBinary, runCommand } from "../command.js"

function resolveGttsCli(): string {
  const home = process.env.HOME || ""
  const cli = resolveBinary({
    envVar: "STASH_GTTS_CLI",
    binaryNames: ["gtts-cli"],
    fallbackPaths: [
      `${home}/Library/Python/3.14/bin/gtts-cli`,
      `${home}/Library/Python/3.13/bin/gtts-cli`,
      `${home}/Library/Python/3.12/bin/gtts-cli`,
      `${home}/Library/Python/3.11/bin/gtts-cli`,
      `${home}/.local/bin/gtts-cli`,
    ],
  })

  if (!cli) {
    throw new TtsProviderError(
      "gTTS CLI not found. Install with `pip install --user gtts`, ensure gtts-cli is in PATH, or set STASH_GTTS_CLI=/full/path/to/gtts-cli.",
      "TTS_NOT_INSTALLED"
    )
  }

  return cli
}

function resolveFfmpegCli(): string | null {
  return resolveBinary({
    envVar: "STASH_FFMPEG_CLI",
    binaryNames: ["ffmpeg"],
  })
}

export const gTtsProvider: TtsProvider = {
  name: "gtts",

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    const { text, voice, format } = request

    const tempId = randomBytes(8).toString("hex")
    const tempMp3File = join(tmpdir(), `stash-tts-output-${tempId}.mp3`)
    const tempWavFile = join(tmpdir(), `stash-tts-output-${tempId}.wav`)
    const tempTextFile = join(tmpdir(), `stash-tts-input-${tempId}.txt`)

    try {
      const voiceParts = (voice || "en").split("|")
      const lang = voiceParts[0] || "en"
      const slow = voiceParts[1] === "slow"

      await fs.writeFile(tempTextFile, text, "utf-8")

      const args: string[] = ["-f", tempTextFile, "-l", lang, "-o", tempMp3File]
      if (slow) args.push("--slow")

      const gttsCli = resolveGttsCli()
      const gttsResult = await runCommand(gttsCli, args)
      if (gttsResult.code !== 0) {
        throw new TtsProviderError(
          `gTTS synthesis failed: ${gttsResult.stderr || `exit code ${gttsResult.code}`}`,
          "TTS_SYNTHESIS_ERROR"
        )
      }

      let outputBuffer = await fs.readFile(tempMp3File)
      let outputFormat: TtsFormat = "mp3"

      if (format === "wav") {
        const ffmpegCli = resolveFfmpegCli()
        if (ffmpegCli) {
          const ffmpegResult = await runCommand(ffmpegCli, [
            "-i",
            tempMp3File,
            "-acodec",
            "pcm_s16le",
            "-ac",
            "2",
            "-ar",
            "44100",
            "-y",
            tempWavFile,
          ])

          if (ffmpegResult.code === 0) {
            outputBuffer = await fs.readFile(tempWavFile)
            outputFormat = "wav"
            await fs.unlink(tempWavFile).catch(() => {})
          }
        }
      }

      return {
        audio: outputBuffer,
        provider: "gtts",
        voice: `${lang}${slow ? "|slow" : ""}`,
        format: outputFormat,
      }
    } finally {
      await fs.unlink(tempTextFile).catch(() => {})
      await fs.unlink(tempMp3File).catch(() => {})
      await fs.unlink(tempWavFile).catch(() => {})
    }
  },
}
