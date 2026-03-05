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
import type { OperationContext } from "../types.js"
import type { CoreServices } from "./contracts.js"

export function createCoreServices(context: OperationContext): CoreServices {
  return {
    items: {
      saveItem: async (input) => await saveItem(context, input),
      listItems: (input) => listItems(context, input),
      getItem: (itemId) => getItem(context, itemId),
    },
    extract: {
      extractItem: async (itemId, options = {}) => await extractItem(context, itemId, options),
    },
    tags: {
      listTags: (input) => listTags(context, input),
      addTag: (itemId, tag) => addTag(context, itemId, tag),
      removeTag: (itemId, tag) => removeTag(context, itemId, tag),
    },
    status: {
      markRead: (itemId) => markRead(context, itemId),
      markUnread: (itemId) => markUnread(context, itemId),
    },
    ttsJobs: {
      enqueueTtsJob: (input) => enqueueTtsJob(context, input),
      getTtsJob: (jobId) => getTtsJob(context, jobId),
      listTtsJobsForItem: (itemId, limit, offset) =>
        listTtsJobsForItem(context, itemId, limit, offset),
      waitForTtsJob: async (jobId, options) => await waitForTtsJob(context, jobId, options),
      startTtsWorker: (options) => startTtsWorker(context, options),
      runTtsWorkerOnce: async (options = {}) => await runTtsWorkerOnce(context, options),
    },
    doctor: {
      inspectCoquiTtsHealth: () => inspectCoquiTtsHealth(),
      inspectAutoTagsHealth: () => inspectAutoTagsHealth(),
    },
  }
}
