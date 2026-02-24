import { afterEach, describe, expect, it, vi } from "vitest"

import { extractContent } from "../src/lib/extract.js"
import { __setPlaywrightLoaderForTests } from "../src/lib/extract-x-browser.js"

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
  __setPlaywrightLoaderForTests(null)
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
  it("routes X status URLs to the browser extractor path", async () => {
    const fetchMock = vi.fn(async () => new Response("should not fetch", { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    __setPlaywrightLoaderForTests(async () => ({
      chromium: {
        launch: async () => ({
          newContext: async () => ({
            newPage: async () => ({
              goto: async () => {},
              waitForSelector: async () => ({}),
              content: async () =>
                '<main><div data-testid="primaryColumn"><article><div data-testid="tweetText" lang="en">Hello from rendered X</div></article></div></main>',
              close: async () => {},
            }),
            close: async () => {},
          }),
          close: async () => {},
        }),
      },
    }))

    const result = await extractContent("https://x.com/example/status/123")

    expect(result?.textContent).toBe("Hello from rendered X")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("keeps non-X URLs on the Readability HTML extraction path", async () => {
    const fetchMock = vi.fn(async () => new Response(buildHtml("", buildReadableBody()), { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await extractContent("https://example.com/story")

    expect(result?.textContent).toContain("Industrial software is evolving quickly")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls.at(0)?.at(0) ?? "")).toBe("https://example.com/story")
  })

  it("does not fall back to generic Readability when X browser extraction fails", async () => {
    const fetchMock = vi.fn(async () => new Response(buildHtml("", buildReadableBody()), { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    __setPlaywrightLoaderForTests(async () => {
      throw new Error("Cannot find package 'playwright'")
    })

    await expect(extractContent("https://x.com/example/status/123")).rejects.toMatchObject({
      code: "X_BROWSER_DEPENDENCY_MISSING",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
