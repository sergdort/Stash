import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  extractXContentFromUrl,
  mapXApiResponseToExtractedContent,
  parseXStatusUrl,
} from "../src/lib/extract-x.js"

const originalFetch = globalThis.fetch
const originalXBearerToken = process.env.STASH_X_BEARER_TOKEN

function readJsonFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/x-api/${name}`, import.meta.url), "utf-8"),
  ) as unknown
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function mockFetchWithResponse(
  responder: (url: string, init?: RequestInit) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    return await responder(String(input), init)
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
  if (originalXBearerToken === undefined) {
    delete process.env.STASH_X_BEARER_TOKEN
  } else {
    process.env.STASH_X_BEARER_TOKEN = originalXBearerToken
  }
})

describe("parseXStatusUrl", () => {
  it("parses x.com status URLs", () => {
    expect(parseXStatusUrl("https://x.com/LandseerEnga/status/2025015978371989995")).toEqual({
      host: "x.com",
      postId: "2025015978371989995",
    })
  })

  it("parses twitter.com status URLs with suffixes and query params", () => {
    expect(
      parseXStatusUrl("https://twitter.com/someuser/status/1234567890/photo/1?s=20"),
    ).toEqual({
      host: "twitter.com",
      postId: "1234567890",
    })
  })

  it("returns null for non-status X URLs", () => {
    expect(parseXStatusUrl("https://x.com/home")).toBeNull()
    expect(parseXStatusUrl("https://x.com/someuser/lists/123")).toBeNull()
  })

  it("returns null for invalid post IDs", () => {
    expect(parseXStatusUrl("https://x.com/someuser/status/not-a-number")).toBeNull()
  })
})

describe("mapXApiResponseToExtractedContent", () => {
  it("uses standard tweet text and attachment thumbnail", () => {
    const payload = readJsonFixture("post-short.json")

    const result = mapXApiResponseToExtractedContent(payload)

    expect(result).toEqual({
      textContent: "Short X post with image attachment",
      length: "Short X post with image attachment".length,
      thumbnailUrl: "https://pbs.twimg.com/media/short-photo.jpg",
    })
  })

  it("uses note_tweet text over tweet text and normalizes line endings", () => {
    const payload = readJsonFixture("post-note-tweet.json")

    const result = mapXApiResponseToExtractedContent(payload)

    expect(result?.textContent).toBe("Long form X post line one.\n\nLong form X post line two.")
    expect(result?.thumbnailUrl).toBe("https://pbs.twimg.com/media/note-photo.jpg")
  })

  it("uses article body and title, preferring article cover media thumbnail", () => {
    const payload = readJsonFixture("post-article.json")

    const result = mapXApiResponseToExtractedContent(payload)

    expect(result?.title).toBe("A Long-form X Article")
    expect(result?.textContent).toBe(
      "Paragraph one of the article body.\n\nParagraph two of the article body.",
    )
    expect(result?.thumbnailUrl).toBe("https://pbs.twimg.com/media/article-cover.jpg")
  })

  it("falls back to article media_entities thumbnail when cover media is missing", () => {
    const payload = deepClone(readJsonFixture("post-article.json"))
    const data = (payload as { data: { article: Record<string, unknown> } }).data
    delete data.article.cover_media

    const result = mapXApiResponseToExtractedContent(payload)

    expect(result?.thumbnailUrl).toBe("https://pbs.twimg.com/media/article-inline.jpg")
  })

  it("returns null when article exists but no article body text is available", () => {
    const payload = {
      data: {
        id: "999",
        text: "Teaser text only",
        article: {
          title: "Article title",
          description: "Preview only",
        },
      },
    }

    expect(mapXApiResponseToExtractedContent(payload)).toBeNull()
  })

  it("does not treat top-level article teaser text as article body content", () => {
    const payload = {
      data: {
        id: "1000",
        text: "Tweet teaser text",
        article: {
          title: "Article title",
          text: "Article teaser text only",
        },
      },
    }

    expect(mapXApiResponseToExtractedContent(payload)).toBeNull()
  })

  it("returns null when payload does not include usable text", () => {
    expect(mapXApiResponseToExtractedContent({ data: { id: "123" } })).toBeNull()
    expect(mapXApiResponseToExtractedContent({ errors: [] })).toBeNull()
  })
})

describe("extractXContentFromUrl", () => {
  it("returns null without a bearer token and does not call fetch", async () => {
    delete process.env.STASH_X_BEARER_TOKEN
    const fetchMock = mockFetchWithResponse(async () => new Response(null, { status: 200 }))

    const result = await extractXContentFromUrl("https://x.com/user/status/123")

    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("calls X API and maps a successful payload", async () => {
    process.env.STASH_X_BEARER_TOKEN = "test-token"
    const payload = readJsonFixture("post-short.json")
    const fetchMock = mockFetchWithResponse(async () => {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const result = await extractXContentFromUrl("https://x.com/user/status/1111111111111111111")

    expect(result?.textContent).toBe("Short X post with image attachment")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? []
    expect(String(requestUrl)).toContain("https://api.x.com/2/tweets/1111111111111111111")
    expect(String(requestUrl)).toContain("tweet.fields=")
    expect(String(requestUrl)).toContain("expansions=")
    expect((requestInit as RequestInit | undefined)?.headers).toMatchObject({
      Authorization: "Bearer test-token",
    })
  })

  it.each([401, 403, 404, 429])("returns null for API status %i", async (status) => {
    process.env.STASH_X_BEARER_TOKEN = "test-token"
    mockFetchWithResponse(async () => new Response(JSON.stringify({ error: "nope" }), { status }))

    const result = await extractXContentFromUrl("https://x.com/user/status/123")

    expect(result).toBeNull()
  })

  it("returns null for malformed JSON payloads", async () => {
    process.env.STASH_X_BEARER_TOKEN = "test-token"
    mockFetchWithResponse(async () => {
      return new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const result = await extractXContentFromUrl("https://x.com/user/status/123")

    expect(result).toBeNull()
  })
})
