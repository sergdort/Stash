import { useState } from "react"

import { Button } from "../../../shared/ui/button"
import { addTag, removeTag } from "../api/tags-api"

type TagEditorProps = {
  itemId: number
  tags: string[]
  onChanged: () => Promise<void>
}

export function TagEditor({ itemId, tags, onChanged }: TagEditorProps): JSX.Element {
  const [nextTag, setNextTag] = useState("")

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {tags.map((tag) => (
          <Button
            key={tag}
            type="button"
            onClick={() => {
              void removeTag(itemId, tag).then(onChanged)
            }}
            style={{ background: "#374151" }}
          >
            {tag} x
          </Button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={nextTag} onChange={(event) => setNextTag(event.target.value)} placeholder="new tag" />
        <Button
          type="button"
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
      </div>
    </div>
  )
}
