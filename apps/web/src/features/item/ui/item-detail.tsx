import { formatDateTime } from "../../../shared/lib/date"
import type { StashItem } from "../../../shared/types"

type ItemDetailProps = {
  item: StashItem | null
}

export function ItemDetail({ item }: ItemDetailProps): JSX.Element {
  if (!item) {
    return <div>Select an item to view details.</div>
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0 }}>{item.title ?? item.url}</h2>
      <a href={item.url} target="_blank" rel="noreferrer">
        {item.url}
      </a>
      <div>Status: {item.status}</div>
      <div>Tags: {item.tags.length > 0 ? item.tags.join(", ") : "-"}</div>
      <div>Created: {formatDateTime(item.created_at)}</div>
      <div>Updated: {formatDateTime(item.updated_at)}</div>
    </div>
  )
}
