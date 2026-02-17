import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom"

export interface ExtractedContent {
  title?: string
  content?: string
  textContent?: string
  excerpt?: string
  byline?: string
  length?: number
}

type ReadabilityDocument = ConstructorParameters<typeof Readability>[0]

export async function extractContent(url: string): Promise<ExtractedContent | null> {
  try {
    // Fetch the HTML
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
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

    return result
  } catch (error) {
    console.error(`Error extracting content from ${url}:`, error)
    return null
  }
}
