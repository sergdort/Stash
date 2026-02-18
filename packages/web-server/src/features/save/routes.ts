import type { RouteDefinition } from "../../shared/http/types.js"
import { handleSaveItem } from "./handlers.js"

export const saveRoutes: RouteDefinition[] = [
  {
    method: "POST",
    path: "/api/items",
    handler: handleSaveItem,
  },
]
