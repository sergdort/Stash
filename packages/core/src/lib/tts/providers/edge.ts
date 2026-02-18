import {
  TtsProviderError,
  type TtsFormat,
  type TtsProvider,
  type TtsRequest,
  type TtsResult,
} from "../types.js"

const EDGE_SYNTH_URL =
  "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1"
// Public client token used by Edge Read Aloud requests (not a secret API key).
// Microsoft can rotate/remove this value, which would require updating the provider.
const EDGE_TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
const EDGE_MAX_CHUNK_CHARS = 2_500
const EDGE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36"

type WavParts = {
  fmtChunk: Buffer
  dataChunk: Buffer
}

function escapeXml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function voiceLanguage(voice: string): string {
  const parts = voice.split("-")
  if (parts.length >= 2) {
    return `${parts[0]}-${parts[1]}`
  }
  return "en-US"
}

function outputFormat(format: TtsFormat): string {
  return format === "wav" ? "riff-24khz-16bit-mono-pcm" : "audio-24khz-48kbitrate-mono-mp3"
}

function splitText(input: string, maxChars: number): string[] {
  const normalized = input.replaceAll(/\s+/g, " ").trim()
  if (normalized.length === 0) {
    return []
  }
  if (normalized.length <= maxChars) {
    return [normalized]
  }

  const chunks: string[] = []
  let current = ""
  const sentences = normalized.split(/(?<=[.!?])\s+/)

  for (const sentence of sentences) {
    const next = current.length === 0 ? sentence : `${current} ${sentence}`
    if (next.length <= maxChars) {
      current = next
      continue
    }

    if (current.length > 0) {
      chunks.push(current)
      current = ""
    }

    if (sentence.length <= maxChars) {
      current = sentence
      continue
    }

    let offset = 0
    while (offset < sentence.length) {
      const part = sentence.slice(offset, offset + maxChars)
      chunks.push(part)
      offset += maxChars
    }
  }

  if (current.length > 0) {
    chunks.push(current)
  }

  return chunks
}

function readChunk(
  buffer: Buffer,
  offset: number,
): { id: string; size: number; dataOffset: number } {
  const id = buffer.toString("ascii", offset, offset + 4)
  const size = buffer.readUInt32LE(offset + 4)
  return { id, size, dataOffset: offset + 8 }
}

function parseWav(buffer: Buffer): WavParts {
  if (buffer.length < 44) {
    throw new TtsProviderError("Edge returned invalid WAV payload.", "TTS_PROVIDER_ERROR")
  }
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new TtsProviderError("Edge returned non-WAV data for WAV output.", "TTS_PROVIDER_ERROR")
  }

  let offset = 12
  let fmtChunk: Buffer | null = null
  let dataChunk: Buffer | null = null

  while (offset + 8 <= buffer.length) {
    const chunk = readChunk(buffer, offset)
    const end = chunk.dataOffset + chunk.size
    if (end > buffer.length) {
      break
    }

    if (chunk.id === "fmt ") {
      fmtChunk = buffer.subarray(chunk.dataOffset, end)
    } else if (chunk.id === "data") {
      dataChunk = buffer.subarray(chunk.dataOffset, end)
    }

    offset = end + (chunk.size % 2)
  }

  if (!fmtChunk || !dataChunk) {
    throw new TtsProviderError("Edge WAV payload is missing required chunks.", "TTS_PROVIDER_ERROR")
  }

  return {
    fmtChunk,
    dataChunk,
  }
}

function createWav(fmtChunk: Buffer, dataChunk: Buffer): Buffer {
  const fmtPadding = fmtChunk.length % 2
  const dataPadding = dataChunk.length % 2
  const totalSize = 4 + (8 + fmtChunk.length + fmtPadding) + (8 + dataChunk.length + dataPadding)
  const output = Buffer.alloc(8 + totalSize)

  output.write("RIFF", 0)
  output.writeUInt32LE(totalSize, 4)
  output.write("WAVE", 8)

  let offset = 12
  output.write("fmt ", offset)
  offset += 4
  output.writeUInt32LE(fmtChunk.length, offset)
  offset += 4
  fmtChunk.copy(output, offset)
  offset += fmtChunk.length + fmtPadding

  output.write("data", offset)
  offset += 4
  output.writeUInt32LE(dataChunk.length, offset)
  offset += 4
  dataChunk.copy(output, offset)

  return output
}

function mergeWavChunks(chunks: Buffer[]): Buffer {
  if (chunks.length === 1) {
    return chunks[0] as Buffer
  }

  const first = parseWav(chunks[0] as Buffer)
  const dataChunks: Buffer[] = [first.dataChunk]

  for (const chunk of chunks.slice(1)) {
    const parsed = parseWav(chunk)
    if (!parsed.fmtChunk.equals(first.fmtChunk)) {
      throw new TtsProviderError("Edge returned incompatible WAV chunks.", "TTS_PROVIDER_ERROR")
    }
    dataChunks.push(parsed.dataChunk)
  }

  return createWav(first.fmtChunk, Buffer.concat(dataChunks))
}

function combineChunks(chunks: Buffer[], format: TtsFormat): Buffer {
  if (chunks.length === 0) {
    throw new TtsProviderError("Edge returned an empty audio response.", "TTS_PROVIDER_ERROR")
  }
  if (format === "wav") {
    return mergeWavChunks(chunks)
  }
  return Buffer.concat(chunks)
}

async function synthesizeChunk(text: string, voice: string, format: TtsFormat): Promise<Buffer> {
  const url = `${EDGE_SYNTH_URL}?TrustedClientToken=${EDGE_TRUSTED_CLIENT_TOKEN}`
  const lang = voiceLanguage(voice)
  const ssml = `<speak version="1.0" xml:lang="${escapeXml(lang)}"><voice name="${escapeXml(voice)}"><prosody rate="0%" pitch="0%">${escapeXml(text)}</prosody></voice></speak>`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": outputFormat(format),
      "User-Agent": EDGE_USER_AGENT,
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      Referer: "https://edge.microsoft.com/",
    },
    body: ssml,
  })

  if (!response.ok) {
    const responseText = await response.text().catch(() => "")
    throw new TtsProviderError(
      `Edge TTS request failed (${response.status}). ${responseText.slice(0, 200)}`.trim(),
      "TTS_PROVIDER_UNAVAILABLE",
    )
  }

  const audioArrayBuffer = await response.arrayBuffer()
  const audio = Buffer.from(audioArrayBuffer)

  if (audio.length === 0) {
    throw new TtsProviderError("Edge returned an empty audio response.", "TTS_PROVIDER_ERROR")
  }

  return audio
}

function mockAudioBuffer(): Buffer | null {
  const base64 = process.env.STASH_TTS_EDGE_MOCK_BASE64
  if (!base64) {
    return null
  }

  try {
    return Buffer.from(base64, "base64")
  } catch {
    throw new TtsProviderError("Invalid STASH_TTS_EDGE_MOCK_BASE64 value.", "TTS_PROVIDER_ERROR")
  }
}

export function createEdgeTtsProvider(): TtsProvider {
  return {
    name: "edge",
    async synthesize(request: TtsRequest): Promise<TtsResult> {
      const mocked = mockAudioBuffer()
      if (mocked) {
        return {
          audio: mocked,
          provider: "edge",
          voice: request.voice,
          format: request.format,
        }
      }

      try {
        const chunks = splitText(request.text, EDGE_MAX_CHUNK_CHARS)
        if (chunks.length === 0) {
          throw new TtsProviderError("No text to synthesize.", "TTS_PROVIDER_ERROR")
        }

        const audioChunks: Buffer[] = []
        for (const chunk of chunks) {
          const audioChunk = await synthesizeChunk(chunk, request.voice, request.format)
          audioChunks.push(audioChunk)
        }

        return {
          audio: combineChunks(audioChunks, request.format),
          provider: "edge",
          voice: request.voice,
          format: request.format,
        }
      } catch (error) {
        if (error instanceof TtsProviderError) {
          throw error
        }

        const message = error instanceof Error ? error.message : "Unknown provider error"
        throw new TtsProviderError(`Edge TTS failed: ${message}`, "TTS_PROVIDER_UNAVAILABLE")
      }
    },
  }
}
