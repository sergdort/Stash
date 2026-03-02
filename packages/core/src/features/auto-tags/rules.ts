import type { AutoTagCandidate, AutoTagScore } from "./types.js"

const STOPLIST = new Set(["news", "article", "general"])
const DOMAIN_BOOSTS: Record<string, string[]> = {
  "github.com": ["code", "devops", "open-source", "typescript", "javascript", "python", "rust", "go"],
  "docs.": ["reference", "api", "tutorial"],
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9-]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function hasBoostForDomain(domain: string | null, tag: string): boolean {
  if (!domain) {
    return false
  }
  const normalizedDomain = domain.toLowerCase()

  for (const [domainKey, tags] of Object.entries(DOMAIN_BOOSTS)) {
    if (domainKey.endsWith(".")) {
      if (!normalizedDomain.startsWith(domainKey)) {
        continue
      }
    } else if (normalizedDomain !== domainKey) {
      continue
    }

    if (tags.includes(tag)) {
      return true
    }
  }

  return false
}

export function shouldSkipTag(tag: string): boolean {
  return tag.length < 2 || STOPLIST.has(tag)
}

export function scoreTagsWithRules(options: {
  text: string
  domain: string | null
  candidates: AutoTagCandidate[]
}): AutoTagScore[] {
  const haystack = options.text.toLowerCase()
  const results: AutoTagScore[] = []

  for (const candidate of options.candidates) {
    if (shouldSkipTag(candidate.tag)) {
      continue
    }

    let score = 0
    if (haystack.includes(candidate.tag)) {
      score += 0.6
    }

    const descriptorTokens = tokenize(candidate.descriptor)
    if (descriptorTokens.length > 0) {
      const matched = descriptorTokens.filter((token) => token.length > 1 && haystack.includes(token))
      const ratio = matched.length / descriptorTokens.length
      score += Math.min(0.35, ratio * 0.35)
    }

    if (hasBoostForDomain(options.domain, candidate.tag)) {
      score += 0.15
    }

    score = Math.min(1, score)
    results.push({
      tag: candidate.tag,
      score,
      source: "rule",
    })
  }

  return results
}
