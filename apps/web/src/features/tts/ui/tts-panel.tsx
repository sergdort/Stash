import { type JSX, useEffect, useMemo, useRef, useState } from "react"
import { Alert, Box, Button, Chip, IconButton, Link, Slider, Stack, Typography } from "@mui/material"

import type { ItemTtsAudio } from "../../../shared/types"
import type { TtsJob } from "../api/generate-tts"
import { AudioIcon, DownloadIcon, PauseIcon, PlayIcon } from "../../../shared/ui/icons"

type TtsPanelProps = {
  itemId: number
  title?: string | null
  loading: boolean
  error: string | null
  job: TtsJob | null
  hasExtractedContent: boolean
  ttsAudio: ItemTtsAudio | null
  onGenerate: (itemId: number) => Promise<void>
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function TtsPanel({
  itemId,
  title,
  loading,
  error,
  job,
  hasExtractedContent,
  ttsAudio,
  onGenerate,
}: TtsPanelProps): JSX.Element {
  const [audioError, setAudioError] = useState<string | null>(null)
  const playbackUrl = ttsAudio ? `/api/audio/${encodeURIComponent(ttsAudio.file_name)}` : null
  const downloadUrl = ttsAudio ? `${playbackUrl}?download=1` : null
  const isActiveJob = job?.status === "queued" || job?.status === "running"

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    setAudioError(null)
    setIsPlaying(false)
    setDuration(0)
    setCurrentTime(0)
  }, [playbackUrl])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoadedMetadata = (): void => {
      setDuration(audio.duration || 0)
    }
    const onTimeUpdate = (): void => {
      setCurrentTime(audio.currentTime || 0)
    }
    const onEnded = (): void => {
      setIsPlaying(false)
      setCurrentTime(audio.duration || 0)
    }
    const onError = (): void => {
      setAudioError("Saved audio file is unavailable. Generate TTS again.")
      setIsPlaying(false)
    }

    audio.addEventListener("loadedmetadata", onLoadedMetadata)
    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("error", onError)

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata)
      audio.removeEventListener("timeupdate", onTimeUpdate)
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("error", onError)
    }
  }, [playbackUrl])

  const progress = useMemo(() => {
    if (!duration) return 0
    return Math.min(100, (currentTime / duration) * 100)
  }, [currentTime, duration])

  useEffect(() => {
    const mediaSession = navigator.mediaSession
    const audio = audioRef.current

    if (!mediaSession || !audio || !playbackUrl || typeof MediaMetadata === "undefined") {
      return
    }

    mediaSession.metadata = new MediaMetadata({
      title: title?.trim() || "stash audio",
      artist: "stash",
      album: "Read later",
      artwork: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    })

    mediaSession.setActionHandler("play", () => {
      void audio.play()
      setIsPlaying(true)
    })
    mediaSession.setActionHandler("pause", () => {
      audio.pause()
      setIsPlaying(false)
    })
    mediaSession.setActionHandler("seekbackward", () => {
      audio.currentTime = Math.max(0, audio.currentTime - 10)
    })
    mediaSession.setActionHandler("seekforward", () => {
      audio.currentTime = Math.min(audio.duration || Number.MAX_SAFE_INTEGER, audio.currentTime + 10)
    })

    return () => {
      mediaSession.setActionHandler("play", null)
      mediaSession.setActionHandler("pause", null)
      mediaSession.setActionHandler("seekbackward", null)
      mediaSession.setActionHandler("seekforward", null)
    }
  }, [playbackUrl, title])

  const togglePlayback = async (): Promise<void> => {
    const audio = audioRef.current
    if (!audio) return

    try {
      if (audio.paused) {
        await audio.play()
        setIsPlaying(true)
      } else {
        audio.pause()
        setIsPlaying(false)
      }
    } catch {
      setAudioError("Playback was blocked. Tap play again.")
      setIsPlaying(false)
    }
  }

  const seek = (_: Event, value: number | number[]): void => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const target = Array.isArray(value) ? value[0] : value
    audio.currentTime = (target / 100) * duration
    setCurrentTime(audio.currentTime)
  }

  return (
    <Stack spacing={1.25}>
      <Typography variant="subtitle2">Audio</Typography>
      {!hasExtractedContent ? (
        <Typography variant="body2" color="text.secondary">
          Extract content first to enable TTS.
        </Typography>
      ) : null}
      {error ? (
        <Alert severity="error" variant="outlined">
          {error}
        </Alert>
      ) : null}
      {job?.status === "failed" ? (
        <Alert severity="warning" variant="outlined">
          {job.error_message ?? "TTS job failed."}
        </Alert>
      ) : null}
      {audioError ? (
        <Alert severity="warning" variant="outlined">
          {audioError}
        </Alert>
      ) : null}
      {job ? (
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
          <Chip size="small" variant="outlined" label={`Job #${job.id}`} />
          <Chip
            size="small"
            color={
              job.status === "succeeded"
                ? "success"
                : job.status === "failed"
                  ? "warning"
                  : "default"
            }
            label={
              job.status === "queued"
                ? "Queued"
                : job.status === "running"
                  ? "Generating"
                  : job.status === "failed"
                    ? "Failed"
                    : "Ready"
            }
          />
        </Stack>
      ) : null}

      {playbackUrl ? (
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            p: 1.25,
            bgcolor: "rgba(15,23,42,0.03)",
          }}
        >
          <audio ref={audioRef} preload="metadata" src={playbackUrl} />
          <Stack spacing={0.75}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <IconButton
                aria-label={isPlaying ? "Pause audio" : "Play audio"}
                onClick={() => void togglePlayback()}
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: "999px",
                  border: "1px solid",
                  borderColor: "primary.main",
                  color: "primary.main",
                  bgcolor: "rgba(20, 184, 166, 0.08)",
                }}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </IconButton>
              <Typography variant="caption" color="text.secondary">
                {formatTime(currentTime)} / {formatTime(duration)}
              </Typography>
            </Stack>
            <Slider
              size="small"
              value={progress}
              min={0}
              max={100}
              step={0.1}
              onChange={seek}
              aria-label="Audio progress"
            />
          </Stack>
        </Box>
      ) : null}

      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
        <Button
          type="button"
          variant="contained"
          color="secondary"
          startIcon={<AudioIcon />}
          disabled={loading || !hasExtractedContent || isActiveJob}
          onClick={() => void onGenerate(itemId)}
        >
          {loading ? "Generating audio..." : "Generate TTS"}
        </Button>
        {downloadUrl ? (
          <Link
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            underline="hover"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
          >
            <DownloadIcon sx={{ fontSize: 16 }} />
            Download
          </Link>
        ) : null}
      </Stack>
    </Stack>
  )
}
