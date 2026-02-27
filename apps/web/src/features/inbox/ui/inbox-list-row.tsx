import { Box, ListItemButton, Stack, Typography } from "@mui/material"
import { type JSX, memo, useCallback } from "react"

import { formatDateTime } from "../../../shared/lib/date"
import type { StashItem } from "../../../shared/types"
import { TimeIcon } from "../../../shared/ui/icons"

type InboxListRowProps = {
  key: number
  item: StashItem
  onSelect: (itemId: number) => void
  showCreatedAt: boolean
}

type ThumbnailPreviewProps = {
  imageUrl: string | null
}

function ThumbnailPreview({ imageUrl }: ThumbnailPreviewProps): JSX.Element {
  return (
    <Box
      sx={{
        width: 72,
        height: 72,
        borderRadius: 1,
        border: "1px solid rgba(15, 23, 42, 0.08)",
        backgroundColor: "rgba(15, 23, 42, 0.03)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {imageUrl ? (
        <Box
          component="img"
          src={imageUrl}
          alt=""
          loading="lazy"
          width={72}
          height={72}
          sx={{
            borderRadius: 1,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : null}
    </Box>
  )
}

function InboxListRowComponent({
  key,
  item,
  onSelect,
  showCreatedAt,
}: InboxListRowProps): JSX.Element {
  const handleClick = useCallback((): void => {
    onSelect(item.id)
  }, [item.id, onSelect])

  return (
    <ListItemButton
      key={key}
      component="li"
      onClick={handleClick}
      sx={{
        px: 1,
        py: 1.25,
        alignItems: "stretch",
        minHeight: 96,
        borderRadius: 0,
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, width: "100%" }}>
        <Stack spacing={0.65} sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="caption"
            sx={{ color: "rgba(15, 23, 42, 0.52)", fontWeight: 500 }}
            noWrap
          >
            {item.domain ?? item.url}
          </Typography>

          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 600,
              color: "#0B1220",
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {item.title ?? item.url}
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography variant="caption" sx={{ color: "#0F766E", fontWeight: 600 }}>
              #{item.id}
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(51, 65, 85, 0.9)" }}>
              {item.has_extracted_content ? "content" : item.status}
            </Typography>
            {showCreatedAt ? (
              <Typography
                variant="caption"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                  color: "rgba(15, 23, 42, 0.6)",
                }}
              >
                <TimeIcon fontSize="inherit" />
                {formatDateTime(item.created_at)}
              </Typography>
            ) : null}
          </Stack>
        </Stack>
        <ThumbnailPreview imageUrl={item.thumbnail_url} />
      </Stack>
    </ListItemButton>
  )
}

export const InboxListRow = memo(InboxListRowComponent)
InboxListRow.displayName = "InboxListRow"
