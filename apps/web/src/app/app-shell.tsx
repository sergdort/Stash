import { useMemo, useState } from "react"

import { ExtractButton, useExtract } from "../features/extract"
import { InboxList, useInbox } from "../features/inbox"
import { ItemDetail, useItem } from "../features/item"
import { SaveForm, useSaveItem } from "../features/save"
import { StatusToggle, useStatus } from "../features/status"
import { TagEditor } from "../features/tags"
import { TtsPanel, useTts } from "../features/tts"
import { Panel } from "../shared/ui/panel"

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
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f3f4f6 0%, #e5e7eb 100%)",
        padding: 16,
      }}
    >
      <h1 style={{ marginTop: 0 }}>stash web</h1>

      <section style={{ marginBottom: 16 }}>
        <Panel>
          <SaveForm
            saving={saveState.saving}
            onSave={async (payload) => {
              await saveState.save(payload)
              await refresh()
            }}
          />
          {saveState.error ? <p style={{ color: "#b91c1c" }}>{saveState.error}</p> : null}
        </Panel>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 420px) 1fr",
          gap: 16,
        }}
      >
        <Panel>
          <h2 style={{ marginTop: 0 }}>Inbox</h2>
          {loading ? <p>Loading...</p> : null}
          {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
          <InboxList items={items} selectedItemId={selectedId} onSelect={setSelectedItemId} />
        </Panel>

        <Panel>
          <ItemDetail item={item} />
          {item ? (
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
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
            </div>
          ) : null}
        </Panel>
      </section>
    </main>
  )
}
