import { readFileSync } from "node:fs"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  __setPlaywrightLoaderForTests,
  extractXContentFromRenderedHtml,
  extractXContentFromUrl,
  isContentExtractionError,
  parseXStatusUrl,
} from "../src/lib/extract-x-browser.js"

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/x-dom/${name}`, import.meta.url), "utf-8")
}

afterEach(() => {
  __setPlaywrightLoaderForTests(null)
  vi.restoreAllMocks()
})

describe("parseXStatusUrl", () => {
  it("parses x.com status URLs", () => {
    expect(parseXStatusUrl("https://x.com/example/status/2025015978371989995")).toEqual({
      host: "x.com",
      postId: "2025015978371989995",
    })
  })

  it("parses twitter.com status URLs with suffixes", () => {
    expect(
      parseXStatusUrl("https://twitter.com/example/status/1234567890123456789/photo/1?s=20"),
    ).toEqual({
      host: "twitter.com",
      postId: "1234567890123456789",
    })
  })

  it("rejects non-status X URLs and invalid ids", () => {
    expect(parseXStatusUrl("https://x.com/home")).toBeNull()
    expect(parseXStatusUrl("https://x.com/example/status/not-a-number")).toBeNull()
    expect(parseXStatusUrl("https://example.com/example/status/123")).toBeNull()
  })
})

describe("extractXContentFromRenderedHtml", () => {
  it("extracts standard post text and falls back to the first image thumbnail in primary content", () => {
    const html = readFixture("post-short.html")

    const result = extractXContentFromRenderedHtml(html, "https://x.com/example/status/111")

    expect(result?.textContent).toBe("Short X post body text.")
    expect(result?.thumbnailUrl).toBe("https://x.com/media/short-post.jpg")
  })

  it("extracts multi-block note-style text and prefers metadata thumbnail", () => {
    const html = readFixture("post-note-tweet.html")

    const result = extractXContentFromRenderedHtml(html, "https://x.com/example/status/222")

    expect(result?.textContent).toBe("Long form X post line one.\n\nLong form X post line two.")
    expect(result?.thumbnailUrl).toBe("https://images.example.com/x-note-cover.jpg")
  })

  it("prefers article-like body text and cleans X suffix from title", () => {
    const html = readFixture("post-article-like.html")

    const result = extractXContentFromRenderedHtml(html, "https://x.com/example/status/333")

    expect(result?.title).toBe("Deep Workflows on X")
    expect(result?.textContent).toContain("Building practical agent workflows takes tooling discipline")
    expect(result?.textContent).not.toContain("Teaser post text only.")
    expect(result?.thumbnailUrl).toBe("https://cdn.example.com/x-article-cover.png")
  })

  it("extracts rendered X longform article DOM and ignores noscript placeholder/generic og image", () => {
    const html = readFixture("post-article-longform-rendered.html")

    const result = extractXContentFromRenderedHtml(html, "https://x.com/AlexFinn/status/2024169334344679783")

    expect(result?.title).toBe(
      "Your OpenClaw is useless without a Mission Control. Here's how to set it up",
    )
    expect(result?.textContent).toContain("first paragraph of the rendered X article body")
    expect(result?.textContent).toContain("appears in page.content() after Playwright executes scripts")
    expect(result?.textContent).not.toContain("Teaser post text only.")
    expect(result?.textContent).not.toContain("JavaScript is not available.")
    expect(result?.thumbnailUrl).toBe("https://pbs.twimg.com/media/article-cover?format=jpg&name=small")
  })

  it("returns null when rendered page does not expose readable post content", () => {
    const html = readFixture("post-no-content.html")
    expect(extractXContentFromRenderedHtml(html, "https://x.com/example/status/444")).toBeNull()
  })
})

describe("extractXContentFromUrl (Playwright orchestration)", () => {
  function createClosable() {
    return {
      close: vi.fn(async () => {}),
    }
  }

  function installPlaywrightMock(options: {
    html?: string
    gotoError?: Error
    waitForSelectorError?: Error
    launchError?: Error
  }): {
    launch: ReturnType<typeof vi.fn>
    goto: ReturnType<typeof vi.fn>
    waitForSelector: ReturnType<typeof vi.fn>
    content: ReturnType<typeof vi.fn>
    pageClose: ReturnType<typeof vi.fn>
    contextClose: ReturnType<typeof vi.fn>
    browserClose: ReturnType<typeof vi.fn>
  } {
    const pageClosable = createClosable()
    const contextClosable = createClosable()
    const browserClosable = createClosable()

    const goto = vi.fn(async () => {
      if (options.gotoError) throw options.gotoError
      return undefined
    })
    const waitForSelector = vi.fn(async () => {
      if (options.waitForSelectorError) throw options.waitForSelectorError
      return {}
    })
    const content = vi.fn(async () => options.html ?? readFixture("post-short.html"))

    const page = {
      goto,
      waitForSelector,
      content,
      close: pageClosable.close,
    }

    const context = {
      newPage: vi.fn(async () => page),
      close: contextClosable.close,
    }

    const launch = vi.fn(async () => {
      if (options.launchError) throw options.launchError
      return {
        newContext: vi.fn(async () => context),
        close: browserClosable.close,
      }
    })

    __setPlaywrightLoaderForTests(async () => ({
      chromium: { launch },
    }))

    return {
      launch,
      goto,
      waitForSelector,
      content,
      pageClose: pageClosable.close,
      contextClose: contextClosable.close,
      browserClose: browserClosable.close,
    }
  }

  it("launches Chromium headless, renders, parses content, and closes resources", async () => {
    const mock = installPlaywrightMock({
      html: readFixture("post-note-tweet.html"),
    })

    const result = await extractXContentFromUrl("https://x.com/example/status/123")

    expect(result?.textContent).toContain("Long form X post line one.")
    expect(mock.launch).toHaveBeenCalledWith({ headless: true })
    expect(mock.goto).toHaveBeenCalledTimes(1)
    expect(mock.waitForSelector).toHaveBeenCalled()
    expect(mock.content).toHaveBeenCalledTimes(1)
    expect(mock.pageClose).toHaveBeenCalledTimes(1)
    expect(mock.contextClose).toHaveBeenCalledTimes(1)
    expect(mock.browserClose).toHaveBeenCalledTimes(1)
  })

  it("returns null for non-X URLs without loading Playwright", async () => {
    const loader = vi.fn(async () => {
      throw new Error("should not be called")
    })
    __setPlaywrightLoaderForTests(loader)

    const result = await extractXContentFromUrl("https://example.com/story")

    expect(result).toBeNull()
    expect(loader).not.toHaveBeenCalled()
  })

  it("throws actionable dependency error when Playwright is missing", async () => {
    __setPlaywrightLoaderForTests(async () => {
      throw new Error("Cannot find package 'playwright' imported from /tmp/test.mjs")
    })

    await expect(extractXContentFromUrl("https://x.com/example/status/123")).rejects.toMatchObject({
      code: "X_BROWSER_DEPENDENCY_MISSING",
    })

    try {
      await extractXContentFromUrl("https://x.com/example/status/123")
    } catch (error) {
      expect(isContentExtractionError(error)).toBe(true)
      expect(error instanceof Error ? error.message : "").toContain(
        "pnpm exec playwright install chromium",
      )
    }
  })

  it("throws launch error when browser cannot start", async () => {
    const mock = installPlaywrightMock({
      launchError: new Error("launch crash"),
    })

    await expect(extractXContentFromUrl("https://x.com/example/status/123")).rejects.toMatchObject({
      code: "X_BROWSER_LAUNCH_FAILED",
    })

    expect(mock.launch).toHaveBeenCalledTimes(1)
  })

  it("throws navigation timeout error and still closes resources", async () => {
    const timeoutError = new Error("Navigation timeout of 15000 ms exceeded")
    timeoutError.name = "TimeoutError"
    const mock = installPlaywrightMock({
      gotoError: timeoutError,
    })

    await expect(extractXContentFromUrl("https://x.com/example/status/123")).rejects.toMatchObject({
      code: "X_BROWSER_NAVIGATION_TIMEOUT",
    })

    expect(mock.pageClose).toHaveBeenCalledTimes(1)
    expect(mock.contextClose).toHaveBeenCalledTimes(1)
    expect(mock.browserClose).toHaveBeenCalledTimes(1)
  })

  it("throws render-blocked error when selectors never appear and parsed HTML has no content", async () => {
    const mock = installPlaywrightMock({
      html: readFixture("post-no-content.html"),
      waitForSelectorError: new Error("wait failed"),
    })

    await expect(extractXContentFromUrl("https://x.com/example/status/123")).rejects.toMatchObject({
      code: "X_BROWSER_RENDER_BLOCKED",
    })

    expect(mock.waitForSelector).toHaveBeenCalled()
    expect(mock.content).toHaveBeenCalledTimes(1)
    expect(mock.pageClose).toHaveBeenCalledTimes(1)
    expect(mock.contextClose).toHaveBeenCalledTimes(1)
    expect(mock.browserClose).toHaveBeenCalledTimes(1)
  })

  it("throws render-blocked error when page renders but parsed DOM still has no readable text", async () => {
    const mock = installPlaywrightMock({
      html: readFixture("post-no-content.html"),
    })

    await expect(extractXContentFromUrl("https://x.com/example/status/123")).rejects.toMatchObject({
      code: "X_BROWSER_RENDER_BLOCKED",
    })

    expect(mock.waitForSelector).toHaveBeenCalled()
    expect(mock.content).toHaveBeenCalledTimes(1)
    expect(mock.browserClose).toHaveBeenCalledTimes(1)
  })
})
