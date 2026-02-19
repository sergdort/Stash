import type { RouteDefinition } from "../../shared/http/types.js"
import {
  handleGenerateTts,
  handleGetAudioFile,
  handleGetTtsJob,
  handleListItemTtsJobs,
} from "./handlers.js"

export const ttsRoutes: RouteDefinition[] = [
  {
    method: "POST",
    path: "/api/items/:id/tts",
    handler: handleGenerateTts,
  },
  {
    method: "GET",
    path: "/api/audio/:fileName",
    handler: handleGetAudioFile,
  },
  {
    method: "GET",
    path: "/api/tts-jobs/:id",
    handler: handleGetTtsJob,
  },
  {
    method: "GET",
    path: "/api/items/:id/tts-jobs",
    handler: handleListItemTtsJobs,
  },
]
