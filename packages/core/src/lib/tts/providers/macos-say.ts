import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import type { TtsProvider, TtsRequest, TtsResult, TtsFormat } from "../types.js"
import { TtsProviderError } from "../types.js"
import { resolveBinary, runCommand } from "../command.js"

function resolveSayCli(): string {
  const say = resolveBinary({
    envVar: "STASH_SAY_CLI",
    binaryNames: ["say"],
  })
  if (!say) {
    throw new TtsProviderError("macOS `say` command not found.", "TTS_PROVIDER_UNAVAILABLE")
  }
  return say
}

function resolveAfconvertCli(): string {
  const afconvert = resolveBinary({
    envVar: "STASH_AFCONVERT_CLI",
    binaryNames: ["afconvert"],
  })
  if (!afconvert) {
    throw new TtsProviderError("macOS `afconvert` command not found.", "TTS_PROVIDER_UNAVAILABLE")
  }
  return afconvert
}

function resolveFfmpegCli(): string | null {
  return resolveBinary({
    envVar: "STASH_FFMPEG_CLI",
    binaryNames: ["ffmpeg"],
  })
}

export const macOSSayProvider: TtsProvider = {
  name: "macos-say",

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    const { text, voice, format } = request

    const tempId = randomBytes(8).toString("hex")
    const tempAiffFile = join(tmpdir(), `stash-tts-output-${tempId}.aiff`)
    const tempWavFile = join(tmpdir(), `stash-tts-output-${tempId}.wav`)
    const tempMp3File = join(tmpdir(), `stash-tts-output-${tempId}.mp3`)

    try {
      const sayArgs: string[] = ["-o", tempAiffFile]
      if (voice && voice !== "default") sayArgs.push("-v", voice)

      const sayResult = await runCommand(resolveSayCli(), sayArgs, text)
      if (sayResult.code !== 0) {
        throw new TtsProviderError(
          `macOS say command failed: ${sayResult.stderr || sayResult.code}`,
          "TTS_PROVIDER_ERROR",
        )
      }

      let outputBuffer: Buffer
      let outputFormat: TtsFormat = "wav"
      const afconvertCli = resolveAfconvertCli()

      if (format === "wav") {
        const r = await runCommand(afconvertCli, [
          "-f",
          "WAVE",
          "-d",
          "LEI16",
          tempAiffFile,
          tempWavFile,
        ])
        if (r.code === 0) {
          outputBuffer = await fs.readFile(tempWavFile)
        } else {
          outputBuffer = await fs.readFile(tempAiffFile)
        }
      } else if (format === "mp3") {
        const ffmpegCli = resolveFfmpegCli()
        if (ffmpegCli) {
          const ff = await runCommand(ffmpegCli, [
            "-i",
            tempAiffFile,
            "-acodec",
            "libmp3lame",
            "-b:a",
            "128k",
            "-y",
            tempMp3File,
          ])
          if (ff.code === 0) {
            outputBuffer = await fs.readFile(tempMp3File)
            outputFormat = "mp3"
          } else {
            const r = await runCommand(afconvertCli, [
              "-f",
              "WAVE",
              "-d",
              "LEI16",
              tempAiffFile,
              tempWavFile,
            ])
            outputBuffer =
              r.code === 0 ? await fs.readFile(tempWavFile) : await fs.readFile(tempAiffFile)
          }
        } else {
          const r = await runCommand(afconvertCli, [
            "-f",
            "WAVE",
            "-d",
            "LEI16",
            tempAiffFile,
            tempWavFile,
          ])
          outputBuffer =
            r.code === 0 ? await fs.readFile(tempWavFile) : await fs.readFile(tempAiffFile)
        }
      } else {
        outputBuffer = await fs.readFile(tempAiffFile)
      }

      return {
        audio: outputBuffer,
        provider: "macos-say",
        voice: voice || "default",
        format: outputFormat,
      }
    } finally {
      await fs.unlink(tempAiffFile).catch(() => {})
      await fs.unlink(tempWavFile).catch(() => {})
      await fs.unlink(tempMp3File).catch(() => {})
    }
  },
}
