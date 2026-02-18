import type { RouteDefinition } from "../../shared/http/types.js"
import { handleExtractItem } from "./handlers.js"

export const extractRoutes: RouteDefinition[] = [
  {
    method: "POST",
    path: "/api/items/:id/extract",
    handler: handleExtractItem,
  },
]
