import { afterEach, describe, expect, it, vi } from "vitest"

import * as autoTagsDoctorModule from "../src/features/auto-tags/doctor.js"
import * as extractModule from "../src/features/extract/service.js"
import * as itemsModule from "../src/features/items/service.js"
import * as statusModule from "../src/features/status/service.js"
import * as tagsModule from "../src/features/tags/service.js"
import * as ttsDoctorModule from "../src/features/tts/doctor.js"
import * as ttsJobsModule from "../src/features/tts/jobs.js"
import { createCoreServices } from "../src/services/create-core-services.js"
import type { TtsJob } from "../src/types.js"

afterEach(() => {
  vi.restoreAllMocks()
})

const context = {
  dbPath: "/tmp/stash-test.db",
  migrationsDir: "/tmp/stash-migrations",
}

function buildTtsJob(id: number): TtsJob {
  return {
    id,
    item_id: 1,
    status: "queued",
    voice: "voice",
    format: "mp3",
    error_code: null,
    error_message: null,
    output_file_name: null,
    created_at: new Date(0).toISOString(),
    started_at: null,
    finished_at: null,
    updated_at: new Date(0).toISOString(),
  }
}

describe("createCoreServices", () => {
  it("delegates all service methods to existing feature functions with bound context", async () => {
    const saveSpy = vi.spyOn(itemsModule, "saveItem").mockResolvedValue({
      created: true,
      item: {} as never,
    })
    const listSpy = vi.spyOn(itemsModule, "listItems").mockReturnValue({
      items: [],
      paging: { limit: 20, offset: 0, returned: 0 },
    })
    const getItemSpy = vi.spyOn(itemsModule, "getItem").mockReturnValue(undefined)

    const extractSpy = vi.spyOn(extractModule, "extractItem").mockResolvedValue({
      item_id: 1,
      title_extracted: null,
      title_updated: false,
      content_length: 0,
      updated_at: new Date(0).toISOString(),
    })

    const listTagsSpy = vi.spyOn(tagsModule, "listTags").mockReturnValue({
      tags: [],
      paging: { limit: 50, offset: 0, returned: 0 },
    })
    const addTagSpy = vi.spyOn(tagsModule, "addTag").mockReturnValue({
      item_id: 1,
      tag: "ai",
      added: true,
    })
    const removeTagSpy = vi.spyOn(tagsModule, "removeTag").mockReturnValue({
      item_id: 1,
      tag: "ai",
      removed: true,
    })

    const markReadSpy = vi.spyOn(statusModule, "markRead").mockReturnValue({
      item_id: 1,
      action: "mark_read",
      status: "read",
    })
    const markUnreadSpy = vi.spyOn(statusModule, "markUnread").mockReturnValue({
      item_id: 1,
      action: "mark_unread",
      status: "unread",
    })

    const enqueueSpy = vi.spyOn(ttsJobsModule, "enqueueTtsJob").mockReturnValue({
      created: true,
      poll_interval_ms: 1500,
      job: buildTtsJob(10),
    })
    const getJobSpy = vi.spyOn(ttsJobsModule, "getTtsJob").mockReturnValue(buildTtsJob(10))
    const listJobsSpy = vi.spyOn(ttsJobsModule, "listTtsJobsForItem").mockReturnValue([])
    const waitSpy = vi.spyOn(ttsJobsModule, "waitForTtsJob").mockResolvedValue({
      ...buildTtsJob(10),
      status: "succeeded",
    })
    const workerHandle = {
      stop: async (): Promise<void> => {},
    }
    const startWorkerSpy = vi.spyOn(ttsJobsModule, "startTtsWorker").mockReturnValue(workerHandle)
    const runOnceSpy = vi.spyOn(ttsJobsModule, "runTtsWorkerOnce").mockResolvedValue(null)

    const ttsDoctorSpy = vi.spyOn(ttsDoctorModule, "inspectCoquiTtsHealth").mockReturnValue({
      provider: "coqui",
      healthy: true,
      checks: [],
      coqui_cli_features: {
        supports_text_file: true,
        supports_progress_bar: true,
      },
      invocation_strategy: "text_file_then_fallback_text",
    })
    const autoTagsDoctorSpy = vi
      .spyOn(autoTagsDoctorModule, "inspectAutoTagsHealth")
      .mockReturnValue({
        backend: "rule",
        healthy: true,
        model: "rule",
        helper_path: "/tmp/helper.py",
        python_path: null,
        checks: [],
      })

    const services = createCoreServices(context)

    const saveInput = { url: "https://example.com" }
    const listInput = { limit: 5, offset: 0 }
    const extractOptions = { force: true }
    const listTagsInput = { limit: 10, offset: 1 }
    const enqueueInput = { itemId: 1, format: "mp3" as const }
    const waitOptions = { pollMs: 500 }
    const startWorkerOptions = { pollMs: 1500 }
    const runOnceOptions = { audioDir: "/tmp/audio" }

    await services.items.saveItem(saveInput)
    services.items.listItems(listInput)
    services.items.getItem(1)

    await services.extract.extractItem(1, extractOptions)

    services.tags.listTags(listTagsInput)
    services.tags.addTag(1, "ai")
    services.tags.removeTag(1, "ai")

    services.status.markRead(1)
    services.status.markUnread(1)

    services.ttsJobs.enqueueTtsJob(enqueueInput)
    services.ttsJobs.getTtsJob(10)
    services.ttsJobs.listTtsJobsForItem(1, 10, 0)
    await services.ttsJobs.waitForTtsJob(10, waitOptions)
    services.ttsJobs.startTtsWorker(startWorkerOptions)
    await services.ttsJobs.runTtsWorkerOnce(runOnceOptions)

    services.doctor.inspectCoquiTtsHealth()
    services.doctor.inspectAutoTagsHealth()

    expect(saveSpy).toHaveBeenCalledWith(context, saveInput)
    expect(listSpy).toHaveBeenCalledWith(context, listInput)
    expect(getItemSpy).toHaveBeenCalledWith(context, 1)

    expect(extractSpy).toHaveBeenCalledWith(context, 1, extractOptions)

    expect(listTagsSpy).toHaveBeenCalledWith(context, listTagsInput)
    expect(addTagSpy).toHaveBeenCalledWith(context, 1, "ai")
    expect(removeTagSpy).toHaveBeenCalledWith(context, 1, "ai")

    expect(markReadSpy).toHaveBeenCalledWith(context, 1)
    expect(markUnreadSpy).toHaveBeenCalledWith(context, 1)

    expect(enqueueSpy).toHaveBeenCalledWith(context, enqueueInput)
    expect(getJobSpy).toHaveBeenCalledWith(context, 10)
    expect(listJobsSpy).toHaveBeenCalledWith(context, 1, 10, 0)
    expect(waitSpy).toHaveBeenCalledWith(context, 10, waitOptions)
    expect(startWorkerSpy).toHaveBeenCalledWith(context, startWorkerOptions)
    expect(runOnceSpy).toHaveBeenCalledWith(context, runOnceOptions)

    expect(ttsDoctorSpy).toHaveBeenCalled()
    expect(autoTagsDoctorSpy).toHaveBeenCalled()
  })
})
