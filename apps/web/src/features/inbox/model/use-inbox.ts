import { useCallback, useEffect, useState } from "react"

import type { StashItem } from "../../../shared/types"
import { listInboxItems } from "../api/list-items"

export function useInbox(): {
  loading: boolean
  error: string | null
  items: StashItem[]
  refresh: () => Promise<void>
} {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<StashItem[]>([])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await listInboxItems()
      setItems(response.items)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load inbox"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    loading,
    error,
    items,
    refresh,
  }
}
