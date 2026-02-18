import type { RouteDefinition } from "../../shared/http/types.js"
import { handleSetStatus } from "./handlers.js"

export const statusRoutes: RouteDefinition[] = [
  {
    method: "PATCH",
    path: "/api/items/:id/status",
    handler: handleSetStatus,
  },
]
