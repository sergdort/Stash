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
} from "@mui/material"
import type { ChangeEvent, JSX, MouseEvent } from "react"
import { useCallback, useMemo, useState } from "react"
import { StatusIcon, TagIcon } from "../../../shared/ui/icons"
import type { InboxTagModeFilter } from "../api/list-items"

type TagOption = {
  name: string
  item_count: number
}

type TagFilterChipProps = {
  tag: TagOption
  selected: boolean
  onToggle: (tagName: string) => void
}

const TAG_DRAWER_MAX_WIDTH = 680

function TagFilterChip({ tag, selected, onToggle }: TagFilterChipProps): JSX.Element {
  const handleClick = useCallback((): void => {
    onToggle(tag.name)
  }, [onToggle, tag.name])

  return (
    <Chip
      clickable
      color={selected ? "primary" : "default"}
      variant={selected ? "filled" : "outlined"}
      aria-pressed={selected}
      label={`${tag.name} (${tag.item_count})`}
      onClick={handleClick}
      sx={{ minHeight: 40 }}
    />
  )
}

type InboxFiltersProps = {
  hasActiveFilters: boolean
  tagMode: InboxTagModeFilter
  onTagModeChange: (mode: InboxTagModeFilter) => void
  availableTags: TagOption[]
  selectedTags: string[]
  onSelectedTagsChange: (tags: string[]) => void
  onClear: () => void
}

export function InboxFilters({
  hasActiveFilters,
  tagMode,
  onTagModeChange,
  availableTags,
  selectedTags,
  onSelectedTagsChange,
  onClear,
}: InboxFiltersProps): JSX.Element {
  const [tagsDrawerOpen, setTagsDrawerOpen] = useState(false)
  const [tagSearch, setTagSearch] = useState("")

  const filteredTags = useMemo(() => {
    const query = tagSearch.trim().toLowerCase()
    if (!query) return availableTags
    return availableTags.filter((tag) => tag.name.toLowerCase().includes(query))
  }, [availableTags, tagSearch])

  const selectedTagSet = useMemo(() => new Set(selectedTags), [selectedTags])

  const toggleTag = useCallback(
    (tagName: string): void => {
      if (selectedTagSet.has(tagName)) {
        onSelectedTagsChange(selectedTags.filter((name) => name !== tagName))
        return
      }
      onSelectedTagsChange([...selectedTags, tagName])
    },
    [onSelectedTagsChange, selectedTagSet, selectedTags],
  )

  const handleOpenTagsDrawer = useCallback((): void => {
    setTagsDrawerOpen(true)
  }, [])

  const handleCloseTagsDrawer = useCallback((): void => {
    setTagsDrawerOpen(false)
  }, [])

  const handleTagSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    setTagSearch(event.target.value)
  }, [])

  const handleTagModeChange = useCallback(
    (_event: MouseEvent<HTMLElement>, value: InboxTagModeFilter | null): void => {
      if (!value) {
        return
      }
      onTagModeChange(value)
    },
    [onTagModeChange],
  )

  const visibleTags = useMemo(() => {
    const selected = availableTags.filter((tag) => selectedTagSet.has(tag.name))
    const unselected = availableTags
      .filter((tag) => !selectedTagSet.has(tag.name))
      .sort((a, b) => b.item_count - a.item_count)
      .slice(0, 6)

    return [...selected, ...unselected]
  }, [availableTags, selectedTagSet])

  return (
    <Stack spacing={1.25}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
      >
        <Typography
          variant="subtitle2"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}
        >
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

      <Typography
        variant="subtitle2"
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}
      >
        <TagIcon sx={{ fontSize: 18 }} />
        Tags
      </Typography>

      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
        <ToggleButtonGroup
          exclusive
          value={tagMode}
          aria-label="tag matching mode"
          onChange={handleTagModeChange}
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

        <Button
          variant="outlined"
          size="small"
          onClick={handleOpenTagsDrawer}
          sx={{ minHeight: 36 }}
        >
          Show all tags ({availableTags.length})
        </Button>
      </Stack>

      {availableTags.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No tags available yet.
        </Typography>
      ) : (
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          {visibleTags.map((tag) => {
            return (
              <TagFilterChip
                key={tag.name}
                tag={tag}
                selected={selectedTagSet.has(tag.name)}
                onToggle={toggleTag}
              />
            )
          })}
        </Box>
      )}

      <Drawer
        anchor="bottom"
        open={tagsDrawerOpen}
        onClose={handleCloseTagsDrawer}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            p: 2,
            maxHeight: "78vh",
            overflowY: "auto",
            overscrollBehavior: "contain",
            width: "100%",
            maxWidth: TAG_DRAWER_MAX_WIDTH,
            left: 0,
            right: 0,
            mx: "auto",
          },
        }}
      >
        <Stack spacing={1.25}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1">Filter tags</Typography>
            <Button size="small" onClick={handleCloseTagsDrawer}>
              Close
            </Button>
          </Stack>

          <TextField
            size="small"
            label="Search tags"
            value={tagSearch}
            onChange={handleTagSearchChange}
            placeholder="e.g. ai, finance"
            slotProps={{
              htmlInput: {
                name: "tag-search",
                autoComplete: "off",
              },
            }}
            fullWidth
          />

          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
            {filteredTags.map((tag) => {
              return (
                <TagFilterChip
                  key={tag.name}
                  tag={tag}
                  selected={selectedTagSet.has(tag.name)}
                  onToggle={toggleTag}
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
