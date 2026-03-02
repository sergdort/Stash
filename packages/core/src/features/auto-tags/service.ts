import { and, eq } from "drizzle-orm"

import * as schema from "../../db/schema.js"
import type { Db } from "../common/db.js"
import { ensureTagId, normalizeTag } from "../common/db.js"
import { resolveAutoTagConfig } from "./config.js"
import { scoreTagsWithPython } from "./python.js"
import { scoreTagsWithRules, shouldSkipTag } from "./rules.js"
import { loadSeedTags } from "./seed.js"
import type {
  AutoTagApplyResult,
  AutoTagCandidate,
  AutoTagInput,
  AutoTagScore,
  AutoTagSource,
} from "./types.js"

type AutoTagWriteDb = Pick<Db, "insert" | "update" | "delete" | "select">

function buildContentExcerpt(content: string | null): string {
  const normalized = (content ?? "").replaceAll(/\s+/g, " ").trim()
  if (normalized.length <= 2000) {
    return normalized
  }
  return normalized.slice(0, 2000)
}

function buildUrlTokens(url: string): string {
  try {
    const parsed = new URL(url)
    const tokens = `${parsed.hostname} ${parsed.pathname}`
      .toLowerCase()
      .split(/[^a-z0-9-]+/g)
      .filter((value) => value.length > 1)
    return tokens.join(" ")
  } catch {
    return url
  }
}

function buildTextInput(input: AutoTagInput): string {
  const excerpt = buildContentExcerpt(input.content)
  const urlTokens = buildUrlTokens(input.url)

  return [
    `Title: ${input.title ?? ""}`,
    `Domain: ${input.domain ?? ""}`,
    `URL: ${urlTokens}`,
    `Content: ${excerpt}`,
  ].join("\n")
}

function normalizeCandidateTag(value: string): string | null {
  try {
    const normalized = normalizeTag(value)
    if (shouldSkipTag(normalized)) {
      return null
    }
    return normalized
  } catch {
    return null
  }
}

function buildCandidates(db: Db, seedTagsPath: string): AutoTagCandidate[] {
  const byTag = new Map<string, AutoTagCandidate>()
  const seed = loadSeedTags(seedTagsPath)

  for (const row of seed) {
    const tag = normalizeCandidateTag(row.tag)
    if (!tag) {
      continue
    }
    byTag.set(tag, {
      tag,
      descriptor: row.descriptor,
    })
  }

  const userRows = db
    .selectDistinct({
      name: schema.tags.name,
    })
    .from(schema.itemTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.itemTags.tagId))
    .where(eq(schema.itemTags.isManual, true))
    .all()

  for (const row of userRows) {
    const tag = normalizeCandidateTag(row.name)
    if (!tag) {
      continue
    }
    if (byTag.has(tag)) {
      continue
    }
    byTag.set(tag, {
      tag,
      descriptor: tag,
    })
  }

  return [...byTag.values()].sort((a, b) => a.tag.localeCompare(b.tag))
}

function pickTopScores(scores: AutoTagScore[], minScore: number, maxTags: number): AutoTagScore[] {
  return scores
    .filter((score) => score.score >= minScore)
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, maxTags)
}

function sanitizeScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0
  }
  if (score <= 0) {
    return 0
  }
  if (score >= 1) {
    return 1
  }
  return score
}

async function scoreCandidates(
  input: AutoTagInput,
  candidates: AutoTagCandidate[],
): Promise<{
  backend: "python" | "rule"
  warning?: string
  scores: AutoTagScore[]
}> {
  const config = resolveAutoTagConfig()
  const text = buildTextInput(input)
  const ruleScores = scoreTagsWithRules({
    text,
    domain: input.domain,
    candidates,
  })
  const ruleMap = new Map<string, number>(ruleScores.map((row) => [row.tag, row.score]))

  if (config.backend !== "python") {
    return {
      backend: "rule",
      scores: ruleScores,
    }
  }

  if (!config.pythonBin) {
    return {
      backend: "rule",
      warning: "Auto-tags python backend is unavailable; fell back to rule scoring.",
      scores: ruleScores,
    }
  }

  try {
    const embeddingMap = await scoreTagsWithPython({
      pythonBin: config.pythonBin,
      helperPath: config.helperPath,
      model: config.model,
      text,
      candidates,
    })

    const merged: AutoTagScore[] = []
    for (const candidate of candidates) {
      const embedding = embeddingMap.get(candidate.tag)
      const rule = ruleMap.get(candidate.tag) ?? 0
      if (embedding === undefined) {
        merged.push({
          tag: candidate.tag,
          score: sanitizeScore(rule),
          source: "rule",
        })
        continue
      }

      merged.push({
        tag: candidate.tag,
        score: sanitizeScore(embedding + rule * 0.15),
        source: "embedding",
      })
    }

    return {
      backend: "python",
      scores: merged,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      backend: "rule",
      warning: `Auto-tags python backend failed; fell back to rule scoring (${message}).`,
      scores: ruleScores,
    }
  }
}

function upsertAutoTag(
  db: AutoTagWriteDb,
  itemId: number,
  tag: string,
  score: number,
  source: AutoTagSource,
  timestamp: Date,
  model: string,
): void {
  const tagId = ensureTagId(db, tag, timestamp)
  db.insert(schema.itemTags)
    .values({
      itemId,
      tagId,
      createdAt: timestamp,
      isManual: false,
      isAuto: true,
      autoScore: score,
      autoSource: source,
      autoModel: model,
      autoUpdatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [schema.itemTags.itemId, schema.itemTags.tagId],
      set: {
        isAuto: true,
        autoScore: score,
        autoSource: source,
        autoModel: model,
        autoUpdatedAt: timestamp,
      },
    })
    .run()
}

function pruneStaleAutoTags(db: AutoTagWriteDb, itemId: number, keep: Set<string>): void {
  const rows = db
    .select({
      tagId: schema.itemTags.tagId,
      tag: schema.tags.name,
      isManual: schema.itemTags.isManual,
      isAuto: schema.itemTags.isAuto,
    })
    .from(schema.itemTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.itemTags.tagId))
    .where(and(eq(schema.itemTags.itemId, itemId), eq(schema.itemTags.isAuto, true)))
    .all()

  for (const row of rows) {
    if (keep.has(row.tag)) {
      continue
    }

    if (row.isManual) {
      db.update(schema.itemTags)
        .set({
          isAuto: false,
          autoScore: null,
          autoSource: null,
          autoModel: null,
          autoUpdatedAt: null,
        })
        .where(and(eq(schema.itemTags.itemId, itemId), eq(schema.itemTags.tagId, row.tagId)))
        .run()
      continue
    }

    db.delete(schema.itemTags)
      .where(and(eq(schema.itemTags.itemId, itemId), eq(schema.itemTags.tagId, row.tagId)))
      .run()
  }
}

export async function applyAutoTags(db: Db, input: AutoTagInput): Promise<AutoTagApplyResult> {
  const config = resolveAutoTagConfig()
  const candidates = buildCandidates(db, config.seedTagsPath)
  if (candidates.length === 0) {
    return {
      applied: [],
      scores: [],
      backend: "rule",
      warning: "No candidate tags available for auto-tagging.",
    }
  }

  const ranked = await scoreCandidates(input, candidates)
  const selected = pickTopScores(ranked.scores, config.minScore, config.maxTags)
  const selectedSet = new Set(selected.map((row) => row.tag))
  const timestamp = new Date()

  db.transaction((tx) => {
    for (const row of selected) {
      upsertAutoTag(tx, input.itemId, row.tag, row.score, row.source, timestamp, config.model)
    }
    pruneStaleAutoTags(tx, input.itemId, selectedSet)
  })

  const result: AutoTagApplyResult = {
    applied: selected.map((row) => row.tag),
    scores: selected,
    backend: ranked.backend,
  }
  if (ranked.warning) {
    result.warning = ranked.warning
  }

  return result
}
