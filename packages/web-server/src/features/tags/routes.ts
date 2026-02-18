import type { RouteDefinition } from "../../shared/http/types.js"
import { handleAddTag, handleListTags, handleRemoveTag } from "./handlers.js"

export const tagsRoutes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/tags",
    handler: handleListTags,
  },
  {
    method: "POST",
    path: "/api/items/:id/tags",
    handler: handleAddTag,
  },
  {
    method: "DELETE",
    path: "/api/items/:id/tags/:tag",
    handler: handleRemoveTag,
  },
]
