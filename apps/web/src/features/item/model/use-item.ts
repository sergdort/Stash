import { useCallback, useEffect, useState } from "react"

import type { StashItem } from "../../../shared/types"
import { getItem } from "../api/get-item"

export function useItem(itemId: number | null): {
  loading: boolean
  item: StashItem | null
  error: string | null
  refresh: () => Promise<void>
} {
  const [loading, setLoading] = useState(false)
  const [item, setItem] = useState<StashItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (itemId === null) {
      setItem(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await getItem(itemId)
      setItem(response.item)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load item")
    } finally {
      setLoading(false)
    }
  }, [itemId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    loading,
    item,
    error,
    refresh,
  }
}
