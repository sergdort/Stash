import { spawn } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import type { TtsProvider, TtsRequest, TtsResult, TtsFormat } from "../types.js"
import { TtsProviderError } from "../types.js"

/**
 * macOS `say` command provider
 * Built-in, no installation required
 */
export const macOSSayProvider: TtsProvider = {
  name: "macos-say",

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    const { text, voice, format } = request
    
    // Create temp files
    const tempId = randomBytes(8).toString("hex")
    const tempAiffFile = join(tmpdir(), `stash-tts-output-${tempId}.aiff`)
    const tempWavFile = join(tmpdir(), `stash-tts-output-${tempId}.wav`)
    const tempMp3File = join(tmpdir(), `stash-tts-output-${tempId}.mp3`)
    
    try {
      // Use say command to generate AIFF
      const sayArgs: string[] = ["-o", tempAiffFile]
      
      // Add voice if specified (e.g., "Alex", "Samantha", "Daniel")
      if (voice && voice !== "default") {
        sayArgs.push("-v", voice)
      }
      
      // Run say command
      const say = spawn("say", sayArgs)
      
      // Write text to stdin
      say.stdin.write(text)
      say.stdin.end()
      
      // Wait for completion
      const exitCode = await new Promise<number>((resolve) => {
        say.on("close", (code: number | null) => resolve(code ?? -1))
      })
      
      if (exitCode !== 0) {
        throw new TtsProviderError(
          `macOS say command failed with exit code ${exitCode}`,
          "TTS_PROVIDER_ERROR"
        )
      }
      
      // Convert AIFF to requested format
      let outputBuffer: Buffer
      let outputFormat: TtsFormat = "wav"
      
      if (format === "wav") {
        // Convert AIFF to WAV using afconvert
        const afconvert = spawn("afconvert", [
          "-f", "WAVE",
          "-d", "LEI16",
          tempAiffFile,
          tempWavFile
        ])
        
        const afconvertCode = await new Promise<number>((resolve) => {
          afconvert.on("close", (code: number | null) => resolve(code ?? -1))
        })
        
        if (afconvertCode === 0) {
          outputBuffer = await fs.readFile(tempWavFile)
          await fs.unlink(tempWavFile).catch(() => {})
        } else {
          // Fallback: return AIFF if conversion fails
          outputBuffer = await fs.readFile(tempAiffFile)
        }
      } else if (format === "mp3") {
        // Try to convert to MP3 using ffmpeg
        try {
          const ffmpeg = spawn("ffmpeg", [
            "-i", tempAiffFile,
            "-acodec", "libmp3lame",
            "-b:a", "128k",
            "-y", tempMp3File
          ])
          
          const ffmpegCode = await new Promise<number>((resolve) => {
            ffmpeg.on("close", (code: number | null) => resolve(code ?? -1))
          })
          
          if (ffmpegCode === 0) {
            outputBuffer = await fs.readFile(tempMp3File)
            outputFormat = "mp3"
            await fs.unlink(tempMp3File).catch(() => {})
          } else {
            // Fallback to WAV
            const afconvert = spawn("afconvert", [
              "-f", "WAVE",
              "-d", "LEI16",
              tempAiffFile,
              tempWavFile
            ])
            
            const afconvertCode = await new Promise<number>((resolve) => {
              afconvert.on("close", (code: number | null) => resolve(code ?? -1))
            })
            
            if (afconvertCode === 0) {
              outputBuffer = await fs.readFile(tempWavFile)
              await fs.unlink(tempWavFile).catch(() => {})
            } else {
              outputBuffer = await fs.readFile(tempAiffFile)
            }
          }
        } catch {
          // No ffmpeg, return WAV
          outputBuffer = await fs.readFile(tempAiffFile)
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
      // Cleanup temp files
      await fs.unlink(tempAiffFile).catch(() => {})
      await fs.unlink(tempWavFile).catch(() => {})
      await fs.unlink(tempMp3File).catch(() => {})
    }
  },
}