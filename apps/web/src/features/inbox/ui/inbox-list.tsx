import type { JSX } from "react"
import { Box, Chip, Stack, Typography } from "@mui/material"

import { formatDateTime } from "../../../shared/lib/date"
import type { StashItem } from "../../../shared/types"
import { TimeIcon } from "../../../shared/ui/icons"

type InboxListProps = {
  items: StashItem[]
  selectedItemId: number | null
  onSelect: (itemId: number) => void
  showCreatedAt?: boolean
}

export function InboxList({
  items,
  selectedItemId,
  onSelect,
  showCreatedAt = true,
}: InboxListProps): JSX.Element {
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
              bgcolor: selected ? "rgba(20, 184, 166, 0.11)" : "background.paper",
              borderRadius: 1,
              px: 1.5,
              py: 1.4,
              cursor: "pointer",
              transition: "background-color 180ms ease, border-color 180ms ease, transform 180ms ease",
              minHeight: 96,
              "&:hover": {
                bgcolor: selected ? "rgba(20, 184, 166, 0.17)" : "rgba(15, 23, 42, 0.03)",
                transform: "translateY(-1px)",
              },
              "&:focus-visible": {
                outline: "3px solid",
                outlineColor: "rgba(15, 118, 110, 0.35)",
                outlineOffset: 2,
              },
            }}
          >
            <Stack spacing={1}>
              <Typography variant="subtitle2" sx={{ lineHeight: 1.35 }}>
                {item.title ?? item.url}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {item.domain ?? item.url}
              </Typography>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
                <Chip size="small" variant="outlined" label={`#${item.id}`} />
                <Chip
                  size="small"
                  color={item.status === "read" ? "success" : "default"}
                  label={item.status}
                  variant={item.status === "read" ? "filled" : "outlined"}
                />
                {showCreatedAt ? (
                  <Chip
                    size="small"
                    icon={<TimeIcon fontSize="small" />}
                    label={formatDateTime(item.created_at)}
                    variant="outlined"
                  />
                ) : null}
              </Stack>
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
