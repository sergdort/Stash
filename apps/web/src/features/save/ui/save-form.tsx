import type { JSX } from "react"
import { useState } from "react"
import { Box, Button, Checkbox, FormControlLabel, Stack, TextField } from "@mui/material"

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
      spacing={1.5}
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
      <TextField
        label="URL"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://example.com"
        required
        fullWidth
        size="small"
      />

      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        }}
      >
        <Box>
          <TextField
            label="Title (optional)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            fullWidth
            size="small"
          />
        </Box>
        <Box>
          <TextField
            label="Tags (comma separated)"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            fullWidth
            size="small"
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

      <Button type="submit" variant="contained" disabled={saving || url.trim().length === 0}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </Stack>
  )
}
