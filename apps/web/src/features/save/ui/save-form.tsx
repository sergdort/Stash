import { useState } from "react"

import { Button } from "../../../shared/ui/button"

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
    <form
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
      style={{ display: "grid", gap: 8 }}
    >
      <input placeholder="URL" value={url} onChange={(event) => setUrl(event.target.value)} />
      <input
        placeholder="Title (optional)"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <input
        placeholder="Tags (comma separated)"
        value={tags}
        onChange={(event) => setTags(event.target.value)}
      />
      <label style={{ display: "flex", gap: 8 }}>
        <input
          type="checkbox"
          checked={extract}
          onChange={(event) => setExtract(event.target.checked)}
        />
        Extract content
      </label>
      <Button type="submit" disabled={saving || url.trim().length === 0}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </form>
  )
}
