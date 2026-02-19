import { useCallback, useEffect, useState } from "react"

import { generateTts, type TtsJob } from "../api/generate-tts"
import { getTtsJob } from "../api/get-tts-job"
import { listItemTtsJobs } from "../api/list-item-tts-jobs"

export function useTts(): {
  loading: boolean
  error: string | null
  job: TtsJob | null
  runTts: (itemId: number) => Promise<void>
  refreshLatestJob: (itemId: number) => Promise<void>
} {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<TtsJob | null>(null)
  const [pollIntervalMs, setPollIntervalMs] = useState(1500)

  const refreshLatestJob = useCallback(async (itemId: number): Promise<void> => {
    try {
      const response = await listItemTtsJobs(itemId, 1, 0)
      const latest = response.jobs[0] ?? null
      setJob(latest)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load TTS jobs")
    }
  }, [])

  const runTts = async (itemId: number): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const response = await generateTts(itemId)
      setJob(response.job)
      setPollIntervalMs(response.poll_interval_ms)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to generate TTS audio")
      throw error
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) {
      return
    }

    const timer = setInterval(() => {
      void (async () => {
        try {
          const response = await getTtsJob(job.id)
          setJob(response.job)
        } catch (error) {
          setError(error instanceof Error ? error.message : "Failed to poll TTS job status")
        }
      })()
    }, pollIntervalMs)

    return () => {
      clearInterval(timer)
    }
  }, [job, pollIntervalMs])

  return {
    loading,
    error,
    job,
    runTts,
    refreshLatestJob,
  }
}
