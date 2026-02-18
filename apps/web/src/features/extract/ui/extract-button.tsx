import type { JSX } from "react"
import { Button } from "@mui/material"

import { ExtractIcon } from "../../../shared/ui/icons"

type ExtractButtonProps = {
  itemId: number
  loading: boolean
  onExtract: (itemId: number, force?: boolean) => Promise<void>
}

export function ExtractButton({ itemId, loading, onExtract }: ExtractButtonProps): JSX.Element {
  return (
    <Button
      type="button"
      variant="outlined"
      startIcon={<ExtractIcon />}
      disabled={loading}
      onClick={() => void onExtract(itemId, true)}
    >
      {loading ? "Extracting..." : "Re-extract"}
    </Button>
  )
}
