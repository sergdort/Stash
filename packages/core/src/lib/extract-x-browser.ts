import { parseHTML } from "linkedom"

import type { ExtractedContent } from "./extract.js"

type PlaywrightModuleLike = {
  chromium: {
    launch(options: { headless: boolean }): Promise<BrowserLike>
  }
}

type BrowserLike = {
  newContext(): Promise<BrowserContextLike>
  close(): Promise<void>
}

type BrowserContextLike = {
  newPage(): Promise<PageLike>
  close(): Promise<void>
}

type PageLike = {
  goto(
    url: string,
    options: { waitUntil: "domcontentloaded"; timeout: number },
  ): Promise<unknown>
  waitForSelector(
    selector: string,
    options: { timeout: number; state?: "attached" | "visible" },
  ): Promise<unknown>
  content(): Promise<string>
  close(): Promise<void>
}

type PlaywrightLoader = () => Promise<PlaywrightModuleLike>
type ParsedDocument = ReturnType<typeof parseHTML>["document"]
type ParsedElement = NonNullable<ReturnType<ParsedDocument["querySelector"]>>
type QueryScope = ParsedDocument | ParsedElement

const X_STATUS_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
])

const X_NAVIGATION_TIMEOUT_MS = 15_000
const X_READY_SELECTORS = [
  'main [data-testid="primaryColumn"] article [data-testid="tweetText"]',
  'main [data-testid="primaryColumn"] article',
  'main article [data-testid="tweetText"]',
  "main article",
  "article",
]

const X_PRIMARY_ARTICLE_SELECTORS = [
  'main [data-testid="primaryColumn"] article',
  "main article",
  "article",
]

const X_ARTICLE_SCOPE_SELECTORS = [
  'main [data-testid*="article"]',
  'main [data-testid*="Article"]',
  "main article",
]

const X_ARTICLE_TITLE_SELECTORS = ['[data-testid="twitter-article-title"]', "h1"]
const X_ARTICLE_THUMBNAIL_SCOPE_SELECTORS = [
  '[data-testid="twitterArticleReadView"]',
  '[data-testid="twitterArticleRichTextView"]',
  '[data-testid="longformRichTextComponent"]',
]
const X_PREFERRED_MEDIA_IMAGE_SELECTORS = [
  '[data-testid="tweetPhoto"] img',
  "video[poster]",
]
const X_LONGFORM_ROOT_SELECTORS = [
  '[data-testid="twitterArticleRichTextView"]',
  '[data-testid="longformRichTextComponent"]',
]
const X_LONGFORM_BLOCK_SELECTORS = [
  '[class*="longform-header-one"]',
  '[class*="longform-header-two"]',
  '[class*="longform-unstyled"]',
  '[class*="longform-blockquote"]',
  '[class*="longform-unordered-list-item"]',
  '[class*="longform-ordered-list-item"]',
]

const METADATA_IMAGE_SELECTORS = [
  'meta[property="og:image:secure_url"]',
  'meta[property="og:image:url"]',
  'meta[property="og:image"]',
  'meta[name="twitter:image"]',
  'meta[name="twitter:image:src"]',
  'meta[property="twitter:image"]',
]

const METADATA_TITLE_SELECTORS = [
  'meta[property="og:title"]',
  'meta[name="twitter:title"]',
]

const TWEET_TEXT_SELECTORS = ['[data-testid="tweetText"]', "[lang]"]

let playwrightLoaderOverride: PlaywrightLoader | null = null

export type ContentExtractionErrorCode =
  | "X_BROWSER_DEPENDENCY_MISSING"
  | "X_BROWSER_LAUNCH_FAILED"
  | "X_BROWSER_NAVIGATION_TIMEOUT"
  | "X_BROWSER_RENDER_BLOCKED"

export class ContentExtractionError extends Error {
  code: ContentExtractionErrorCode

  constructor(message: string, code: ContentExtractionErrorCode) {
    super(message)
    this.code = code
  }
}

export interface XStatusUrlMatch {
  host: string
  postId: string
}

function normalizeTextBlock(text: string | null | undefined): string | undefined {
  if (!text) return undefined
  const normalized = text.replace(/\r\n?/g, "\n").trim()
  return normalized.length > 0 ? normalized : undefined
}

function normalizeTitle(text: string | null | undefined): string | undefined {
  const normalized = normalizeTextBlock(text)
  if (!normalized) {
    return undefined
  }

  const stripped = normalized
    .replace(/\s+\/\s+X$/i, "")
    .trim()

  if (stripped.length === 0 || /^x$/i.test(stripped)) {
    return undefined
  }

  return stripped
}

function dedupeOrdered(values: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }

  return result
}

function normalizeHttpUrl(candidate: string | null, pageUrl: string): string | undefined {
  if (!candidate) {
    return undefined
  }

  const trimmed = candidate.trim()
  if (trimmed.length === 0) {
    return undefined
  }

  try {
    const resolved = new URL(trimmed, pageUrl)
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return undefined
    }
    return resolved.toString()
  } catch {
    return undefined
  }
}

function isPlaceholderOrAvatarImage(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (
    parsed.hostname === "abs.twimg.com" &&
    parsed.pathname === "/rweb/ssr/default/v2/og/image.png"
  ) {
    return true
  }

  if (parsed.hostname === "pbs.twimg.com" && parsed.pathname.includes("/profile_images/")) {
    return true
  }

  return false
}

function getPrimaryArticle(document: ParsedDocument): ParsedElement | null {
  for (const selector of X_PRIMARY_ARTICLE_SELECTORS) {
    const article = document.querySelector(selector)
    if (article) return article
  }
  return null
}

function getMetadataTitle(document: ParsedDocument): string | undefined {
  for (const selector of METADATA_TITLE_SELECTORS) {
    const content = document.querySelector(selector)?.getAttribute("content") ?? null
    const title = normalizeTitle(content)
    if (title) return title
  }
  return undefined
}

function extractThumbnailFromMetadata(document: ParsedDocument, pageUrl: string): string | undefined {
  for (const selector of METADATA_IMAGE_SELECTORS) {
    const content = document.querySelector(selector)?.getAttribute("content") ?? null
    const resolved = normalizeHttpUrl(content, pageUrl)
    if (resolved && !isPlaceholderOrAvatarImage(resolved)) return resolved
  }
  return undefined
}

function getFirstSrcsetCandidate(srcset: string | null): string | undefined {
  if (!srcset) {
    return undefined
  }

  for (const item of srcset.split(",")) {
    const candidate = item.trim().split(/\s+/)[0]
    if (candidate) {
      return candidate
    }
  }

  return undefined
}

function extractThumbnailFromScope(scope: QueryScope | null, pageUrl: string): string | undefined {
  if (!scope) {
    return undefined
  }

  const preferredImages = scope.querySelectorAll(X_PREFERRED_MEDIA_IMAGE_SELECTORS.join(","))
  for (const node of preferredImages) {
    const posterUrl = normalizeHttpUrl(node.getAttribute("poster"), pageUrl)
    if (posterUrl && !isPlaceholderOrAvatarImage(posterUrl)) return posterUrl

    const src = normalizeHttpUrl(node.getAttribute("src"), pageUrl)
    if (src && !isPlaceholderOrAvatarImage(src)) return src

    const srcsetUrl = normalizeHttpUrl(
      getFirstSrcsetCandidate(node.getAttribute("srcset")) ?? null,
      pageUrl,
    )
    if (srcsetUrl && !isPlaceholderOrAvatarImage(srcsetUrl)) return srcsetUrl
  }

  const images = scope.querySelectorAll("img")
  for (const image of images) {
    const src = normalizeHttpUrl(image.getAttribute("src"), pageUrl)
    if (src && !isPlaceholderOrAvatarImage(src)) return src

    const srcsetUrl = normalizeHttpUrl(getFirstSrcsetCandidate(image.getAttribute("srcset")) ?? null, pageUrl)
    if (srcsetUrl && !isPlaceholderOrAvatarImage(srcsetUrl)) return srcsetUrl
  }

  return undefined
}

function collectTextBlocksAcrossSelectors(scope: QueryScope, selectors: string[]): string[] {
  if (selectors.length === 0) {
    return []
  }

  const fragments: string[] = []
  const elements = scope.querySelectorAll(selectors.join(","))

  for (const element of elements) {
    if (element.closest("nav,aside,footer,header")) {
      continue
    }
    const text = normalizeTextBlock(element.textContent)
    if (!text) continue
    fragments.push(text)
  }

  return dedupeOrdered(fragments)
}

function collectTextBlocks(scope: QueryScope, selectors: string[]): string[] {
  const fragments: string[] = []

  for (const selector of selectors) {
    const elements = scope.querySelectorAll(selector)
    for (const element of elements) {
      if (element.closest("nav,aside,footer,header")) {
        continue
      }
      const text = normalizeTextBlock(element.textContent)
      if (!text) continue
      fragments.push(text)
    }
    if (fragments.length > 0) {
      break
    }
  }

  return dedupeOrdered(fragments)
}

function looksLikeArticleText(blocks: string[], title: string | undefined): boolean {
  const filteredBlocks = title ? blocks.filter((block) => block !== title) : [...blocks]
  if (filteredBlocks.length === 0) {
    return false
  }

  const totalLength = filteredBlocks.reduce((sum, block) => sum + block.length, 0)
  return totalLength >= 500 || (filteredBlocks.length >= 2 && totalLength >= 280)
}

type ArticleLikeCandidate = {
  textContent: string
  title?: string
}

function getArticleScopeTitle(scope: QueryScope): string | undefined {
  for (const selector of X_ARTICLE_TITLE_SELECTORS) {
    const title = normalizeTitle(scope.querySelector(selector)?.textContent ?? null)
    if (title) {
      return title
    }
  }

  return undefined
}

function collectLongformArticleBlocks(scope: QueryScope): string[] {
  for (const rootSelector of X_LONGFORM_ROOT_SELECTORS) {
    const roots = scope.querySelectorAll(rootSelector)
    for (const root of roots) {
      const blocks = collectTextBlocksAcrossSelectors(root, X_LONGFORM_BLOCK_SELECTORS)
      if (blocks.length > 0) {
        return blocks
      }
    }
  }

  return []
}

function getArticleThumbnailScope(document: ParsedDocument): ParsedElement | null {
  for (const selector of X_ARTICLE_THUMBNAIL_SCOPE_SELECTORS) {
    const scope = document.querySelector(selector)
    if (scope) {
      return scope
    }
  }

  return null
}

function extractArticleLikeContent(document: ParsedDocument): ArticleLikeCandidate | null {
  for (const selector of X_ARTICLE_SCOPE_SELECTORS) {
    const scopes = document.querySelectorAll(selector)
    for (const scope of scopes) {
      const scopeTitle = getArticleScopeTitle(scope)
      const longformBlocks = collectLongformArticleBlocks(scope)
      const blocks =
        longformBlocks.length > 0
          ? longformBlocks
          : collectTextBlocks(scope, ["p", "[lang]", '[data-testid="tweetText"]'])
      const filteredBlocks = scopeTitle ? blocks.filter((block) => block !== scopeTitle) : blocks

      if (!looksLikeArticleText(filteredBlocks, scopeTitle)) {
        continue
      }

      const textContent = normalizeTextBlock(filteredBlocks.join("\n\n"))
      if (!textContent) {
        continue
      }

      const title = scopeTitle ?? getMetadataTitle(document)
      if (title) {
        return {
          textContent,
          title,
        }
      }

      return { textContent }
    }
  }

  return null
}

function extractTweetText(primaryArticle: ParsedElement): string | undefined {
  const blocks = collectTextBlocks(primaryArticle, TWEET_TEXT_SELECTORS)
  if (blocks.length === 0) {
    return undefined
  }
  return normalizeTextBlock(blocks.join("\n\n"))
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

export function extractXContentFromRenderedHtml(
  html: string,
  pageUrl: string,
): ExtractedContent | null {
  const { document } = parseHTML(html, { url: pageUrl })
  const primaryArticle = getPrimaryArticle(document)

  const articleLike = extractArticleLikeContent(document)
  const textContent = articleLike?.textContent ?? (primaryArticle ? extractTweetText(primaryArticle) : undefined)
  if (!textContent) {
    return null
  }

  const result: ExtractedContent = {
    textContent,
    length: textContent.length,
  }

  if (articleLike?.title) {
    result.title = articleLike.title
  }

  const articleThumbnailScope = articleLike ? getArticleThumbnailScope(document) : null
  const thumbnailUrl =
    extractThumbnailFromScope(articleThumbnailScope, pageUrl) ??
    extractThumbnailFromMetadata(document, pageUrl) ??
    extractThumbnailFromScope(primaryArticle ?? document, pageUrl)
  if (thumbnailUrl) {
    result.thumbnailUrl = thumbnailUrl
  }

  return result
}

function isTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const name = error.name.toLowerCase()
  const message = error.message.toLowerCase()
  return name.includes("timeout") || message.includes("timeout")
}

function isMissingPlaywrightDependencyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return (
    message.includes("cannot find package 'playwright'") ||
    message.includes("cannot find module 'playwright'") ||
    message.includes("executable doesn't exist") ||
    message.includes("playwright install")
  )
}

function mapLoaderError(error: unknown): ContentExtractionError {
  if (isMissingPlaywrightDependencyError(error)) {
    return new ContentExtractionError(
      "X extraction requires Playwright Chromium. Run `pnpm install` and `pnpm exec playwright install chromium`, then retry.",
      "X_BROWSER_DEPENDENCY_MISSING",
    )
  }

  const message = error instanceof Error ? error.message : "Unknown error"
  return new ContentExtractionError(
    `Failed to load Playwright for X extraction: ${message}`,
    "X_BROWSER_DEPENDENCY_MISSING",
  )
}

function mapLaunchError(error: unknown): ContentExtractionError {
  if (isMissingPlaywrightDependencyError(error)) {
    return new ContentExtractionError(
      "X extraction requires Playwright Chromium. Run `pnpm exec playwright install chromium`, then retry.",
      "X_BROWSER_DEPENDENCY_MISSING",
    )
  }

  const message = error instanceof Error ? error.message : "Unknown error"
  return new ContentExtractionError(
    `X extraction browser failed to launch: ${message}`,
    "X_BROWSER_LAUNCH_FAILED",
  )
}

function mapNavigationError(error: unknown): ContentExtractionError {
  if (isTimeoutLikeError(error)) {
    return new ContentExtractionError(
      "Timed out loading the X page in the headless browser.",
      "X_BROWSER_NAVIGATION_TIMEOUT",
    )
  }

  const message = error instanceof Error ? error.message : "Unknown error"
  return new ContentExtractionError(
    `Failed to load the X page in the headless browser: ${message}`,
    "X_BROWSER_RENDER_BLOCKED",
  )
}

async function defaultPlaywrightLoader(): Promise<PlaywrightModuleLike> {
  try {
    const specifier = "playwright"
    return (await import(specifier)) as unknown as PlaywrightModuleLike
  } catch (error) {
    throw mapLoaderError(error)
  }
}

async function getPlaywrightModule(): Promise<PlaywrightModuleLike> {
  const loader = playwrightLoaderOverride ?? defaultPlaywrightLoader
  try {
    return await loader()
  } catch (error) {
    if (isContentExtractionError(error)) {
      throw error
    }
    throw mapLoaderError(error)
  }
}

async function waitForAnyReadySelector(page: PageLike): Promise<boolean> {
  const perSelectorTimeout = Math.max(
    300,
    Math.floor(X_NAVIGATION_TIMEOUT_MS / Math.max(1, X_READY_SELECTORS.length)),
  )

  for (const selector of X_READY_SELECTORS) {
    try {
      await page.waitForSelector(selector, { timeout: perSelectorTimeout, state: "attached" })
      return true
    } catch {
      // Try the next selector; we'll still parse final HTML once.
    }
  }

  return false
}

async function safeClose(value: { close(): Promise<void> } | null): Promise<void> {
  if (!value) return
  try {
    await value.close()
  } catch {
    // Ignore cleanup errors.
  }
}

export function isContentExtractionError(error: unknown): error is ContentExtractionError {
  return error instanceof ContentExtractionError
}

export function __setPlaywrightLoaderForTests(loader: PlaywrightLoader | null): void {
  playwrightLoaderOverride = loader
}

export async function extractXContentFromUrl(url: string): Promise<ExtractedContent | null> {
  if (!parseXStatusUrl(url)) {
    return null
  }

  let browser: BrowserLike | null = null
  let context: BrowserContextLike | null = null
  let page: PageLike | null = null

  try {
    const playwright = await getPlaywrightModule()

    try {
      browser = await playwright.chromium.launch({ headless: true })
    } catch (error) {
      throw mapLaunchError(error)
    }

    context = await browser.newContext()
    page = await context.newPage()

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: X_NAVIGATION_TIMEOUT_MS,
      })
    } catch (error) {
      throw mapNavigationError(error)
    }

    const selectorReady = await waitForAnyReadySelector(page)
    const html = await page.content()
    const extracted = extractXContentFromRenderedHtml(html, url)
    if (extracted?.textContent) {
      return extracted
    }

    if (!selectorReady) {
      throw new ContentExtractionError(
        "X page rendered but no readable post content was found (page layout changed, blocked, or login may be required).",
        "X_BROWSER_RENDER_BLOCKED",
      )
    }

    throw new ContentExtractionError(
      "X page rendered but no readable post text could be extracted from the rendered DOM.",
      "X_BROWSER_RENDER_BLOCKED",
    )
  } finally {
    await safeClose(page)
    await safeClose(context)
    await safeClose(browser)
  }
}
