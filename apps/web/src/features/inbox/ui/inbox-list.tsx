import type { JSX } from "react"
import type { StashItem } from "../../../shared/types"

type InboxListProps = {
  items: StashItem[]
  selectedItemId: number | null
  onSelect: (itemId: number) => void
}

export function InboxList({ items, selectedItemId, onSelect }: InboxListProps): JSX.Element {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          style={{
            textAlign: "left",
            border: selectedItemId === item.id ? "2px solid #1d4ed8" : "1px solid #d1d5db",
            background: "#ffffff",
            borderRadius: 8,
            padding: 10,
            cursor: "pointer",
          }}
        >
          <div style={{ fontWeight: 600 }}>{item.title ?? item.url}</div>
          <div style={{ fontSize: 12, color: "#4b5563" }}>{item.domain ?? item.url}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>#{item.id}</div>
        </button>
      ))}
    </div>
  )
}
