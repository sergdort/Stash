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
  size: number
}

function ThumbnailPreview({ imageUrl, size }: ThumbnailPreviewProps): JSX.Element {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "rgba(15,23,42,0.06)",
        bgcolor: "rgba(15,23,42,0.02)",
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
          width={size}
          height={size}
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
  selectedItemId: _selectedItemId,
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
      spacing={1}
      sx={{
        maxHeight: { xs: "none", md: 520 },
        overflowY: { xs: "visible", md: "auto" },
        pr: { xs: 0, md: 0.5 },
        pb: { xs: 10, md: 0.5 },
      }}
    >
      {items.map((item) => {
        return (
          <Box
            key={item.id}
            component="button"
            type="button"
            onClick={() => onSelect(item.id)}
            sx={{
              width: "100%",
              textAlign: "left",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              bgcolor: "background.paper",
              borderRadius: 2,
              px: 1.5,
              py: 1.4,
              cursor: "pointer",
              boxShadow: "0 3px 12px rgba(15, 23, 42, 0.04)",
              transition:
                "background-color 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease",
              minHeight: isMobile ? 128 : 114,
              "&:hover": {
                borderColor: "rgba(15, 118, 110, 0.3)",
                boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
                transform: "translateY(-1px)",
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
                <Typography variant="caption" sx={{ color: "rgba(15, 23, 42, 0.52)", fontWeight: 500 }} noWrap>
                  {item.domain ?? item.url}
                </Typography>

                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 650,
                    fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
                    color: "#0B1220",
                    lineHeight: 1.36,
                    display: "-webkit-box",
                    WebkitLineClamp: isMobile ? 3 : 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {item.title ?? item.url}
                </Typography>

                <Stack spacing={0.8}>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
                    <Chip
                      size="small"
                      label={`#${item.id}`}
                      sx={{
                        bgcolor: "rgba(20, 184, 166, 0.14)",
                        color: "#0F766E",
                        border: "1px solid rgba(20, 184, 166, 0.2)",
                      }}
                    />
                    <Chip
                      size="small"
                      label={item.has_extracted_content ? "content" : item.status}
                      sx={{
                        bgcolor: "rgba(148, 163, 184, 0.14)",
                        color: "#334155",
                        border: "1px solid rgba(148, 163, 184, 0.2)",
                      }}
                    />
                  </Stack>

                  {showCreatedAt ? (
                    <Typography
                      variant="caption"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.55,
                        color: "rgba(15, 23, 42, 0.6)",
                      }}
                    >
                      <TimeIcon fontSize="inherit" />
                      {formatDateTime(item.created_at)}
                    </Typography>
                  ) : null}
                </Stack>
              </Stack>

              <ThumbnailPreview
                key={`${item.id}-${item.thumbnail_url ?? "none"}`}
                imageUrl={item.thumbnail_url}
                size={isMobile ? 98 : 92}
              />
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
