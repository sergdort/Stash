import { type JSX, useEffect, useState } from "react"
import { Alert, Button, Chip, Link, Stack, Typography } from "@mui/material"

import type { ItemTtsAudio } from "../../../shared/types"
import type { TtsJob } from "../api/generate-tts"
import { AudioIcon, DownloadIcon } from "../../../shared/ui/icons"

type TtsPanelProps = {
  itemId: number
  loading: boolean
  error: string | null
  job: TtsJob | null
  hasExtractedContent: boolean
  ttsAudio: ItemTtsAudio | null
  onGenerate: (itemId: number) => Promise<void>
}

export function TtsPanel({
  itemId,
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

  useEffect(() => {
    setAudioError(null)
  }, [playbackUrl])

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
        <audio
          key={ttsAudio.file_name}
          controls
          preload="none"
          src={playbackUrl}
          style={{ width: "100%" }}
          onError={() => setAudioError("Saved audio file is unavailable. Generate TTS again.")}
        >
          Your browser does not support audio playback.
        </audio>
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
