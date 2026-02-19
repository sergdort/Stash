import { Alert, Chip, Link, Skeleton, Stack, Typography } from "@mui/material"
import type { JSX } from "react"

import { formatDateTime } from "../../../shared/lib/date"
import type { StashItem } from "../../../shared/types"
import { ExternalLinkIcon, TimeIcon } from "../../../shared/ui/icons"

type ItemDetailProps = {
  item: StashItem | null
  loading: boolean
  error: string | null
}

export function ItemDetail({ item, loading, error }: ItemDetailProps): JSX.Element {
  if (loading) {
    return (
      <Stack spacing={1.5}>
        <Skeleton variant="rounded" height={30} width="70%" />
        <Skeleton variant="rounded" height={20} width="95%" />
        <Skeleton variant="rounded" height={24} width="50%" />
        <Skeleton variant="rounded" height={18} width="65%" />
      </Stack>
    )
  }

  if (error) {
    return (
      <Alert severity="error" variant="outlined">
        {error}
      </Alert>
    )
  }

  if (!item) {
    return (
      <Typography variant="body2" color="text.secondary">
        Select an item to view details.
      </Typography>
    )
  }

  return (
    <Stack spacing={1.25}>
      <Typography variant="h6">{item.title ?? item.url}</Typography>
      <Link
        href={item.url}
        target="_blank"
        rel="noreferrer"
        underline="hover"
        sx={{ wordBreak: "break-all", display: "inline-flex", gap: 0.5, alignItems: "center" }}
      >
        <ExternalLinkIcon sx={{ fontSize: 16 }} />
        {item.url}
      </Link>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Chip
          size="small"
          color={item.status === "read" ? "success" : "default"}
          label={item.status}
        />
        {item.tags.map((tag) => (
          <Chip key={tag} size="small" variant="outlined" label={tag} />
        ))}
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        <Chip
          size="small"
          icon={<TimeIcon sx={{ fontSize: 16 }} />}
          variant="outlined"
          label={`#${item.id}`}
        />
        <Chip
          size="small"
          variant="outlined"
          label={`Created: ${formatDateTime(item.created_at)}`}
        />
        <Chip
          size="small"
          variant="outlined"
          label={`Updated: ${formatDateTime(item.updated_at)}`}
        />
      </Stack>
    </Stack>
  )
}
