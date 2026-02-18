import type { JSX } from "react"
import {
  Box,
  Button,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material"

import type { InboxStatusFilter, InboxTagModeFilter } from "../api/list-items"
import { StatusIcon, TagIcon } from "../../../shared/ui/icons"

type TagOption = {
  name: string
  item_count: number
}

type InboxFiltersProps = {
  status: InboxStatusFilter
  onStatusChange: (status: InboxStatusFilter) => void
  tagMode: InboxTagModeFilter
  onTagModeChange: (mode: InboxTagModeFilter) => void
  availableTags: TagOption[]
  selectedTags: string[]
  onSelectedTagsChange: (tags: string[]) => void
  onClear: () => void
}

export function InboxFilters({
  status,
  onStatusChange,
  tagMode,
  onTagModeChange,
  availableTags,
  selectedTags,
  onSelectedTagsChange,
  onClear,
}: InboxFiltersProps): JSX.Element {
  const hasActiveFilters = status !== "unread" || selectedTags.length > 0 || tagMode !== "any"

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap">
        <Typography variant="subtitle2" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
          <StatusIcon sx={{ fontSize: 18 }} />
          Status
        </Typography>
        <Button
          type="button"
          variant="text"
          size="small"
          disabled={!hasActiveFilters}
          onClick={onClear}
          sx={{ minHeight: 44 }}
        >
          Clear filters
        </Button>
      </Stack>

      <ToggleButtonGroup
        exclusive
        value={status}
        aria-label="inbox status filter"
        onChange={(_, value: InboxStatusFilter | null) => {
          if (!value) {
            return
          }
          onStatusChange(value)
        }}
        sx={{ flexWrap: "wrap", gap: 1 }}
      >
        <ToggleButton value="unread" sx={{ minHeight: 44 }}>
          Unread
        </ToggleButton>
        <ToggleButton value="read" sx={{ minHeight: 44 }}>
          Read
        </ToggleButton>
        <ToggleButton value="all" sx={{ minHeight: 44 }}>
          All
        </ToggleButton>
      </ToggleButtonGroup>

      <Typography variant="subtitle2" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
        <TagIcon sx={{ fontSize: 18 }} />
        Tags
      </Typography>

      <ToggleButtonGroup
        exclusive
        value={tagMode}
        aria-label="tag matching mode"
        onChange={(_, value: InboxTagModeFilter | null) => {
          if (!value) {
            return
          }
          onTagModeChange(value)
        }}
        sx={{ flexWrap: "wrap", gap: 1 }}
      >
        <ToggleButton value="any" sx={{ minHeight: 44 }}>
          Any
        </ToggleButton>
        <ToggleButton value="all" sx={{ minHeight: 44 }}>
          All
        </ToggleButton>
      </ToggleButtonGroup>

      {availableTags.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No tags available yet.
        </Typography>
      ) : (
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          {availableTags.map((tag) => {
            const selected = selectedTags.includes(tag.name)
            return (
              <Chip
                key={tag.name}
                clickable
                color={selected ? "primary" : "default"}
                variant={selected ? "filled" : "outlined"}
                aria-pressed={selected}
                label={`${tag.name} (${tag.item_count})`}
                onClick={() => {
                  if (selected) {
                    onSelectedTagsChange(selectedTags.filter((name) => name !== tag.name))
                    return
                  }
                  onSelectedTagsChange([...selectedTags, tag.name])
                }}
                sx={{ minHeight: 44 }}
              />
            )
          })}
        </Box>
      )}
    </Stack>
  )
}
