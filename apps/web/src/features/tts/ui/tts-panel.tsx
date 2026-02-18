import type { JSX } from "react"
import { Button, Link, Stack, Typography } from "@mui/material"

import { AudioIcon, DownloadIcon } from "../../../shared/ui/icons"

type TtsPanelProps = {
  itemId: number
  loading: boolean
  downloadUrl: string | null
  onGenerate: (itemId: number) => Promise<void>
}

export function TtsPanel({ itemId, loading, downloadUrl, onGenerate }: TtsPanelProps): JSX.Element {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Audio</Typography>
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
        <Button
          type="button"
          variant="contained"
          color="secondary"
          startIcon={<AudioIcon />}
          disabled={loading}
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
