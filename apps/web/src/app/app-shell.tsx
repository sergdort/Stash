import { useMemo, useState } from "react"
import {
  Alert,
  Box,
  Chip,
  Container,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material"

import { ExtractButton, useExtract } from "../features/extract"
import { InboxList, useInbox } from "../features/inbox"
import { ItemDetail, useItem } from "../features/item"
import { SaveForm, useSaveItem } from "../features/save"
import { StatusToggle, useStatus } from "../features/status"
import { TagEditor } from "../features/tags"
import { TtsPanel, useTts } from "../features/tts"
import { ArticleIcon, InboxIcon, StatusIcon } from "../shared/ui/icons"

export function AppShell(): JSX.Element {
  const { items, loading, error, refresh } = useInbox()
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const selectedId = useMemo(() => selectedItemId ?? items[0]?.id ?? null, [items, selectedItemId])

  const { item, loading: itemLoading, error: itemError, refresh: refreshItem } = useItem(selectedId)
  const saveState = useSaveItem()
  const statusState = useStatus()
  const extractState = useExtract()
  const ttsState = useTts()

  const refreshAll = async (): Promise<void> => {
    await refresh()
    await refreshItem()
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
                  <Chip size="small" icon={<InboxIcon fontSize="small" />} label={`${items.length} unread`} />
                  <Chip size="small" color="warning" icon={<StatusIcon fontSize="small" />} label="Light mode" />
                </Stack>
              </Stack>

              <SaveForm
                saving={saveState.saving}
                onSave={async (payload) => {
                  await saveState.save(payload)
                  await refresh()
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
                  {loading ? (
                    <Typography variant="body2" color="text.secondary">
                      Loading unread items...
                    </Typography>
                  ) : null}
                  {error ? (
                    <Typography variant="body2" color="error.main" role="status">
                      {error}
                    </Typography>
                  ) : null}
                  <InboxList items={items} selectedItemId={selectedId} onSelect={setSelectedItemId} />
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
