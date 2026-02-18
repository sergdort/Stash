import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import type { TtsProvider, TtsRequest, TtsResult, TtsFormat } from "../types.js"
import { TtsProviderError } from "../types.js"
import { resolveBinary, runCommand } from "../command.js"

function resolveCoquiCli(): string {
  const home = process.env.HOME || ""
  const cli = resolveBinary({
    envVar: "STASH_COQUI_TTS_CLI",
    binaryNames: ["tts"],
    fallbackPaths: [
      "/usr/local/Caskroom/miniconda/base/envs/coqui/bin/tts",
      `${home}/.local/bin/tts`,
    ],
  })

  if (!cli) {
    throw new TtsProviderError(
      "Coqui TTS CLI not found. Install Coqui TTS and ensure `tts` is in PATH, or set STASH_COQUI_TTS_CLI=/full/path/to/tts.",
      "TTS_PROVIDER_UNAVAILABLE"
    )
  }

  return cli
}

function ensureEspeakAvailable(): void {
  const espeak = resolveBinary({
    envVar: "STASH_ESPEAK_CLI",
    binaryNames: ["espeak-ng", "espeak"],
  })

  if (!espeak) {
    throw new TtsProviderError(
      "espeak backend is missing. Install with `brew install espeak-ng`, or set STASH_ESPEAK_CLI to your espeak binary.",
      "TTS_PROVIDER_UNAVAILABLE"
    )
  }
}

function resolveFfmpegCli(): string | null {
  return resolveBinary({
    envVar: "STASH_FFMPEG_CLI",
    binaryNames: ["ffmpeg"],
  })
}

export const coquiTtsProvider: TtsProvider = {
  name: "coqui",

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    const { text, voice, format } = request

    const tempId = randomBytes(8).toString("hex")
    const tempTextFile = join(tmpdir(), `stash-tts-input-${tempId}.txt`)
    const tempAudioFile = join(tmpdir(), `stash-tts-output-${tempId}.wav`)
    const tempMp3File = join(tmpdir(), `stash-tts-output-${tempId}.mp3`)

    try {
      await fs.writeFile(tempTextFile, text, "utf-8")

      const voiceParts = voice.split("|")
      const modelName = voiceParts[0] || voice
      const speakerIdx = voiceParts[1]

      const args: string[] = [
        "--model_name",
        modelName,
        "--text_file",
        tempTextFile,
        "--out_path",
        tempAudioFile,
        "--progress_bar",
        "false",
      ]

      if (speakerIdx) args.push("--speaker_idx", speakerIdx)

      ensureEspeakAvailable()
      const ttsCli = resolveCoquiCli()
      const ttsResult = await runCommand(ttsCli, args)

      if (ttsResult.code !== 0) {
        if (ttsResult.stderr.includes("No espeak backend")) {
          throw new TtsProviderError(
            "Coqui needs espeak backend. Install with `brew install espeak-ng`.",
            "TTS_PROVIDER_UNAVAILABLE"
          )
        }

        throw new TtsProviderError(
          `Coqui TTS failed: ${ttsResult.stderr.slice(0, 300) || `exit code ${ttsResult.code}`}`,
          "TTS_PROVIDER_ERROR"
        )
      }

      let outputBuffer = await fs.readFile(tempAudioFile)
      let outputFormat: TtsFormat = "wav"

      if (format === "mp3") {
        const ffmpegCli = resolveFfmpegCli()
        if (ffmpegCli) {
          const ffmpegResult = await runCommand(ffmpegCli, [
            "-i",
            tempAudioFile,
            "-acodec",
            "libmp3lame",
            "-b:a",
            "128k",
            "-y",
            tempMp3File,
          ])

          if (ffmpegResult.code === 0) {
            outputBuffer = await fs.readFile(tempMp3File)
            outputFormat = "mp3"
          }
        }
      }

      return {
        audio: outputBuffer,
        provider: "coqui",
        voice,
        format: outputFormat,
      }
    } finally {
      await fs.unlink(tempTextFile).catch(() => {})
      await fs.unlink(tempAudioFile).catch(() => {})
      await fs.unlink(tempMp3File).catch(() => {})
    }
  },
}
