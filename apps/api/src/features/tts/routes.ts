import fs from "node:fs"
import path from "node:path"

import type { FastifyPluginAsync } from "fastify"

import {
  enqueueTtsJob,
  getTtsJob,
  listTtsJobsForItem,
  waitForTtsJob,
} from "../../../../../packages/core/src/features/tts/jobs.js"
import { StashError } from "../../../../../packages/core/src/errors.js"
import type { ApiRouteOptions } from "../options.js"
import { getSearchParams } from "../../shared/request/search-params.js"
import { parseFileName, parseItemId, parseJobListQuery, parseTtsBody } from "./dto.js"

const ttsItemParamsSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
  },
  required: ["id"],
} as const

const ttsBodySchema = {} as const

const ttsFileParamsSchema = {
  type: "object",
  properties: {
    fileName: { type: "string", minLength: 1 },
  },
  required: ["fileName"],
} as const

const ttsJobListQuerySchema = {
  type: "object",
  properties: {
    limit: { type: "string", pattern: "^[1-9][0-9]*$" },
    offset: { type: "string", pattern: "^[0-9]+$" },
  },
} as const

const ttsAudioQuerySchema = {
  type: "object",
  properties: {
    download: { type: "string", enum: ["1"] },
  },
} as const

function mapJobFailureToHttp(errorCode: string | null): number {
  switch (errorCode) {
    case "NO_CONTENT":
      return 400
    case "NOT_FOUND":
      return 404
    case "TTS_PROVIDER_UNAVAILABLE":
      return 503
    default:
      return 500
  }
}

export const ttsRoutes: FastifyPluginAsync<ApiRouteOptions> = async (fastify, options) => {
  fastify.post(
    "/items/:id/tts",
    {
      schema: {
        params: ttsItemParamsSchema,
        body: ttsBodySchema,
      },
    },
    async (request, reply) => {
      const itemId = parseItemId(request.params as Record<string, string>)
      const body = parseTtsBody(request.body)
      const enqueueInput = {
        itemId,
        voice: body.voice,
      } as {
        itemId: number
        voice: string
        format?: "mp3" | "wav"
      }
      if (body.format !== undefined) {
        enqueueInput.format = body.format
      }

      const enqueue = enqueueTtsJob(
        {
          dbPath: options.dbPath,
          migrationsDir: options.migrationsDir,
        },
        enqueueInput,
      )

      if (body.wait) {
        const job = await waitForTtsJob(
          {
            dbPath: options.dbPath,
            migrationsDir: options.migrationsDir,
          },
          enqueue.job.id,
          {
            pollMs: enqueue.poll_interval_ms,
          },
        )

        if (job.status === "failed") {
          throw new StashError(
            job.error_message ?? "TTS job failed.",
            job.error_code ?? "INTERNAL_ERROR",
            1,
            mapJobFailureToHttp(job.error_code),
          )
        }

        if (!job.output_file_name) {
          throw new StashError("TTS job finished without output file.", "INTERNAL_ERROR", 1, 500)
        }

        return {
          ok: true,
          job,
          playback_url: `/api/audio/${encodeURIComponent(job.output_file_name)}`,
          download_url: `/api/audio/${encodeURIComponent(job.output_file_name)}?download=1`,
        }
      }

      void reply.code(enqueue.created ? 202 : 200)
      return {
        ok: true,
        created: enqueue.created,
        job: enqueue.job,
        poll_interval_ms: enqueue.poll_interval_ms,
        poll_url: `/api/tts-jobs/${enqueue.job.id}`,
      }
    },
  )

  fastify.get(
    "/audio/:fileName",
    {
      schema: {
        params: ttsFileParamsSchema,
        querystring: ttsAudioQuerySchema,
      },
    },
    async (request, reply) => {
      const fileName = parseFileName(request.params as Record<string, string>)
      const filePath = path.join(options.audioDir, fileName)
      const forceDownload = getSearchParams(request).get("download") === "1"

      if (!fs.existsSync(filePath)) {
        throw new StashError("Audio file not found.", "NOT_FOUND", 3, 404)
      }

      const stat = fs.statSync(filePath)
      const totalSize = stat.size
      const contentType = fileName.endsWith(".wav") ? "audio/wav" : "audio/mpeg"

      void reply.header("content-type", contentType)
      void reply.header("accept-ranges", "bytes")
      void reply.header(
        "content-disposition",
        `${forceDownload ? "attachment" : "inline"}; filename="${fileName}"`,
      )

      const range = request.headers.range
      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range)
        if (!match) {
          return reply.code(416).send()
        }

        const start = match[1] ? Number.parseInt(match[1], 10) : 0
        const end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1

        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
          void reply.header("content-range", `bytes */${totalSize}`)
          return reply.code(416).send()
        }

        const clampedEnd = Math.min(end, totalSize - 1)
        const chunkSize = clampedEnd - start + 1

        void reply.code(206)
        void reply.header("content-range", `bytes ${start}-${clampedEnd}/${totalSize}`)
        void reply.header("content-length", String(chunkSize))
        return reply.send(fs.createReadStream(filePath, { start, end: clampedEnd }))
      }

      void reply.code(200)
      void reply.header("content-length", String(totalSize))
      return reply.send(fs.createReadStream(filePath))
    },
  )

  fastify.get(
    "/tts-jobs/:id",
    {
      schema: {
        params: ttsItemParamsSchema,
      },
    },
    async (request) => {
      const jobId = parseItemId(request.params as Record<string, string>)
      const job = getTtsJob(
        {
          dbPath: options.dbPath,
          migrationsDir: options.migrationsDir,
        },
        jobId,
      )

      return {
        ok: true,
        job,
      }
    },
  )

  fastify.get(
    "/items/:id/tts-jobs",
    {
      schema: {
        params: ttsItemParamsSchema,
        querystring: ttsJobListQuerySchema,
      },
    },
    async (request) => {
      const itemId = parseItemId(request.params as Record<string, string>)
      const { limit, offset } = parseJobListQuery(getSearchParams(request))
      const jobs = listTtsJobsForItem(
        {
          dbPath: options.dbPath,
          migrationsDir: options.migrationsDir,
        },
        itemId,
        limit,
        offset,
      )

      return {
        ok: true,
        jobs,
        paging: {
          limit,
          offset,
          returned: jobs.length,
        },
      }
    },
  )
}
