import { Divider, List, Typography } from "@mui/material"
import { Children, type JSX } from "react"

import type { StashItem } from "../../../shared/types"
import { InboxListRow } from "./inbox-list-row"

type InboxListProps = {
  items: StashItem[]
  onSelect: (itemId: number) => void
  showCreatedAt?: boolean
}

export function InboxList({ items, onSelect, showCreatedAt = true }: InboxListProps): JSX.Element {
  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No items found.
      </Typography>
    )
  }

  return (
    <List disablePadding aria-label="inbox items">
      {Children.toArray(
        items.flatMap((item, index) => {
          const row = (
            <InboxListRow
              key={item.id}
              item={item}
              onSelect={onSelect}
              showCreatedAt={showCreatedAt}
            />
          )
          if (index >= items.length - 1) {
            return [row]
          }
          return [row, <Divider key={`divider-${item.id}`} component="li" />]
        }),
      )}
    </List>
  )
}
