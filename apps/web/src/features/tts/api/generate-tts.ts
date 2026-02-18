import { httpClient } from "../../../shared/api/http-client"

export type TtsResponse = {
  ok: true
  output_path: string
  file_name: string
  download_url: string
}

export async function generateTts(itemId: number): Promise<TtsResponse> {
  return httpClient.post<TtsResponse>(`/api/items/${itemId}/tts`, {
    format: "mp3",
  })
}
