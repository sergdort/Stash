import { httpClient } from "../../../shared/api/http-client"

import type { TtsJob } from "./generate-tts"

export type ListItemTtsJobsResponse = {
  ok: true
  jobs: TtsJob[]
  paging: {
    limit: number
    offset: number
    returned: number
  }
}

export async function listItemTtsJobs(
  itemId: number,
  limit = 10,
  offset = 0,
): Promise<ListItemTtsJobsResponse> {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  return httpClient.get<ListItemTtsJobsResponse>(
    `/api/items/${itemId}/tts-jobs?${query.toString()}`,
  )
}
