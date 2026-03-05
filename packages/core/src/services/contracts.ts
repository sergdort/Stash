import type { AutoTagsDoctorReport } from "../features/auto-tags/types.js"
import type {
  EnqueueTtsJobInput,
  EnqueueTtsJobResult,
  TtsWorkerHandle,
  TtsWorkerOptions,
} from "../features/tts/jobs.js"
import type { TtsDoctorReport } from "../features/tts/doctor.js"
import type {
  ExtractItemOptions,
  ExtractItemResult,
  ListItemsInput,
  ListItemsResult,
  SaveItemInput,
  SaveItemResult,
  TagsListInput,
  TagsListResult,
  TtsJob,
} from "../types.js"

export type TagAddResult = {
  item_id: number
  tag: string
  added: boolean
}

export type TagRemoveResult = {
  item_id: number
  tag: string
  removed: boolean
}

export type MarkReadResult = {
  item_id: number
  action: "mark_read"
  status: "read"
}

export type MarkUnreadResult = {
  item_id: number
  action: "mark_unread"
  status: "unread"
}

export interface ItemsService {
  saveItem(input: SaveItemInput): Promise<SaveItemResult>
  listItems(input: ListItemsInput): ListItemsResult
  getItem(itemId: number): SaveItemResult["item"] | undefined
}

export interface ExtractService {
  extractItem(itemId: number, options?: ExtractItemOptions): Promise<ExtractItemResult>
}

export interface TagsService {
  listTags(input: TagsListInput): TagsListResult
  addTag(itemId: number, tag: string): TagAddResult
  removeTag(itemId: number, tag: string): TagRemoveResult
}

export interface StatusService {
  markRead(itemId: number): MarkReadResult
  markUnread(itemId: number): MarkUnreadResult
}

export interface TtsJobsService {
  enqueueTtsJob(input: EnqueueTtsJobInput): EnqueueTtsJobResult
  getTtsJob(jobId: number): TtsJob
  listTtsJobsForItem(itemId: number, limit?: number, offset?: number): TtsJob[]
  waitForTtsJob(jobId: number, options?: { pollMs?: number; timeoutMs?: number }): Promise<TtsJob>
  startTtsWorker(options?: TtsWorkerOptions): TtsWorkerHandle
  runTtsWorkerOnce(options?: { audioDir?: string }): Promise<TtsJob | null>
}

export interface TtsDoctorService {
  inspectCoquiTtsHealth(): TtsDoctorReport
}

export interface AutoTagsDoctorService {
  inspectAutoTagsHealth(): AutoTagsDoctorReport
}

export interface DoctorService extends TtsDoctorService, AutoTagsDoctorService {}

export interface CoreServices {
  items: ItemsService
  extract: ExtractService
  tags: TagsService
  status: StatusService
  ttsJobs: TtsJobsService
  doctor: DoctorService
}
