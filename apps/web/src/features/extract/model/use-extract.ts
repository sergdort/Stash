import { useState } from "react"

import { extractItem } from "../api/extract-item"

export function useExtract(): {
  loading: boolean
  runExtract: (itemId: number, force?: boolean) => Promise<void>
} {
  const [loading, setLoading] = useState(false)

  const runExtract = async (itemId: number, force = false): Promise<void> => {
    setLoading(true)
    try {
      await extractItem(itemId, force)
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    runExtract,
  }
}
