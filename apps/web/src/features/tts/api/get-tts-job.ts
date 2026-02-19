import { httpClient } from "../../../shared/api/http-client"

import type { TtsJob } from "./generate-tts"

export type GetTtsJobResponse = {
  ok: true
  job: TtsJob
}

export async function getTtsJob(jobId: number): Promise<GetTtsJobResponse> {
  return httpClient.get<GetTtsJobResponse>(`/api/tts-jobs/${jobId}`)
}
