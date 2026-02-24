import type { JSX } from "react"
import { useState } from "react"
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material"

import { AddIcon, ExternalLinkIcon, TagIcon } from "../../../shared/ui/icons"

type SaveFormProps = {
  onSave: (payload: { url: string; title?: string; tags?: string[]; extract?: boolean }) => Promise<void>
  saving: boolean
}

export function SaveForm({ onSave, saving }: SaveFormProps): JSX.Element {
  const [url, setUrl] = useState("")
  const [title, setTitle] = useState("")
  const [tags, setTags] = useState("")
  const [extract, setExtract] = useState(true)

  return (
    <Stack
      component="form"
      spacing={1.75}
      onSubmit={(event) => {
        event.preventDefault()
        const normalizedTags = tags
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0)

        void onSave({
          url,
          title: title || undefined,
          tags: normalizedTags,
          extract,
        }).then(() => {
          setUrl("")
          setTitle("")
          setTags("")
        })
      }}
    >
      <Typography variant="subtitle1">Save a new link</Typography>
      <TextField
        label="URL"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://example.com"
        helperText="Paste any article or page URL."
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <ExternalLinkIcon fontSize="small" color="secondary" />
              </InputAdornment>
            ),
          },
        }}
        required
        fullWidth
      />

      <Box
        sx={{
          display: "grid",
          gap: 1.75,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        }}
      >
        <Box>
          <TextField
            label="Title (optional)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Override extracted title"
            helperText="Leave empty to use extracted page title."
            fullWidth
          />
        </Box>
        <Box>
          <TextField
            label="Tags (comma separated)"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="ai, typescript, read-later"
            helperText="Tags are normalized to lowercase."
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <TagIcon fontSize="small" color="secondary" />
                  </InputAdornment>
                ),
              },
            }}
            fullWidth
          />
        </Box>
      </Box>

      <FormControlLabel
        control={
          <Checkbox
            checked={extract}
            onChange={(event) => setExtract(event.target.checked)}
            size="small"
          />
        }
        label="Extract content"
      />

      <Button
        type="submit"
        variant="contained"
        startIcon={<AddIcon />}
        disabled={saving || url.trim().length === 0}
        sx={{
          alignSelf: { xs: "stretch", sm: "flex-start" },
          minWidth: { sm: 164 },
        }}
      >
        {saving ? "Saving..." : "Save"}
      </Button>
    </Stack>
  )
}
