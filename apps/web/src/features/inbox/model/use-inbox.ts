import { useCallback, useEffect, useRef, useState } from "react"

import type { StashItem } from "../../../shared/types"
import type { ListInboxItemsInput } from "../api/list-items"
import { listInboxItems } from "../api/list-items"

export function useInbox(filters: ListInboxItemsInput): {
  loading: boolean
  error: string | null
  items: StashItem[]
  refresh: () => Promise<void>
} {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<StashItem[]>([])
  const requestIdRef = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)
    setError(null)

    try {
      const response = await listInboxItems(filters)
      if (requestId !== requestIdRef.current) {
        return
      }
      setItems(response.items)
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return
      }
      const message = error instanceof Error ? error.message : "Failed to load inbox"
      setError(message)
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [filters])

  useEffect(() => {
    void refresh()
    return () => {
      requestIdRef.current += 1
    }
  }, [refresh])

  return {
    loading,
    error,
    items,
    refresh,
  }
}
