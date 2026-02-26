import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Container,
  Divider,
  Drawer,
  Fab,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material"
import { useTheme } from "@mui/material/styles"
import { Suspense, lazy, type JSX } from "react"
import { useEffect, useMemo, useRef, useState } from "react"

import { useExtract } from "../features/extract"
import { useInbox } from "../features/inbox"
import type { InboxStatusFilter, InboxTagModeFilter, ListInboxItemsInput } from "../features/inbox/api/list-items"
import { useItem } from "../features/item"
import { useSaveItem } from "../features/save"
import { useStatus } from "../features/status"
import { useTags } from "../features/tags"
import { useTts } from "../features/tts"
import { AddIcon, InboxIcon, StatusIcon } from "../shared/ui/icons"

const SaveForm = lazy(() => import("../features/save/ui/save-form").then((m) => ({ default: m.SaveForm })))
const InboxFilters = lazy(() => import("../features/inbox/ui/inbox-filters").then((m) => ({ default: m.InboxFilters })))
const InboxList = lazy(() => import("../features/inbox/ui/inbox-list").then((m) => ({ default: m.InboxList })))
const ItemDetail = lazy(() => import("../features/item/ui/item-detail").then((m) => ({ default: m.ItemDetail })))
const StatusToggle = lazy(() => import("../features/status/ui/status-toggle").then((m) => ({ default: m.StatusToggle })))
const TagEditor = lazy(() => import("../features/tags/ui/tag-editor").then((m) => ({ default: m.TagEditor })))
const ExtractButton = lazy(() => import("../features/extract/ui/extract-button").then((m) => ({ default: m.ExtractButton })))
const TtsPanel = lazy(() => import("../features/tts/ui/tts-panel").then((m) => ({ default: m.TtsPanel })))

export function AppShell(): JSX.Element {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("md"))

  const [statusFilter, setStatusFilter] = useState<InboxStatusFilter>("unread")
  const [tagModeFilter, setTagModeFilter] = useState<InboxTagModeFilter>("any")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const inboxFilters = useMemo<ListInboxItemsInput>(
    () => ({
      status: statusFilter,
      tags: selectedTags,
      tagMode: tagModeFilter,
      limit: 50,
      offset: 0,
    }),
    [statusFilter, selectedTags, tagModeFilter],
  )

  const { items, loading, error, refresh } = useInbox(inboxFilters)
  const { tags: availableTags, refresh: refreshTags } = useTags()
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [mobileSaveOpen, setMobileSaveOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const selectedId = selectedItemId
  const unreadInView = useMemo(
    () => items.filter((item) => item.status === "unread").length,
    [items],
  )
  const loadingStatusLabel = statusFilter === "all" ? "active" : statusFilter
  const activeFilterCount =
    (statusFilter !== "unread" ? 1 : 0) +
    selectedTags.length +
    (tagModeFilter !== "any" && selectedTags.length > 0 ? 1 : 0)

  const { item, loading: itemLoading, error: itemError, refresh: refreshItem } = useItem(selectedId)
  const saveState = useSaveItem()
  const statusState = useStatus()
  const extractState = useExtract()
  const ttsState = useTts()
  const lastCompletedTtsJobIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (items.length === 0) {
      setSelectedItemId(null)
      return
    }

    if (selectedItemId === null) {
      setSelectedItemId(items[0].id)
      return
    }

    if (!items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(items[0].id)
    }
  }, [items, selectedItemId])

  useEffect(() => {
    if (!selectedId) {
      return
    }
    void ttsState.refreshLatestJob(selectedId).catch(() => {
      // Hook manages API errors.
    })
  }, [selectedId, ttsState.refreshLatestJob])

  useEffect(() => {
    if (ttsState.job?.status !== "succeeded") {
      return
    }
    if (lastCompletedTtsJobIdRef.current === ttsState.job.id) {
      return
    }
    lastCompletedTtsJobIdRef.current = ttsState.job.id
    void (async () => {
      await refreshItem()
      await refresh()
    })()
  }, [ttsState.job, refreshItem, refresh])

  const refreshAll = async (): Promise<void> => {
    await refresh()
    await refreshItem()
    await refreshTags()
  }

  const clearFilters = (): void => {
    setStatusFilter("unread")
    setSelectedTags([])
    setTagModeFilter("any")
  }

  const lazyFallback = (
    <Typography variant="body2" color="text.secondary">
      Loading UI…
    </Typography>
  )

  const inboxErrorMessage = error?.toLowerCase().includes("failed to fetch")
    ? "Can’t reach the API right now. Make sure `stash web` is running and try again."
    : error

  const handleSelectItem = (itemId: number): void => {
    setSelectedItemId(itemId)
    if (isMobile) {
      setMobileDetailOpen(true)
    }
  }

  if (isMobile) {
    return (
      <Box sx={{ minHeight: "100vh", py: 2 }}>
        <Container maxWidth="sm" sx={{ px: 2 }}>
          <Suspense fallback={lazyFallback}>
            <Stack spacing={2}>
            <Paper sx={{ p: 1.5 }}>
              <Stack spacing={1.25}>
                <Typography variant="h4" component="h1">
                  stash.
                </Typography>

                <Stack
                  direction="row"
                  spacing={0.75}
                  alignItems="center"
                  sx={{
                    overflowX: "auto",
                    pb: 0.5,
                    "&::-webkit-scrollbar": { display: "none" },
                    scrollbarWidth: "none",
                  }}
                >
                  <Chip
                    size="small"
                    variant={statusFilter === "unread" ? "filled" : "outlined"}
                    color={statusFilter === "unread" ? "primary" : "default"}
                    label="Unread"
                    onClick={() => setStatusFilter("unread")}
                  />
                  <Chip
                    size="small"
                    variant={statusFilter === "read" ? "filled" : "outlined"}
                    color={statusFilter === "read" ? "primary" : "default"}
                    label="Read"
                    onClick={() => setStatusFilter("read")}
                  />
                  <Chip
                    size="small"
                    variant={statusFilter === "all" ? "filled" : "outlined"}
                    color={statusFilter === "all" ? "secondary" : "default"}
                    label="Archive"
                    onClick={() => setStatusFilter("all")}
                  />
                  <Chip size="small" icon={<InboxIcon fontSize="small" />} label={`${unreadInView} unread`} />
                </Stack>
                {saveState.error ? (
                  <Alert severity="error" variant="outlined">
                    {saveState.error}
                  </Alert>
                ) : null}
              </Stack>
            </Paper>

            <Paper sx={{ p: 0, overflow: "hidden" }}>
              <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
                <Stack spacing={1.25}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle2">Filters</Typography>
                    <Button
                      size="small"
                      onClick={() => setMobileFiltersOpen((v) => !v)}
                      sx={{ minHeight: 32, px: 1 }}
                    >
                      {mobileFiltersOpen ? "Hide" : "Show"} filters
                    </Button>
                  </Stack>

                  {activeFilterCount > 0 ? (
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                      {statusFilter !== "unread" ? (
                        <Chip size="small" label={statusFilter === "all" ? "archive" : statusFilter} />
                      ) : null}
                      {selectedTags.slice(0, 3).map((tag) => (
                        <Chip key={`active-${tag}`} size="small" label={tag} />
                      ))}
                      {selectedTags.length > 3 ? <Chip size="small" label={`+${selectedTags.length - 3}`} /> : null}
                    </Stack>
                  ) : null}

                  <Collapse in={mobileFiltersOpen}>
                    <InboxFilters
                      status={statusFilter}
                      onStatusChange={setStatusFilter}
                      tagMode={tagModeFilter}
                      onTagModeChange={setTagModeFilter}
                      availableTags={availableTags}
                      selectedTags={selectedTags}
                      onSelectedTagsChange={setSelectedTags}
                      onClear={clearFilters}
                    />
                  </Collapse>
                </Stack>
              </Box>
              <Divider />
              {loading ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.25 }}>
                  Loading {loadingStatusLabel} items...
                </Typography>
              ) : null}
              {inboxErrorMessage ? (
                <Alert severity="warning" variant="outlined" sx={{ mx: 2, my: 1.25 }}>
                  {inboxErrorMessage}
                </Alert>
              ) : null}
              <InboxList items={items} selectedItemId={selectedId} onSelect={handleSelectItem} />
            </Paper>

            <Drawer
              anchor="bottom"
              open={mobileSaveOpen}
              onClose={() => setMobileSaveOpen(false)}
              PaperProps={{
                sx: {
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                  p: 2,
                  maxHeight: "82vh",
                  overflowY: "auto",
                },
              }}
            >
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle1">Save a new link</Typography>
                  <Button size="small" onClick={() => setMobileSaveOpen(false)}>
                    Close
                  </Button>
                </Stack>

                <SaveForm
                  saving={saveState.saving}
                  onSave={async (payload) => {
                    await saveState.save(payload)
                    await refresh()
                    await refreshTags()
                    setMobileSaveOpen(false)
                  }}
                />
                {saveState.error ? (
                  <Alert severity="error" variant="outlined">
                    {saveState.error}
                  </Alert>
                ) : null}
              </Stack>
            </Drawer>

            <Drawer
              anchor="bottom"
              open={mobileDetailOpen && Boolean(item)}
              onClose={() => setMobileDetailOpen(false)}
              PaperProps={{
                sx: {
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                  p: 2,
                  maxHeight: "82vh",
                  overflowY: "auto",
                },
              }}
            >
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle1">Item details</Typography>
                  <Button size="small" onClick={() => setMobileDetailOpen(false)}>
                    Close
                  </Button>
                </Stack>

                <ItemDetail item={item} loading={itemLoading} error={itemError} />
                {item ? (
                  <>
                    <Divider />
                    <StatusToggle
                      itemId={item.id}
                      status={item.status}
                      loading={statusState.loading}
                      onToggle={async (itemId, status) => {
                        await statusState.updateStatus(itemId, status)
                        await refreshAll()
                      }}
                    />

                    <TagEditor
                      itemId={item.id}
                      tags={item.tags}
                      onChanged={async () => {
                        await refreshAll()
                      }}
                    />

                    <ExtractButton
                      itemId={item.id}
                      loading={extractState.loading}
                      onExtract={async (itemId, force) => {
                        await extractState.runExtract(itemId, force)
                        await refreshAll()
                      }}
                    />

                    <TtsPanel
                      itemId={item.id}
                      title={item.title ?? item.url}
                      loading={ttsState.loading}
                      error={ttsState.error}
                      job={ttsState.job}
                      hasExtractedContent={item.has_extracted_content}
                      ttsAudio={item.tts_audio}
                      onGenerate={async (itemId) => {
                        try {
                          await ttsState.runTts(itemId)
                        } catch {
                          // Error is stored in useTts state.
                        }
                        await refreshItem()
                        await refresh()
                      }}
                    />
                  </>
                ) : null}
              </Stack>
            </Drawer>

            <Fab
              color="primary"
              aria-label="add link"
              onClick={() => setMobileSaveOpen(true)}
              sx={{
                position: "fixed",
                right: 18,
                bottom: 86,
                width: 58,
                height: 58,
                boxShadow: "0 12px 28px rgba(15, 118, 110, 0.35)",
              }}
            >
              <AddIcon sx={{ fontSize: 28 }} />
            </Fab>
          </Stack>
          </Suspense>
        </Container>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        py: { xs: 2, md: 4 },
      }}
    >
      <Container maxWidth="xl">
        <Suspense fallback={lazyFallback}>
          <Stack spacing={2.5}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between">
                <Box>
                  <Typography variant="h3" component="h1">
                    stash.
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720, mt: 0.75 }}>
                    Clean, scannable feed for saving links and reading later.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="flex-start">
                  <Chip size="small" icon={<InboxIcon fontSize="small" />} label={`${unreadInView} unread in view`} />
                  <Chip size="small" color="warning" icon={<StatusIcon fontSize="small" />} label="Light mode" />
                </Stack>
              </Stack>

              <SaveForm
                saving={saveState.saving}
                onSave={async (payload) => {
                  await saveState.save(payload)
                  await refresh()
                  await refreshTags()
                }}
              />
              {saveState.error ? (
                <Alert severity="error" variant="outlined">
                  {saveState.error}
                </Alert>
              ) : null}
            </Stack>
          </Paper>

          <Box
            sx={{
              display: "grid",
              gap: 2.5,
              gridTemplateColumns: {
                xs: "1fr",
                lg: "minmax(320px, 420px) minmax(0, 1fr)",
              },
            }}
          >
            <Box>
              <Paper sx={{ p: 2, height: "100%" }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <InboxIcon fontSize="small" color="primary" />
                    <Typography variant="h6">Inbox</Typography>
                  </Stack>
                  <InboxFilters
                    status={statusFilter}
                    onStatusChange={setStatusFilter}
                    tagMode={tagModeFilter}
                    onTagModeChange={setTagModeFilter}
                    availableTags={availableTags}
                    selectedTags={selectedTags}
                    onSelectedTagsChange={setSelectedTags}
                    onClear={clearFilters}
                  />
                  {loading ? (
                    <Typography variant="body2" color="text.secondary">
                      Loading {loadingStatusLabel} items...
                    </Typography>
                  ) : null}
                  {inboxErrorMessage ? (
                    <Alert severity="warning" variant="outlined">
                      {inboxErrorMessage}
                    </Alert>
                  ) : null}
                  <InboxList items={items} selectedItemId={selectedId} onSelect={handleSelectItem} />
                </Stack>
              </Paper>
            </Box>

            <Box>
              <Paper sx={{ p: 2, height: "100%" }}>
                <Stack spacing={2}>
                  <ItemDetail item={item} loading={itemLoading} error={itemError} />
                  {item ? (
                    <>
                      <Divider />
                      <Stack spacing={1.5}>
                        <Typography variant="subtitle1">Operations</Typography>

                        <StatusToggle
                          itemId={item.id}
                          status={item.status}
                          loading={statusState.loading}
                          onToggle={async (itemId, status) => {
                            await statusState.updateStatus(itemId, status)
                            await refreshAll()
                          }}
                        />

                        <TagEditor
                          itemId={item.id}
                          tags={item.tags}
                          onChanged={async () => {
                            await refreshAll()
                          }}
                        />

                        <ExtractButton
                          itemId={item.id}
                          loading={extractState.loading}
                          onExtract={async (itemId, force) => {
                            await extractState.runExtract(itemId, force)
                            await refreshAll()
                          }}
                        />

                        <TtsPanel
                          itemId={item.id}
                          title={item.title ?? item.url}
                          loading={ttsState.loading}
                          error={ttsState.error}
                          job={ttsState.job}
                          hasExtractedContent={item.has_extracted_content}
                          ttsAudio={item.tts_audio}
                          onGenerate={async (itemId) => {
                            try {
                              await ttsState.runTts(itemId)
                            } catch {
                              // Error is stored in useTts state.
                            }
                            await refreshItem()
                            await refresh()
                          }}
                        />
                      </Stack>
                    </>
                  ) : null}
                </Stack>
              </Paper>
            </Box>
          </Box>
          </Stack>
        </Suspense>
      </Container>
    </Box>
  )
}
