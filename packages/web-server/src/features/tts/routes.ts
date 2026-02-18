import type { RouteDefinition } from "../../shared/http/types.js"
import { handleGenerateTts, handleGetAudioFile } from "./handlers.js"

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
]
