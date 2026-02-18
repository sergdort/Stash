import { useCallback, useEffect, useState } from "react"

import { listTags } from "../api/tags-api"

export function useTags(): {
  tags: Array<{ name: string; item_count: number }>
  refresh: () => Promise<void>
} {
  const [tags, setTags] = useState<Array<{ name: string; item_count: number }>>([])

  const refresh = useCallback(async (): Promise<void> => {
    const response = await listTags()
    setTags(response.tags)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { tags, refresh }
}
