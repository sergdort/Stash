import type { JSX } from "react"
import { Button, Link, Stack } from "@mui/material"

type TtsPanelProps = {
  itemId: number
  loading: boolean
  downloadUrl: string | null
  onGenerate: (itemId: number) => Promise<void>
}

export function TtsPanel({ itemId, loading, downloadUrl, onGenerate }: TtsPanelProps): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
      <Button type="button" variant="contained" disabled={loading} onClick={() => void onGenerate(itemId)}>
        {loading ? "Generating audio..." : "Generate TTS"}
      </Button>
      {downloadUrl ? (
        <Link href={downloadUrl} target="_blank" rel="noreferrer" underline="hover">
          Download
        </Link>
      ) : null}
    </Stack>
  )
}
