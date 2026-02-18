import { httpClient } from "../../../shared/api/http-client"
import type { StashItem } from "../../../shared/types"

export type SavePayload = {
  url: string
  title?: string
  tags?: string[]
  extract?: boolean
}

export type SaveResponse = {
  ok: true
  created: boolean
  item: StashItem
}

export async function saveItem(payload: SavePayload): Promise<SaveResponse> {
  return httpClient.post<SaveResponse>("/api/items", payload)
}
