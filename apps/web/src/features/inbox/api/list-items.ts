import { httpClient } from "../../../shared/api/http-client"
import type { StashItem } from "../../../shared/types"

export type InboxStatusFilter = "unread" | "read" | "all"
export type InboxTagModeFilter = "any" | "all"

export type ListInboxItemsInput = {
  status: InboxStatusFilter
  tags: string[]
  tagMode: InboxTagModeFilter
  limit: number
  offset: number
}

export type InboxResponse = {
  ok: true
  items: StashItem[]
  paging: {
    limit: number
    offset: number
    returned: number
  }
}

export async function listInboxItems(input: ListInboxItemsInput): Promise<InboxResponse> {
  const query = new URLSearchParams()
  const status = input.status === "all" ? "active" : input.status
  query.set("status", status)
  query.set("tagMode", input.tagMode)
  query.set("limit", String(input.limit))
  query.set("offset", String(input.offset))

  for (const tag of input.tags) {
    query.append("tag", tag)
  }

  return httpClient.get<InboxResponse>(`/api/items?${query.toString()}`)
}
