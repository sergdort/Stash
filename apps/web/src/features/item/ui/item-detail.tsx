import type { JSX } from "react"
import { Chip, Link, Stack, Typography } from "@mui/material"

import { formatDateTime } from "../../../shared/lib/date"
import type { StashItem } from "../../../shared/types"

type ItemDetailProps = {
  item: StashItem | null
}

export function ItemDetail({ item }: ItemDetailProps): JSX.Element {
  if (!item) {
    return (
      <Typography variant="body2" color="text.secondary">
        Select an item to view details.
      </Typography>
    )
  }

  return (
    <Stack spacing={1}>
      <Typography variant="h6">{item.title ?? item.url}</Typography>
      <Link href={item.url} target="_blank" rel="noreferrer" underline="hover" sx={{ wordBreak: "break-all" }}>
        {item.url}
      </Link>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Chip size="small" color={item.status === "read" ? "success" : "default"} label={item.status} />
        {item.tags.map((tag) => (
          <Chip key={tag} size="small" variant="outlined" label={tag} />
        ))}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Created: {formatDateTime(item.created_at)}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Updated: {formatDateTime(item.updated_at)}
      </Typography>
    </Stack>
  )
}
