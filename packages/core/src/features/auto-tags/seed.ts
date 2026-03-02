import fs from "node:fs"

import type { SeedTag, SeedTagsConfig } from "./types.js"

export function loadSeedTags(seedTagsPath: string): SeedTag[] {
  try {
    const raw = fs.readFileSync(seedTagsPath, "utf-8")
    const parsed = JSON.parse(raw) as SeedTagsConfig
    if (!Array.isArray(parsed.tags)) {
      return []
    }

    return parsed.tags
      .filter(
        (value): value is SeedTag =>
          value !== null &&
          typeof value === "object" &&
          typeof value.tag === "string" &&
          typeof value.descriptor === "string",
      )
      .map((value) => ({
        tag: value.tag,
        descriptor: value.descriptor,
      }))
  } catch {
    return []
  }
}
