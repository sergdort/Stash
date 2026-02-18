import type { JSX } from "react"
import { Button } from "@mui/material"

import type { ItemStatus } from "../../../shared/types"
import { StatusIcon } from "../../../shared/ui/icons"

type StatusToggleProps = {
  itemId: number
  status: ItemStatus
  loading: boolean
  onToggle: (itemId: number, status: "read" | "unread") => Promise<void>
}

export function StatusToggle({ itemId, status, loading, onToggle }: StatusToggleProps): JSX.Element {
  const nextStatus = status === "read" ? "unread" : "read"

  return (
    <Button
      type="button"
      variant="contained"
      color={nextStatus === "read" ? "primary" : "secondary"}
      startIcon={<StatusIcon />}
      disabled={loading}
      onClick={() => void onToggle(itemId, nextStatus)}
    >
      Mark as {nextStatus}
    </Button>
  )
}
