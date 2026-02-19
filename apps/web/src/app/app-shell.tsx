import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material"
import { useTheme } from "@mui/material/styles"
import type { JSX } from "react"
import { useEffect, useMemo, useState } from "react"

import { ExtractButton, useExtract } from "../features/extract"
import { InboxFilters, InboxList, useInbox } from "../features/inbox"
import type { InboxStatusFilter, InboxTagModeFilter, ListInboxItemsInput } from "../features/inbox/api/list-items"
import { ItemDetail, useItem } from "../features/item"
import { SaveForm, useSaveItem } from "../features/save"
import { StatusToggle, useStatus } from "../features/status"
import { TagEditor, useTags } from "../features/tags"
import { TtsPanel, useTts } from "../features/tts"
import { AddIcon, InboxIcon, StatusIcon } from "../shared/ui/icons"

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
  const selectedId = selectedItemId
  const unreadInView = useMemo(
    () => items.filter((item) => item.status === "unread").length,
    [items],
  )
  const loadingStatusLabel = statusFilter === "all" ? "active" : statusFilter

  const { item, loading: itemLoading, error: itemError, refresh: refreshItem } = useItem(selectedId)
  const saveState = useSaveItem()
  const statusState = useStatus()
  const extractState = useExtract()
  const ttsState = useTts()

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

  const handleSelectItem = (itemId: number): void => {
    setSelectedItemId(itemId)
    if (isMobile) {
      setMobileDetailOpen(true)
    }
  }

  if (isMobile) {
    return (
      <Box sx={{ minHeight: "100vh", py: 1.25 }}>
        <Container maxWidth="sm" sx={{ px: 1.25 }}>
          <Stack spacing={1.25}>
            <Paper sx={{ p: 1.5 }}>
              <Stack spacing={1.25}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="h4" component="h1">
                    stash.
                  </Typography>
                  <IconButton
                    aria-label="add link"
                    onClick={() => setMobileSaveOpen(true)}
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "primary.main",
                      color: "primary.main",
                      bgcolor: "rgba(20, 184, 166, 0.08)",
                    }}
                  >
                    <AddIcon sx={{ fontSize: 28 }} />
                  </IconButton>
                </Stack>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
                  <Chip
                    size="small"
                    variant={statusFilter === "all" ? "filled" : "outlined"}
                    color={statusFilter === "all" ? "primary" : "default"}
                    label="All"
                    onClick={() => setStatusFilter("all")}
                  />
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
              <Box sx={{ px: 1.25, pt: 1.25 }}>
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
              </Box>
              <Divider sx={{ mt: 1.25 }} />
              {loading ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1.25 }}>
                  Loading {loadingStatusLabel} items...
                </Typography>
              ) : null}
              {error ? (
                <Typography variant="body2" color="error.main" role="status" sx={{ px: 1.5, py: 1.25 }}>
                  {error}
                </Typography>
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
                      loading={ttsState.loading}
                      downloadUrl={ttsState.downloadUrl}
                      onGenerate={ttsState.runTts}
                    />
                  </>
                ) : null}
              </Stack>
            </Drawer>
          </Stack>
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
        <Stack spacing={2.5}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between">
                <Box>
                  <Typography variant="h3" component="h1">
                    stash web
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720, mt: 0.75 }}>
                    Save links quickly, extract readable content, and manage reading flow with deterministic data.
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
                  {error ? (
                    <Typography variant="body2" color="error.main" role="status">
                      {error}
                    </Typography>
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
                          loading={ttsState.loading}
                          downloadUrl={ttsState.downloadUrl}
                          onGenerate={ttsState.runTts}
                        />
                      </Stack>
                    </>
                  ) : null}
                </Stack>
              </Paper>
            </Box>
          </Box>
        </Stack>
      </Container>
    </Box>
  )
}
