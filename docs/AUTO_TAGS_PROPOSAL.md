# Auto Tags Proposal (Seed Tags + all-MiniLM-L6-v2)

Status: Draft
Owner: Stash
Date: 2026-02-25

## Summary

Add optional auto-tagging during `save` and `extract` using:

1. A seeded tag catalog (`config/seed-tags.json`)
2. User-existing tags from DB
3. Local embeddings model (`sentence-transformers/all-MiniLM-L6-v2`) for ranking

This gives smart-but-controlled tags without cloud dependency.

---

## Goals

- Auto-apply useful tags with high precision
- Avoid tag explosion/noise
- Work fully local-first
- Keep behavior deterministic and transparent

## Non-goals (v1)

- Open-ended free-form tag generation
- Cloud LLM dependency
- Full taxonomy management UI

---

## UX / Product Behavior

### Save / Extract behavior

- Manual tags remain source of truth and are never removed.
- Auto tags are merged with manual tags and deduplicated.
- Apply at most `N` auto tags (default `3`).
- Only apply tags with score above threshold (default `0.62`).

### CLI flags

- `stash save ... --auto-tags` (v1 explicit opt-in)
- `stash extract <id> --auto-tags`
- `--no-auto-tags` (explicit off)

### JSON output (example)

```json
{
  "ok": true,
  "item": { "id": 123 },
  "auto_tags": ["typescript", "backend"],
  "auto_tag_scores": [
    { "tag": "typescript", "score": 0.84, "source": "embedding" },
    { "tag": "backend", "score": 0.71, "source": "embedding" }
  ]
}
```

---

## Architecture

## 1) Candidate pool

`candidate_tags = seed_tags + user_existing_tags`

- Seed tags: from `config/seed-tags.json`
- User tags: distinct tags from DB
- Normalize + dedupe (`lowercase`, trim, hyphen policy)

## 2) Embedding inputs

### Article text input

Use compact context:

- title
- domain
- first 1500-2000 chars of extracted content (if available)

Format:

```
Title: <title>
Domain: <domain>
Content: <excerpt>
```

### Tag embedding input

Use tag descriptor text (not tag key only).
Example:

- tag: `typescript`
- descriptor: `TypeScript, ts, typed JavaScript, frontend/backend development`

## 3) Scoring

- Embed article text once
- Embed all tag descriptors (cached)
- cosine similarity per candidate
- sort desc, keep top `maxTags` above `minScore`

## 4) Guardrails

- stopwords blocklist (`news`, `article`, `general`, etc.)
- min tag length (>= 2)
- dedupe by canonical slug
- optional domain boosts (e.g. `github.com` -> `dev`, `code`)

---

## Config

Add env/config controls:

- `STASH_AUTO_TAGS_ENABLED=false`
- `STASH_AUTO_TAGS_MAX=3`
- `STASH_AUTO_TAGS_MIN_SCORE=0.62`
- `STASH_AUTO_TAGS_MODEL=all-MiniLM-L6-v2`

Optional runtime backend selector:

- `STASH_AUTO_TAGS_BACKEND=python` (default for v1.5)

---

## Model Runtime Options

### Preferred (v1.5): Python helper

Use `sentence-transformers` in a small Python helper script:

- load `all-MiniLM-L6-v2`
- accept JSON payload (article + candidates)
- return ranked scores JSON

Pros: reliable model support, straightforward implementation.

### Future option: JS/ONNX

Move to transformers.js/onnxruntime for single-runtime deployment if desired.

---

## Implementation Plan

### Phase 1 (Deterministic baseline)

- Add `config/seed-tags.json`
- Add simple keyword/domain heuristic tagger
- Add CLI flags + JSON response fields
- Add tests for merge/dedupe/limits

### Phase 2 (Embeddings ranking)

- Add embedding service abstraction (`auto-tags` service)
- Add Python helper runtime + health check
- Rank candidate tags via embeddings
- Keep heuristics as fallback when model unavailable

### Phase 3 (Polish)

- Cache tag embeddings on disk
- Add `stash tags doctor` diagnostics
- Add optional score output in non-JSON mode

---

## Data Contracts (suggested)

### Internal result

```ts
interface AutoTagResult {
  applied: string[];
  candidates: Array<{ tag: string; score: number; source: 'embedding' | 'rule' }>;
  skippedReason?: 'disabled' | 'no-content' | 'model-unavailable';
}
```

---

## Testing

- Unit: normalization, scoring threshold, dedupe
- Unit: merge behavior with manual tags
- Unit: deterministic fallback when model unavailable
- Integration: `save --auto-tags` applies expected tags on fixture pages

---

## Rollout Recommendation

- Start with `--auto-tags` opt-in
- Observe quality for 1-2 weeks
- If precision is good, allow default-on with `--no-auto-tags` override

---

## Risks & Mitigation

- **Noisy tags** -> strict threshold + max tags + stoplist
- **Model latency** -> short text window + embedding cache
- **Runtime fragility** -> deterministic fallback and clear errors

---

## Success Criteria

- Median 1-3 useful auto tags per article
- Low incorrect-tag rate (<15% subjective review)
- No regression in `save` latency beyond acceptable threshold
