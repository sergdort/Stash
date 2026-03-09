import { inspectAutoTagsHealth } from "../features/auto-tags/doctor.js"
import { extractItem } from "../features/extract/service.js"
import { getItem, listItems, saveItem } from "../features/items/service.js"
import { markRead, markUnread } from "../features/status/service.js"
import { addTag, listTags, removeTag } from "../features/tags/service.js"
import { inspectCoquiTtsHealth } from "../features/tts/doctor.js"
import {
  enqueueTtsJob,
  getTtsJob,
  listTtsJobsForItem,
  runTtsWorkerOnce,
  startTtsWorker,
  waitForTtsJob,
} from "../features/tts/jobs.js"
import type { StashDb } from "../db/client.js"
import type { CoreServices } from "./contracts.js"

export type CreateCoreServicesOptions = {
  db: StashDb
}

export function createCoreServices(options: CreateCoreServicesOptions): CoreServices {
  const { db } = options

  return {
    items: {
      saveItem: async (input) => await saveItem(db, input),
      listItems: (input) => listItems(db, input),
      getItem: (itemId) => getItem(db, itemId),
    },
    extract: {
      extractItem: async (itemId, options = {}) => await extractItem(db, itemId, options),
    },
    tags: {
      listTags: (input) => listTags(db, input),
      addTag: (itemId, tag) => addTag(db, itemId, tag),
      removeTag: (itemId, tag) => removeTag(db, itemId, tag),
    },
    status: {
      markRead: (itemId) => markRead(db, itemId),
      markUnread: (itemId) => markUnread(db, itemId),
    },
    ttsJobs: {
      enqueueTtsJob: (input) => enqueueTtsJob(db, input),
      getTtsJob: (jobId) => getTtsJob(db, jobId),
      listTtsJobsForItem: (itemId, limit, offset) => listTtsJobsForItem(db, itemId, limit, offset),
      waitForTtsJob: async (jobId, options) => await waitForTtsJob(db, jobId, options),
      startTtsWorker: (options) => startTtsWorker(db, options),
      runTtsWorkerOnce: async (options = {}) => await runTtsWorkerOnce(db, options),
    },
    doctor: {
      inspectCoquiTtsHealth: () => inspectCoquiTtsHealth(),
      inspectAutoTagsHealth: () => inspectAutoTagsHealth(),
    },
  }
}
