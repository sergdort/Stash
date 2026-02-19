export type ItemStatus = "unread" | "read" | "archived"

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
