import type { ExtractedContent } from "./extract.js"

type JsonRecord = Record<string, unknown>

const X_STATUS_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
])

const X_API_BASE_URL = "https://api.x.com"
const X_EXTRACT_TIMEOUT_MS = 10_000

const X_TWEET_FIELDS = [
  "article",
  "attachments",
  "author_id",
  "created_at",
  "entities",
  "note_tweet",
  "text",
].join(",")

const X_EXPANSIONS = [
  "author_id",
  "attachments.media_keys",
  "article.cover_media",
  "article.media_entities",
].join(",")

const X_USER_FIELDS = ["username", "name"].join(",")
const X_MEDIA_FIELDS = [
  "media_key",
  "type",
  "url",
  "preview_image_url",
  "width",
  "height",
  "alt_text",
].join(",")

export interface XStatusUrlMatch {
  host: string
  postId: string
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null
}

function getRecord(value: unknown, key: string): JsonRecord | undefined {
  if (!isRecord(value)) return undefined
  const candidate = value[key]
  return isRecord(candidate) ? candidate : undefined
}

function getArray(value: unknown, key: string): unknown[] | undefined {
  if (!isRecord(value)) return undefined
  const candidate = value[key]
  return Array.isArray(candidate) ? candidate : undefined
}

function getString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined
  const candidate = value[key]
  return typeof candidate === "string" ? candidate : undefined
}

function normalizeText(text: string | null | undefined): string | undefined {
  if (!text) return undefined
  const normalized = text.replace(/\r\n?/g, "\n").trim()
  return normalized.length > 0 ? normalized : undefined
}

function normalizeHttpUrl(candidate: string | null | undefined): string | undefined {
  if (!candidate) return undefined
  const trimmed = candidate.trim()
  if (trimmed.length === 0) return undefined

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined
    return parsed.toString()
  } catch {
    return undefined
  }
}

export function parseXStatusUrl(inputUrl: string): XStatusUrlMatch | null {
  let url: URL
  try {
    url = new URL(inputUrl)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  if (!X_STATUS_HOSTS.has(host)) {
    return null
  }

  const segments = url.pathname.split("/").filter(Boolean)
  if (segments.length < 3) {
    return null
  }

  const statusSegment = segments[1]?.toLowerCase()
  const postId = segments[2] ?? ""
  if (statusSegment !== "status" || !/^\d+$/.test(postId)) {
    return null
  }

  return { host, postId }
}

function createXLookupUrl(postId: string): string {
  const url = new URL(`/2/tweets/${postId}`, X_API_BASE_URL)
  url.searchParams.set("tweet.fields", X_TWEET_FIELDS)
  url.searchParams.set("expansions", X_EXPANSIONS)
  url.searchParams.set("user.fields", X_USER_FIELDS)
  url.searchParams.set("media.fields", X_MEDIA_FIELDS)
  return url.toString()
}

function buildMediaMap(includes: JsonRecord | undefined): Map<string, JsonRecord> {
  const map = new Map<string, JsonRecord>()
  const mediaList = getArray(includes, "media") ?? []

  for (const media of mediaList) {
    if (!isRecord(media)) continue
    const mediaKey = getString(media, "media_key")
    if (!mediaKey) continue
    map.set(mediaKey, media)
  }

  return map
}

function getMediaUrl(media: JsonRecord | undefined): string | undefined {
  if (!media) return undefined
  return (
    normalizeHttpUrl(getString(media, "url")) ??
    normalizeHttpUrl(getString(media, "preview_image_url"))
  )
}

function resolveMediaRef(ref: unknown, mediaByKey: Map<string, JsonRecord>): string | undefined {
  if (typeof ref === "string") {
    return normalizeHttpUrl(ref) ?? getMediaUrl(mediaByKey.get(ref))
  }

  if (!isRecord(ref)) {
    return undefined
  }

  const mediaKey = getString(ref, "media_key")
  if (mediaKey) {
    return getMediaUrl(mediaByKey.get(mediaKey)) ?? getMediaUrl(ref)
  }

  return getMediaUrl(ref)
}

function resolveMediaRefList(
  value: unknown,
  mediaByKey: Map<string, JsonRecord>,
): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = resolveMediaRef(item, mediaByKey)
      if (resolved) return resolved
    }
    return undefined
  }

  return resolveMediaRef(value, mediaByKey)
}

function getArticleTitle(article: JsonRecord): string | undefined {
  const titleCandidates = [
    getString(article, "title"),
    getString(article, "headline"),
    getString(article, "display_title"),
    getString(article, "name"),
  ]

  for (const candidate of titleCandidates) {
    const normalized = normalizeText(candidate)
    if (normalized) return normalized
  }

  return undefined
}

const ARTICLE_TEXT_KEYS = [
  "full_text",
  "article_text",
  "body",
  "content",
  "text",
  "paragraphs",
  "sections",
  "blocks",
  "items",
  "children",
  "value",
] as const

function collectArticleTextFragments(
  value: unknown,
  fragments: string[],
  depth: number,
): void {
  if (depth > 6 || value === null || value === undefined) {
    return
  }

  if (typeof value === "string") {
    const normalized = normalizeText(value)
    if (normalized) {
      fragments.push(normalized)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectArticleTextFragments(item, fragments, depth + 1)
    }
    return
  }

  if (!isRecord(value)) {
    return
  }

  const preferredKeys = ARTICLE_TEXT_KEYS.filter((key) => key in value)
  for (const key of preferredKeys) {
    collectArticleTextFragments(value[key], fragments, depth + 1)
  }

  if (preferredKeys.length > 0) {
    return
  }
}

function dedupeOrdered(values: string[]): string[] {
  const deduped: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    deduped.push(value)
  }

  return deduped
}

function getArticleBodyText(article: JsonRecord): string | undefined {
  const fragments: string[] = []

  const topLevelCandidates: unknown[] = [
    article.full_text,
    article.article_text,
    article.body,
    article.content,
    article.sections,
    article.paragraphs,
    article.blocks,
  ]

  for (const candidate of topLevelCandidates) {
    collectArticleTextFragments(candidate, fragments, 0)
  }

  const deduped = dedupeOrdered(fragments)
  if (deduped.length === 0) {
    return undefined
  }

  const joined = normalizeText(deduped.join("\n\n"))
  return joined
}

function getThumbnailFromArticle(
  article: JsonRecord,
  mediaByKey: Map<string, JsonRecord>,
): string | undefined {
  return (
    resolveMediaRef(article.cover_media, mediaByKey) ??
    resolveMediaRef(article.cover_media_key, mediaByKey) ??
    resolveMediaRefList(article.media_entities, mediaByKey) ??
    resolveMediaRefList(article.media, mediaByKey)
  )
}

function getThumbnailFromTweet(
  tweet: JsonRecord,
  mediaByKey: Map<string, JsonRecord>,
): string | undefined {
  const attachments = getRecord(tweet, "attachments")
  return resolveMediaRefList(attachments?.media_keys, mediaByKey)
}

export function mapXApiResponseToExtractedContent(payload: unknown): ExtractedContent | null {
  const root = isRecord(payload) ? payload : undefined
  const tweet = getRecord(root, "data")
  if (!tweet) {
    return null
  }

  const includes = getRecord(root, "includes")
  const mediaByKey = buildMediaMap(includes)
  const article = getRecord(tweet, "article")

  let textContent: string | undefined
  let title: string | undefined

  if (article) {
    textContent = getArticleBodyText(article)
    if (!textContent) {
      return null
    }
    title = getArticleTitle(article)
  } else {
    const noteTweet = getRecord(tweet, "note_tweet")
    textContent = normalizeText(getString(noteTweet, "text")) ?? normalizeText(getString(tweet, "text"))
    if (!textContent) {
      return null
    }
  }

  const result: ExtractedContent = {
    textContent,
    length: textContent.length,
  }

  if (title) {
    result.title = title
  }

  const thumbnailUrl =
    (article ? getThumbnailFromArticle(article, mediaByKey) : undefined) ??
    getThumbnailFromTweet(tweet, mediaByKey)
  if (thumbnailUrl) {
    result.thumbnailUrl = thumbnailUrl
  }

  return result
}

export async function extractXContentFromUrl(url: string): Promise<ExtractedContent | null> {
  const match = parseXStatusUrl(url)
  if (!match) {
    return null
  }

  const bearerToken = process.env.STASH_X_BEARER_TOKEN?.trim()
  if (!bearerToken) {
    return null
  }

  try {
    const response = await fetch(createXLookupUrl(match.postId), {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
      signal: AbortSignal.timeout(X_EXTRACT_TIMEOUT_MS),
    })

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as unknown
    return mapXApiResponseToExtractedContent(payload)
  } catch {
    return null
  }
}
