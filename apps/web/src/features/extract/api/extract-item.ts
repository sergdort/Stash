import { httpClient } from "../../../shared/api/http-client"

export async function extractItem(itemId: number, force = false): Promise<void> {
  await httpClient.post<{ ok: true }>(`/api/items/${itemId}/extract`, { force })
}
