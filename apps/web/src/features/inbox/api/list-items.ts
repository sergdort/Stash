import { httpClient } from "../../../shared/api/http-client"
import type { StashItem } from "../../../shared/types"

export type InboxResponse = {
  ok: true
  items: StashItem[]
  paging: {
    limit: number
    offset: number
    returned: number
  }
}

export async function listInboxItems(): Promise<InboxResponse> {
  return httpClient.get<InboxResponse>("/api/items?status=unread&limit=50&offset=0")
}
