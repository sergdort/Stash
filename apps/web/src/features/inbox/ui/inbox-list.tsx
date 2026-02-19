import { Box, Chip, Stack, Typography, useMediaQuery } from "@mui/material"
import { useTheme } from "@mui/material/styles"
import type { JSX } from "react"

import { formatDateTime } from "../../../shared/lib/date"
import type { StashItem } from "../../../shared/types"
import { TimeIcon } from "../../../shared/ui/icons"

type InboxListProps = {
  items: StashItem[]
  selectedItemId: number | null
  onSelect: (itemId: number) => void
  showCreatedAt?: boolean
}

type ThumbnailPreviewProps = {
  imageUrl: string | null
  width: number
  height: number
}

function ThumbnailPreview({ imageUrl, width, height }: ThumbnailPreviewProps): JSX.Element {
  return (
    <Box
      sx={{
        width,
        height,
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "rgba(15,23,42,0.04)",
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
          width={width}
          height={height}
          sx={{
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

export function InboxList({
  items,
  selectedItemId,
  onSelect,
  showCreatedAt = true,
}: InboxListProps): JSX.Element {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("md"))

  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No items found.
      </Typography>
    )
  }

  return (
    <Stack
      spacing={isMobile ? 0 : 1}
      sx={{
        maxHeight: { xs: "none", md: 520 },
        overflowY: { xs: "visible", md: "auto" },
        pr: { xs: 0, md: 0.5 },
      }}
    >
      {items.map((item) => {
        const selected = selectedItemId === item.id
        return (
          <Box
            key={item.id}
            component="button"
            type="button"
            onClick={() => onSelect(item.id)}
            sx={{
              width: "100%",
              textAlign: "left",
              border: "1px solid",
              borderColor: selected ? "primary.main" : "divider",
              borderBottomColor: isMobile ? "divider" : undefined,
              bgcolor: selected ? "rgba(20, 184, 166, 0.11)" : "background.paper",
              borderRadius: isMobile ? 0 : 1,
              px: isMobile ? 1.75 : 1.5,
              py: isMobile ? 1.6 : 1.4,
              cursor: "pointer",
              transition:
                "background-color 180ms ease, border-color 180ms ease, transform 180ms ease",
              minHeight: isMobile ? 124 : 96,
              "&:hover": {
                bgcolor: selected ? "rgba(20, 184, 166, 0.17)" : "rgba(15, 23, 42, 0.03)",
                transform: isMobile ? "none" : "translateY(-1px)",
              },
              "&:focus-visible": {
                outline: "3px solid",
                outlineColor: "rgba(15, 118, 110, 0.35)",
                outlineOffset: 2,
              },
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="stretch">
              <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant={isMobile ? "h6" : "subtitle2"}
                  sx={{
                    lineHeight: 1.28,
                    display: "-webkit-box",
                    WebkitLineClamp: isMobile ? 2 : 1,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {item.title ?? item.url}
                </Typography>

                <Typography variant={isMobile ? "body1" : "caption"} color="text.secondary" noWrap>
                  {item.domain ?? item.url}
                </Typography>

                <Stack
                  direction="row"
                  spacing={0.75}
                  useFlexGap
                  flexWrap="wrap"
                  alignItems="center"
                >
                  <Chip size="small" variant="outlined" label={`#${item.id}`} />
                  <Chip
                    size="small"
                    color={item.status === "read" ? "success" : "default"}
                    label={item.status}
                    variant={item.status === "read" ? "filled" : "outlined"}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    color={item.has_extracted_content ? "success" : "default"}
                    label={item.has_extracted_content ? "content" : "no content"}
                  />
                  {showCreatedAt ? (
                    <Chip
                      size="small"
                      icon={<TimeIcon fontSize="small" />}
                      label={formatDateTime(item.created_at)}
                      variant="outlined"
                    />
                  ) : null}
                </Stack>
              </Stack>

              <ThumbnailPreview
                key={`${item.id}-${item.thumbnail_url ?? "none"}`}
                imageUrl={item.thumbnail_url}
                width={isMobile ? 104 : 88}
                height={isMobile ? 84 : 72}
              />
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
