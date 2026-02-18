import { httpClient } from "../../../shared/api/http-client"

export async function setStatus(itemId: number, status: "read" | "unread"): Promise<void> {
  await httpClient.patch<{ ok: true }>(`/api/items/${itemId}/status`, { status })
}
