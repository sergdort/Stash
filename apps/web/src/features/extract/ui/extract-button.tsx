import type { JSX } from "react"
import { Button } from "@mui/material"

type ExtractButtonProps = {
  itemId: number
  loading: boolean
  onExtract: (itemId: number, force?: boolean) => Promise<void>
}

export function ExtractButton({ itemId, loading, onExtract }: ExtractButtonProps): JSX.Element {
  return (
    <Button type="button" variant="outlined" disabled={loading} onClick={() => void onExtract(itemId, true)}>
      {loading ? "Extracting..." : "Re-extract"}
    </Button>
  )
}
