import type { JSX } from "react"
import { useMemo, useState } from "react"
import {
  Box,
  Button,
  Chip,
  Drawer,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from "@mui/material"
import { useTheme } from "@mui/material/styles"

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
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("md"))
  const [tagsDrawerOpen, setTagsDrawerOpen] = useState(false)
  const [tagSearch, setTagSearch] = useState("")

  const hasActiveFilters = status !== "unread" || selectedTags.length > 0 || tagMode !== "any"

  const filteredTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase()
    if (!query) return availableTags
    return availableTags.filter((tag) => tag.name.toLowerCase().includes(query))
  }, [availableTags, tagSearch])

  const selectedTagSet = useMemo(() => new Set(selectedTags), [selectedTags])

  const toggleTag = (tagName: string): void => {
    if (selectedTagSet.has(tagName)) {
      onSelectedTagsChange(selectedTags.filter((name) => name !== tagName))
      return
    }
    onSelectedTagsChange([...selectedTags, tagName])
  }

  const mobileVisibleTags = useMemo(() => {
    if (!isMobile) return availableTags

    const selected = availableTags.filter((tag) => selectedTagSet.has(tag.name))
    const unselected = availableTags
      .filter((tag) => !selectedTagSet.has(tag.name))
      .sort((a, b) => b.item_count - a.item_count)
      .slice(0, 6)

    return [...selected, ...unselected]
  }, [availableTags, isMobile, selectedTagSet])

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

      {!isMobile ? (
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
      ) : null}

      <Typography variant="subtitle2" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
        <TagIcon sx={{ fontSize: 18 }} />
        Tags
      </Typography>

      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
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
          sx={{ gap: 1 }}
          size="small"
        >
          <ToggleButton value="any" sx={{ minHeight: 36, px: 1.4 }}>
            Any
          </ToggleButton>
          <ToggleButton value="all" sx={{ minHeight: 36, px: 1.4 }}>
            All
          </ToggleButton>
        </ToggleButtonGroup>

        {isMobile ? (
          <Button variant="outlined" size="small" onClick={() => setTagsDrawerOpen(true)} sx={{ minHeight: 36 }}>
            Show all tags ({availableTags.length})
          </Button>
        ) : null}
      </Stack>

      {availableTags.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No tags available yet.
        </Typography>
      ) : (
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          {(isMobile ? mobileVisibleTags : availableTags).map((tag) => {
            const selected = selectedTagSet.has(tag.name)
            return (
              <Chip
                key={tag.name}
                clickable
                color={selected ? "primary" : "default"}
                variant={selected ? "filled" : "outlined"}
                aria-pressed={selected}
                label={`${tag.name} (${tag.item_count})`}
                onClick={() => toggleTag(tag.name)}
                sx={{ minHeight: 40 }}
              />
            )
          })}
        </Box>
      )}

      <Drawer
        anchor="bottom"
        open={tagsDrawerOpen}
        onClose={() => setTagsDrawerOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            p: 2,
            maxHeight: "78vh",
            overflowY: "auto",
          },
        }}
      >
        <Stack spacing={1.25}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1">Filter tags</Typography>
            <Button size="small" onClick={() => setTagsDrawerOpen(false)}>
              Close
            </Button>
          </Stack>

          <TextField
            size="small"
            label="Search tags"
            value={tagSearch}
            onChange={(event) => setTagSearch(event.target.value)}
            placeholder="e.g. ai, finance"
            fullWidth
          />

          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
            {filteredTags.map((tag) => {
              const selected = selectedTagSet.has(tag.name)
              return (
                <Chip
                  key={tag.name}
                  clickable
                  color={selected ? "primary" : "default"}
                  variant={selected ? "filled" : "outlined"}
                  aria-pressed={selected}
                  label={`${tag.name} (${tag.item_count})`}
                  onClick={() => toggleTag(tag.name)}
                  sx={{ minHeight: 40 }}
                />
              )
            })}
          </Box>

          {filteredTags.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No matching tags.
            </Typography>
          ) : null}
        </Stack>
      </Drawer>
    </Stack>
  )
}
