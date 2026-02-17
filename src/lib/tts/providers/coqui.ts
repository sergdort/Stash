import { spawn } from "node:child_process"
import type { Buffer } from "node:buffer"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import type { TtsProvider, TtsRequest, TtsResult, TtsFormat } from "../types.js"
import { TtsProviderError } from "../types.js"

/**
 * Coqui TTS provider using the Python TTS CLI
 * Requires: pip install TTS
 */
export const coquiTtsProvider: TtsProvider = {
  name: "coqui",

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    const { text, voice, format } = request
    
    // Create temp files
    const tempId = randomBytes(8).toString("hex")
    const tempTextFile = join(tmpdir(), `stash-tts-input-${tempId}.txt`)
    const tempAudioFile = join(tmpdir(), `stash-tts-output-${tempId}.wav`)
    
    try {
      // Write text to temp file to avoid shell escaping issues
      await fs.writeFile(tempTextFile, text, "utf-8")
      
      // Parse voice format: "model_name|speaker_idx" or just "model_name"
      const voiceParts = voice.split("|")
      const modelName = voiceParts[0] || voice
      const speakerIdx = voiceParts[1]
      
      // Build command args
      const args: string[] = [
        "--model_name", modelName,
        "--text_file", tempTextFile,
        "--out_path", tempAudioFile,
        "--progress_bar", "false"
      ]
      
      // Add speaker if multi-speaker model
      if (speakerIdx) {
        args.push("--speaker_idx", speakerIdx)
      }
      
      // Run TTS
      const tts = spawn("tts", args)
      
      // Collect stderr for error messages
      let stderr = ""
      tts.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      
      // Wait for process to complete
      const exitCode = await new Promise<number>((resolve) => {
        tts.on("close", (code: number | null) => resolve(code ?? -1))
      })
      
      if (exitCode !== 0) {
        // Check if TTS is not installed
        if (stderr.includes("command not found") || stderr.includes("No such file")) {
          throw new TtsProviderError(
            "Coqui TTS is not installed. Run: pip install TTS",
            "TTS_PROVIDER_UNAVAILABLE"
          )
        }
        
        // Check if model needs to be downloaded
        if (stderr.includes("Model not found") || stderr.includes("downloading")) {
          throw new TtsProviderError(
            `Model ${modelName} not found. It may need to be downloaded first.`,
            "TTS_PROVIDER_UNAVAILABLE"
          )
        }
        
        throw new TtsProviderError(
          `TTS failed with exit code ${exitCode}: ${stderr.slice(0, 200)}`,
          "TTS_PROVIDER_ERROR"
        )
      }
      
      // Read the generated audio
      const audioBuffer = await fs.readFile(tempAudioFile)
      
      // Convert to MP3 if requested (using ffmpeg)
      let outputBuffer = audioBuffer
      let outputFormat: TtsFormat = "wav"
      
      if (format === "mp3") {
        try {
          const tempMp3File = join(tmpdir(), `stash-tts-output-${tempId}.mp3`)
          
          const ffmpeg = spawn("ffmpeg", [
            "-i", tempAudioFile,
            "-acodec", "libmp3lame",
            "-b:a", "128k",
            "-y", tempMp3File
          ])
          
          const ffmpegExitCode = await new Promise<number>((resolve) => {
            ffmpeg.on("close", (code: number | null) => resolve(code ?? -1))
          })
          
          if (ffmpegExitCode === 0) {
            outputBuffer = await fs.readFile(tempMp3File)
            outputFormat = "mp3"
            await fs.unlink(tempMp3File).catch(() => {})
          }
          // If ffmpeg fails, return WAV
        } catch {
          // If ffmpeg not available, return WAV
        }
      }
      
      return {
        audio: outputBuffer,
        provider: "coqui",
        voice,
        format: outputFormat,
      }
    } finally {
      // Cleanup temp files
      await fs.unlink(tempTextFile).catch(() => {})
      await fs.unlink(tempAudioFile).catch(() => {})
    }
  },
}