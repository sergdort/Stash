export type ItemStatus = "unread" | "read" | "archived"

export type StashItem = {
  id: number
  url: string
  title: string | null
  thumbnail_url: string | null
  domain: string | null
  status: ItemStatus
  is_starred: boolean
  tags: string[]
  created_at: string
  updated_at: string
  read_at: string | null
  archived_at: string | null
}
