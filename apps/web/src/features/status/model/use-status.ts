import { useState } from "react"

import { setStatus } from "../api/set-status"

export function useStatus(): {
  loading: boolean
  updateStatus: (itemId: number, status: "read" | "unread") => Promise<void>
} {
  const [loading, setLoading] = useState(false)

  const updateStatus = async (itemId: number, status: "read" | "unread"): Promise<void> => {
    setLoading(true)
    try {
      await setStatus(itemId, status)
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    updateStatus,
  }
}
