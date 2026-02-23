import {
  Alert,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material"
import type { JSX } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom"

import { useExtract } from "../features/extract"
import { ExtractButton } from "../features/extract/ui/extract-button"
import { useInbox } from "../features/inbox"
import type {
  InboxStatusFilter,
  InboxTagModeFilter,
  ListInboxItemsInput,
} from "../features/inbox/api/list-items"
import { InboxFilters } from "../features/inbox/ui/inbox-filters"
import { InboxList } from "../features/inbox/ui/inbox-list"
import { useItem } from "../features/item"
import { ItemDetail } from "../features/item/ui/item-detail"
import { useSaveItem } from "../features/save"
import { SaveForm } from "../features/save/ui/save-form"
import { useStatus } from "../features/status"
import { StatusToggle } from "../features/status/ui/status-toggle"
import { useTags } from "../features/tags"
import { TagEditor } from "../features/tags/ui/tag-editor"
import { useTts } from "../features/tts"
import { TtsPanel } from "../features/tts/ui/tts-panel"
import { AddIcon, ChevronLeftIcon, InboxIcon } from "../shared/ui/icons"

function parseItemIdParam(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null
  }

  return parsed
}

export function InboxScreen(): JSX.Element {
  const navigate = useNavigate()
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

  const { items, loading, error } = useInbox(inboxFilters)
  const { tags: availableTags } = useTags()

  const unreadInView = useMemo(
    () => items.filter((item) => item.status === "unread").length,
    [items],
  )

  const loadingStatusLabel = statusFilter === "all" ? "active" : statusFilter

  const inboxErrorMessage = error?.toLowerCase().includes("failed to fetch")
    ? "Can’t reach the API right now. Make sure `stash web` is running and try again."
    : error

  const clearFilters = (): void => {
    setStatusFilter("unread")
    setSelectedTags([])
    setTagModeFilter("any")
  }

  return (
    <Stack spacing={1.25}>
      <Paper sx={{ p: 1.5 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Stack spacing={0.25}>
              <Typography variant="h4" component="h1">
                stash.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                PWA inbox for saved links and audio playback.
              </Typography>
            </Stack>

            <Button
              component={RouterLink}
              to="/save"
              variant="contained"
              startIcon={<AddIcon />}
              sx={{ alignSelf: "flex-start" }}
            >
              Save
            </Button>
          </Stack>

          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
            <Chip
              size="small"
              icon={<InboxIcon fontSize="small" />}
              label={`${unreadInView} unread in view`}
            />
            {selectedTags.length > 0 ? (
              <Chip
                size="small"
                variant="outlined"
                label={`${selectedTags.length} tag filter${selectedTags.length === 1 ? "" : "s"}`}
              />
            ) : null}
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 1.5 }}>
        <Stack spacing={1.25}>
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

          <Divider />

          {loading ? (
            <Typography variant="body2" color="text.secondary">
              Loading {loadingStatusLabel} items…
            </Typography>
          ) : null}

          {inboxErrorMessage ? (
            <Alert severity="warning" variant="outlined">
              {inboxErrorMessage}
            </Alert>
          ) : null}

          <InboxList
            items={items}
            selectedItemId={null}
            onSelect={(itemId) => {
              navigate(`/item/${itemId}`)
            }}
          />
        </Stack>
      </Paper>
    </Stack>
  )
}

export function SaveScreen(): JSX.Element {
  const navigate = useNavigate()
  const saveState = useSaveItem()

  return (
    <Stack spacing={1.25}>
      <Paper sx={{ p: 1.5 }}>
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <IconButton
              component={RouterLink}
              to="/"
              aria-label="Back to inbox"
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                color: "primary.main",
              }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <Typography variant="h5" component="h1">
              Save link
            </Typography>
          </Stack>
          <Stack spacing={0.25}>
            <Typography variant="body2" color="text.secondary">
              Add a URL, optional tags, and return to inbox after success.
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 1.5 }}>
        <Stack spacing={1.25}>
          <SaveForm
            saving={saveState.saving}
            onSave={async (payload) => {
              await saveState.save(payload)
              navigate("/", { replace: true })
            }}
          />

          {saveState.error ? (
            <Alert severity="error" variant="outlined">
              {saveState.error}
            </Alert>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  )
}

type ItemScreenContentProps = {
  itemId: number
}

function ItemScreenContent({ itemId }: ItemScreenContentProps): JSX.Element {
  const { item, loading, error, refresh } = useItem(itemId)
  const statusState = useStatus()
  const extractState = useExtract()
  const ttsState = useTts()
  const lastCompletedTtsJobIdRef = useRef<number | null>(null)

  useEffect(() => {
    void ttsState.refreshLatestJob(itemId).catch(() => {
      // Hook stores API error state.
    })
  }, [itemId, ttsState.refreshLatestJob])

  useEffect(() => {
    if (ttsState.job?.status !== "succeeded") {
      return
    }
    if (lastCompletedTtsJobIdRef.current === ttsState.job.id) {
      return
    }

    lastCompletedTtsJobIdRef.current = ttsState.job.id
    void refresh()
  }, [ttsState.job, refresh])

  return (
    <Stack spacing={1.25}>
      <Paper sx={{ p: 1.5 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          <Stack spacing={0.25}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <IconButton
                component={RouterLink}
                to="/"
                aria-label="Back to inbox"
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  color: "primary.main",
                  ml: -0.5,
                }}
              >
                <ChevronLeftIcon />
              </IconButton>
              <Typography variant="h5" component="h1">
                Item #{itemId}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Details and actions for one saved link.
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button component={RouterLink} to="/save" variant="outlined" startIcon={<AddIcon />}>
              Save new
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 1.5 }}>
        <ItemDetail item={item} loading={loading} error={error} />
      </Paper>

      {item ? (
        <Paper sx={{ p: 1.5 }}>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1">Actions</Typography>

            <StatusToggle
              itemId={item.id}
              status={item.status}
              loading={statusState.loading}
              onToggle={async (selectedItemId, status) => {
                await statusState.updateStatus(selectedItemId, status)
                await refresh()
              }}
            />

            <TagEditor
              itemId={item.id}
              tags={item.tags}
              onChanged={async () => {
                await refresh()
              }}
            />

            <ExtractButton
              itemId={item.id}
              loading={extractState.loading}
              onExtract={async (selectedItemId, force) => {
                await extractState.runExtract(selectedItemId, force)
                await refresh()
              }}
            />

            <Divider />

            <TtsPanel
              itemId={item.id}
              title={item.title ?? item.url}
              loading={ttsState.loading}
              error={ttsState.error}
              job={ttsState.job}
              hasExtractedContent={item.has_extracted_content}
              ttsAudio={item.tts_audio}
              onGenerate={async (selectedItemId) => {
                try {
                  await ttsState.runTts(selectedItemId)
                } catch {
                  // Hook stores API error state.
                }
                await refresh()
              }}
            />
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  )
}

export function ItemScreen(): JSX.Element {
  const { itemId: itemIdParam } = useParams()
  const itemId = parseItemIdParam(itemIdParam)

  if (itemId === null) {
    return (
      <Stack spacing={1.25}>
        <Paper sx={{ p: 1.5 }}>
          <Stack spacing={1}>
            <Typography variant="h5" component="h1">
              Invalid item id
            </Typography>
            <Alert severity="warning" variant="outlined">
              The route must use a positive numeric item id.
            </Alert>
            <Button component={RouterLink} to="/" variant="contained" sx={{ alignSelf: "flex-start" }}>
              Back to inbox
            </Button>
          </Stack>
        </Paper>
      </Stack>
    )
  }

  return <ItemScreenContent key={itemId} itemId={itemId} />
}
