export type TtsFormat = "mp3" | "wav"

export type TtsProviderName = "edge" | "coqui" | "macos-say" | "gtts"

export interface TtsRequest {
  text: string
  voice: string
  format: TtsFormat
}

export interface TtsResult {
  audio: Buffer
  provider: TtsProviderName
  voice: string
  format: TtsFormat
}

export interface TtsProvider {
  name: TtsProviderName
  synthesize(request: TtsRequest): Promise<TtsResult>
}

export type TtsProviderErrorCode = "TTS_PROVIDER_UNAVAILABLE" | "TTS_PROVIDER_ERROR" | "TTS_NOT_INSTALLED" | "TTS_SYNTHESIS_ERROR"

export class TtsProviderError extends Error {
  code: TtsProviderErrorCode

  constructor(message: string, code: TtsProviderErrorCode) {
    super(message)
    this.code = code
  }
}
