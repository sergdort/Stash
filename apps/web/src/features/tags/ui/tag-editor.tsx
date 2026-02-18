import type { JSX } from "react"
import { useState } from "react"
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material"

import { addTag, removeTag } from "../api/tags-api"
import { AddIcon, TagIcon } from "../../../shared/ui/icons"

type TagEditorProps = {
  itemId: number
  tags: string[]
  onChanged: () => Promise<void>
}

export function TagEditor({ itemId, tags, onChanged }: TagEditorProps): JSX.Element {
  const [nextTag, setNextTag] = useState("")
  const [adding, setAdding] = useState(false)
  const [removingTag, setRemovingTag] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const busy = adding || removingTag !== null

  const handleAddTag = async (): Promise<void> => {
    if (nextTag.trim().length === 0 || busy) {
      return
    }

    setAdding(true)
    setError(null)
    try {
      await addTag(itemId, nextTag)
      setNextTag("")
      await onChanged()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to add tag")
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveTag = async (tag: string): Promise<void> => {
    if (busy) {
      return
    }

    setRemovingTag(tag)
    setError(null)
    try {
      await removeTag(itemId, tag)
      await onChanged()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to remove tag")
    } finally {
      setRemovingTag(null)
    }
  }

  return (
    <Stack spacing={1.25}>
      <Typography variant="subtitle2">Tags</Typography>
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
        {tags.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            variant="outlined"
            disabled={busy}
            onDelete={() => {
              void handleRemoveTag(tag)
            }}
          />
        ))}
      </Stack>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          value={nextTag}
          onChange={(event) => setNextTag(event.target.value)}
          placeholder="new tag"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <TagIcon fontSize="small" color="secondary" />
                </InputAdornment>
              ),
            },
          }}
          disabled={busy}
          sx={{ minWidth: 220 }}
        />
        <Button
          type="button"
          variant="outlined"
          startIcon={<AddIcon />}
          disabled={busy || nextTag.trim().length === 0}
          onClick={() => {
            void handleAddTag()
          }}
        >
          {adding ? "Adding..." : "Add tag"}
        </Button>
      </Box>
      {error ? (
        <Alert severity="error" variant="outlined">
          {error}
        </Alert>
      ) : null}
    </Stack>
  )
}
