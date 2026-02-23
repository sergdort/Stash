import { afterEach, describe, expect, it, vi } from "vitest"

import { extractContent } from "../src/lib/extract.js"

const originalFetch = globalThis.fetch
const originalXBearerToken = process.env.STASH_X_BEARER_TOKEN
const LONG_PARAGRAPH =
  "Industrial software is evolving quickly with agents, robust tooling, and practical workflows. ".repeat(
    8,
  )

function mockFetchHtml(html: string): void {
  globalThis.fetch = vi.fn(async () => new Response(html, { status: 200 })) as unknown as typeof fetch
}

function mockFetchJson(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    })
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

function buildHtml(head: string, body: string): string {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`
}

function buildReadableBody(extra = ""): string {
  return `<article><h1>Industrial software revolution</h1><p>${LONG_PARAGRAPH}</p>${extra}<p>${LONG_PARAGRAPH}</p></article>`
}

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalXBearerToken === undefined) {
    delete process.env.STASH_X_BEARER_TOKEN
  } else {
    process.env.STASH_X_BEARER_TOKEN = originalXBearerToken
  }
  vi.restoreAllMocks()
})

describe("extractContent thumbnail extraction", () => {
  it("uses og:image metadata when available", async () => {
    mockFetchHtml(
      buildHtml(
        '<meta property="og:image" content="https://cdn.example.com/cover.png">',
        buildReadableBody(),
      ),
    )

    const result = await extractContent("https://example.com/story")
    expect(result?.thumbnailUrl).toBe("https://cdn.example.com/cover.png")
  })

  it("resolves relative metadata image URLs against page URL", async () => {
    mockFetchHtml(
      buildHtml('<meta property="og:image" content="/images/cover.jpg">', buildReadableBody()),
    )

    const result = await extractContent("https://example.com/posts/123")
    expect(result?.thumbnailUrl).toBe("https://example.com/images/cover.jpg")
  })

  it("falls back to twitter metadata when og metadata is missing", async () => {
    mockFetchHtml(
      buildHtml(
        '<meta name="twitter:image" content="https://images.example.com/social.jpg">',
        buildReadableBody(),
      ),
    )

    const result = await extractContent("https://example.com/post")
    expect(result?.thumbnailUrl).toBe("https://images.example.com/social.jpg")
  })

  it("falls back to first article image when metadata is missing", async () => {
    mockFetchHtml(buildHtml("", buildReadableBody('<img src="/media/article-cover.webp" alt="">')))

    const result = await extractContent("https://example.com/post")
    expect(result?.thumbnailUrl).toBe("https://example.com/media/article-cover.webp")
  })

  it("rejects invalid protocols for metadata and content images", async () => {
    mockFetchHtml(
      buildHtml(
        [
          '<meta property="og:image:secure_url" content="data:image/png;base64,abc">',
          '<meta property="og:image:url" content="blob:https://example.com/snapshot">',
          '<meta property="og:image" content="javascript:alert(1)">',
          '<meta name="twitter:image" content="data:image/jpeg;base64,xyz">',
        ].join(""),
        buildReadableBody('<img src="data:image/png;base64,nope" alt="">'),
      ),
    )

    const result = await extractContent("https://example.com/post")
    expect(result?.thumbnailUrl).toBeUndefined()
  })

  it("returns no thumbnail when no valid image candidate exists", async () => {
    mockFetchHtml(buildHtml("", buildReadableBody()))

    const result = await extractContent("https://example.com/post")
    expect(result?.thumbnailUrl).toBeUndefined()
  })
})

describe("extractContent X routing", () => {
  it("routes X status URLs to the X API extractor path", async () => {
    process.env.STASH_X_BEARER_TOKEN = "test-token"
    const fetchMock = mockFetchJson({
      data: {
        id: "123",
        text: "Hello from X",
      },
    })

    const result = await extractContent("https://x.com/example/status/123")

    expect(result?.textContent).toBe("Hello from X")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls.at(0)?.at(0) ?? "")).toContain("https://api.x.com/2/tweets/123")
  })

  it("keeps non-X URLs on the Readability HTML extraction path", async () => {
    process.env.STASH_X_BEARER_TOKEN = "test-token"
    const fetchMock = vi.fn(async () => {
      return new Response(buildHtml("", buildReadableBody()), { status: 200 })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await extractContent("https://example.com/story")

    expect(result?.textContent).toContain("Industrial software is evolving quickly")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls.at(0)?.at(0) ?? "")).toBe("https://example.com/story")
  })

  it("does not fall back to Readability when X API extraction fails", async () => {
    process.env.STASH_X_BEARER_TOKEN = "test-token"
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await extractContent("https://x.com/example/status/123")

    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls.at(0)?.at(0) ?? "")).toContain("https://api.x.com/2/tweets/123")
  })
})
