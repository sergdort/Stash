import { httpClient } from "../../../shared/api/http-client"
import type { StashItem } from "../../../shared/types"

export type ItemResponse = {
  ok: true
  item: StashItem
}

export async function getItem(itemId: number): Promise<ItemResponse> {
  return httpClient.get<ItemResponse>(`/api/items/${itemId}`)
}
