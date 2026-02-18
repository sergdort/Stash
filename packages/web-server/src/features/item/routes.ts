import type { RouteDefinition } from "../../shared/http/types.js"
import { handleGetItem } from "./handlers.js"

export const itemRoutes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/items/:id",
    handler: handleGetItem,
  },
]
