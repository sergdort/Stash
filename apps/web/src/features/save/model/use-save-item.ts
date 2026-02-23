import { useState } from "react"

import type { SavePayload } from "../api/save-item"
import { saveItem } from "../api/save-item"

export function useSaveItem(): {
  saving: boolean
  error: string | null
  save: (payload: SavePayload) => Promise<void>
} {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (payload: SavePayload): Promise<void> => {
    setSaving(true)
    setError(null)

    try {
      await saveItem(payload)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save item")
      throw error
    } finally {
      setSaving(false)
    }
  }

  return {
    saving,
    error,
    save,
  }
}
