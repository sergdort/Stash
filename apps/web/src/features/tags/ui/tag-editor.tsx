import type { JSX } from "react"
import { useState } from "react"
import { Box, Button, Chip, Stack, TextField } from "@mui/material"

import { addTag, removeTag } from "../api/tags-api"

type TagEditorProps = {
  itemId: number
  tags: string[]
  onChanged: () => Promise<void>
}

export function TagEditor({ itemId, tags, onChanged }: TagEditorProps): JSX.Element {
  const [nextTag, setNextTag] = useState("")

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
        {tags.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            variant="outlined"
            onDelete={() => {
              void removeTag(itemId, tag).then(onChanged)
            }}
          />
        ))}
      </Stack>

      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          value={nextTag}
          onChange={(event) => setNextTag(event.target.value)}
          placeholder="new tag"
          size="small"
          sx={{ minWidth: 220 }}
        />
        <Button
          type="button"
          variant="outlined"
          onClick={() => {
            if (nextTag.trim().length === 0) {
              return
            }
            void addTag(itemId, nextTag).then(async () => {
              setNextTag("")
              await onChanged()
            })
          }}
        >
          Add tag
        </Button>
      </Box>
    </Stack>
  )
}
