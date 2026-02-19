import { httpClient } from "../../../shared/api/http-client"

export type TtsJob = {
  id: number
  item_id: number
  status: "queued" | "running" | "succeeded" | "failed"
  voice: string
  format: "mp3" | "wav"
  error_code: string | null
  error_message: string | null
  output_file_name: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  updated_at: string
}

export type EnqueueTtsResponse = {
  ok: true
  created: boolean
  job: TtsJob
  poll_interval_ms: number
  poll_url: string
}

export async function generateTts(itemId: number): Promise<EnqueueTtsResponse> {
  return httpClient.post<EnqueueTtsResponse>(`/api/items/${itemId}/tts`, {
    format: "mp3",
  })
}
