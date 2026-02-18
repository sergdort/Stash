import type { RouteDefinition } from "../../shared/http/types.js"
import { handleInboxList } from "./handlers.js"

export const inboxRoutes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/items",
    handler: handleInboxList,
  },
]
