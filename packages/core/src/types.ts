export type ItemStatus = "unread" | "read" | "archived"
export type ListItemsStatusFilter = ItemStatus | "active"
export type TagMode = "any" | "all"

export type ItemTtsAudio = {
  file_name: string
  format: "mp3" | "wav"
  provider: string
  voice: string
  bytes: number
  generated_at: string
}

export type StashItem = {
  id: number
  url: string
  title: string | null
  thumbnail_url: string | null
  domain: string | null
  status: ItemStatus
  is_starred: boolean
  has_extracted_content: boolean
  tts_audio: ItemTtsAudio | null
  tags: string[]
  created_at: string
  updated_at: string
  read_at: string | null
  archived_at: string | null
}

export type Paging = {
  limit: number
  offset: number
  returned: number
}

export type ListItemsInput = {
  status?: ListItemsStatusFilter
  tags?: string[]
  tagMode?: TagMode
  limit?: number
  offset?: number
}

export type ListItemsResult = {
  items: StashItem[]
  paging: Paging
}

export type SaveItemInput = {
  url: string
  title?: string
  tags?: string[]
  extract?: boolean
}

export type SaveItemResult = {
  created: boolean
  item: StashItem
}

export type TagsListInput = {
  limit?: number
  offset?: number
}

export type TagsListResult = {
  tags: Array<{ name: string; item_count: number }>
  paging: Paging
}

export type ExtractItemResult = {
  item_id: number
  title_extracted: string | null
  title_updated: boolean
  content_length: number
  updated_at: string
}

export type TtsResult = {
  item_id: number
  provider: string
  voice: string
  format: "mp3" | "wav"
  output_path: string
  file_name: string
  bytes: number
}

export type TtsJobStatus = "queued" | "running" | "succeeded" | "failed"

export type TtsJob = {
  id: number
  item_id: number
  status: TtsJobStatus
  voice: string
  format: "mp3" | "wav"
  error_code: string | null
  error_message: string | null
  output_file_name: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  updated_at: string
}

export type OperationContext = {
  dbPath: string
  migrationsDir: string
}
