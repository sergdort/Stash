import { afterEach, describe, expect, it, vi } from "vitest"

import { extractContent } from "../src/lib/extract.js"

const originalFetch = globalThis.fetch
const LONG_PARAGRAPH =
  "Industrial software is evolving quickly with agents, robust tooling, and practical workflows. ".repeat(
    8,
  )

function mockFetchHtml(html: string): void {
  globalThis.fetch = vi.fn(async () => new Response(html, { status: 200 })) as unknown as typeof fetch
}

function buildHtml(head: string, body: string): string {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`
}

function buildReadableBody(extra = ""): string {
  return `<article><h1>Industrial software revolution</h1><p>${LONG_PARAGRAPH}</p>${extra}<p>${LONG_PARAGRAPH}</p></article>`
}

afterEach(() => {
  globalThis.fetch = originalFetch
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
