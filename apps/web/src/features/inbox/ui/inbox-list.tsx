import type { JSX } from "react"
import { Box, Stack, Typography } from "@mui/material"

import type { StashItem } from "../../../shared/types"

type InboxListProps = {
  items: StashItem[]
  selectedItemId: number | null
  onSelect: (itemId: number) => void
}

export function InboxList({ items, selectedItemId, onSelect }: InboxListProps): JSX.Element {
  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No items found.
      </Typography>
    )
  }

  return (
    <Stack spacing={1} sx={{ maxHeight: 520, overflowY: "auto", pr: 0.5 }}>
      {items.map((item) => {
        const selected = selectedItemId === item.id
        return (
          <Box
            key={item.id}
            component="button"
            type="button"
            onClick={() => onSelect(item.id)}
            sx={{
              width: "100%",
              textAlign: "left",
              border: "1px solid",
              borderColor: selected ? "primary.main" : "divider",
              bgcolor: selected ? "primary.50" : "background.paper",
              borderRadius: 1.5,
              px: 1.5,
              py: 1.25,
              cursor: "pointer",
              transition: "all 120ms ease",
              "&:hover": {
                bgcolor: selected ? "primary.100" : "action.hover",
              },
            }}
          >
            <Typography variant="subtitle2" noWrap>
              {item.title ?? item.url}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {item.domain ?? item.url}
            </Typography>
            <Typography variant="caption" color="text.disabled" display="block">
              #{item.id}
            </Typography>
          </Box>
        )
      })}
    </Stack>
  )
}
