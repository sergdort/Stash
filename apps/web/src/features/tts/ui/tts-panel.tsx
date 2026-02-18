import { Button } from "../../../shared/ui/button"

type TtsPanelProps = {
  itemId: number
  loading: boolean
  downloadUrl: string | null
  onGenerate: (itemId: number) => Promise<void>
}

export function TtsPanel({ itemId, loading, downloadUrl, onGenerate }: TtsPanelProps): JSX.Element {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Button type="button" disabled={loading} onClick={() => void onGenerate(itemId)}>
        {loading ? "Generating audio..." : "Generate TTS"}
      </Button>
      {downloadUrl ? (
        <a href={downloadUrl} target="_blank" rel="noreferrer">
          Download
        </a>
      ) : null}
    </div>
  )
}
