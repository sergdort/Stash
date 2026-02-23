import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom"
import { extractXContentFromUrl, parseXStatusUrl } from "./extract-x.js"

export interface ExtractedContent {
  title?: string
  content?: string
  textContent?: string
  excerpt?: string
  byline?: string
  length?: number
  thumbnailUrl?: string
}

type ReadabilityDocument = ConstructorParameters<typeof Readability>[0]
type ParsedDocument = ReturnType<typeof parseHTML>["document"]
const METADATA_IMAGE_SELECTORS = [
  'meta[property="og:image:secure_url"]',
  'meta[property="og:image:url"]',
  'meta[property="og:image"]',
  'meta[name="twitter:image"]',
  'meta[name="twitter:image:src"]',
  'meta[property="twitter:image"]',
]

function normalizeThumbnailUrl(candidate: string | null, pageUrl: string): string | undefined {
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

function extractThumbnailFromMetadata(document: ParsedDocument, pageUrl: string): string | undefined {
  for (const selector of METADATA_IMAGE_SELECTORS) {
    const content = document.querySelector(selector)?.getAttribute("content") ?? null
    const resolved = normalizeThumbnailUrl(content, pageUrl)
    if (resolved) {
      return resolved
    }
  }

  return undefined
}

function extractThumbnailFromArticleContent(
  articleHtml: string | null | undefined,
  pageUrl: string,
): string | undefined {
  if (!articleHtml) {
    return undefined
  }

  const { document } = parseHTML(articleHtml, { url: pageUrl })
  const images = document.querySelectorAll("img")

  for (const image of images) {
    const src = normalizeThumbnailUrl(image.getAttribute("src"), pageUrl)
    if (src) {
      return src
    }

    const srcset = getFirstSrcsetCandidate(image.getAttribute("srcset"))
    const srcsetUrl = normalizeThumbnailUrl(srcset ?? null, pageUrl)
    if (srcsetUrl) {
      return srcsetUrl
    }
  }

  return undefined
}

export async function extractContent(url: string): Promise<ExtractedContent | null> {
  try {
    if (parseXStatusUrl(url)) {
      return await extractXContentFromUrl(url)
    }

    // Fetch the HTML
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
      },
    })

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`)
      return null
    }

    const html = await response.text()

    // Parse HTML with linkedom
    const { document } = parseHTML(html, { url })

    // Extract with Readability
    const reader = new Readability(document as unknown as ReadabilityDocument)
    const article = reader.parse()

    if (!article) {
      return null
    }

    const result: ExtractedContent = {}

    if (article.title) result.title = article.title
    if (article.content) result.content = article.content
    if (article.textContent) result.textContent = article.textContent
    if (article.excerpt) result.excerpt = article.excerpt
    if (article.byline) result.byline = article.byline
    if (article.length) result.length = article.length
    const thumbnailUrl =
      extractThumbnailFromMetadata(document, url) ??
      extractThumbnailFromArticleContent(article.content, url)
    if (thumbnailUrl) result.thumbnailUrl = thumbnailUrl

    return result
  } catch (error) {
    console.error(`Error extracting content from ${url}:`, error)
    return null
  }
}
