import { useMemo, useState } from "react"
import {
  Box,
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

export function AppShell(): JSX.Element {
  const { items, loading, error, refresh } = useInbox()
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const selectedId = useMemo(() => selectedItemId ?? items[0]?.id ?? null, [items, selectedItemId])

  const { item, refresh: refreshItem } = useItem(selectedId)
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
        background: "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
        py: { xs: 2, md: 3 },
      }}
    >
      <Container maxWidth="xl">
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }}>
            <Stack spacing={1.5}>
              <Typography variant="h4">stash web</Typography>
              <SaveForm
                saving={saveState.saving}
                onSave={async (payload) => {
                  await saveState.save(payload)
                  await refresh()
                }}
              />
              {saveState.error ? (
                <Typography variant="body2" color="error.main">
                  {saveState.error}
                </Typography>
              ) : null}
            </Stack>
          </Paper>

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                md: "minmax(280px, 420px) 1fr",
              },
            }}
          >
            <Box>
              <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
                <Stack spacing={1}>
                  <Typography variant="h6">Inbox</Typography>
                  {loading ? (
                    <Typography variant="body2" color="text.secondary">
                      Loading...
                    </Typography>
                  ) : null}
                  {error ? (
                    <Typography variant="body2" color="error.main">
                      {error}
                    </Typography>
                  ) : null}
                  <InboxList items={items} selectedItemId={selectedId} onSelect={setSelectedItemId} />
                </Stack>
              </Paper>
            </Box>

            <Box>
              <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
                <Stack spacing={1.5}>
                  <ItemDetail item={item} />
                  {item ? (
                    <>
                      <Divider />
                      <Stack spacing={1.25}>
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
