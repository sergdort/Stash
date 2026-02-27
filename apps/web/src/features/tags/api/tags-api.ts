import { httpClient } from "../../../shared/api/http-client"

export type TagsResponse = {
  ok: true
  tags: Array<{ name: string; item_count: number }>
}

export async function addTag(itemId: number, tag: string): Promise<{ ok: true; added: boolean }> {
  return httpClient.post<{ ok: true; added: boolean }>(`/api/items/${itemId}/tags`, { tag })
}

export async function removeTag(
  itemId: number,
  tag: string,
): Promise<{ ok: true; removed: boolean }> {
  return httpClient.delete<{ ok: true; removed: boolean }>(
    `/api/items/${itemId}/tags/${encodeURIComponent(tag)}`,
  )
}

export async function listTags(): Promise<TagsResponse> {
  return httpClient.get<TagsResponse>("/api/tags?limit=100")
}
