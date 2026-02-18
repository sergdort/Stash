import { useState } from "react"

import { generateTts } from "../api/generate-tts"

export function useTts(): {
  loading: boolean
  downloadUrl: string | null
  runTts: (itemId: number) => Promise<void>
} {
  const [loading, setLoading] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const runTts = async (itemId: number): Promise<void> => {
    setLoading(true)
    try {
      const response = await generateTts(itemId)
      setDownloadUrl(response.download_url)
    } finally {
      setLoading(false)
    }
  }

  return {
    loading,
    downloadUrl,
    runTts,
  }
}
