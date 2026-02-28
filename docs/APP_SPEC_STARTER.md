# APP_SPEC_STARTER.md

Use this as a reusable, app-agnostic starter when building a new assistant-friendly app.

---

## 1) App Intent

- **App name:** `<name>`
- **Domain:** `<finance|fitness|food|reading|tasks|...>`
- **Primary user outcome:** `<what decision or action this app helps with>`
- **Why assistant access matters:** `<how AI should help using this data>`

---

## 2) Behavior Archetype (choose primary + optional secondary)

- [ ] **Capture app** (user/manual entry)
- [ ] **Compute app** (derived metrics/insights)
- [ ] **Connector app** (external APIs)
- [ ] **Workflow app** (jobs, reminders, automations)

> Most apps combine 2+ archetypes. Pick one primary to keep scope clear.

---

## 3) Scope & Constraints

- **Local-first:** `yes/no`
- **Storage:** SQLite sandbox DB per app (`~/.<app>/<app>.db`)
- **Language:** TypeScript end-to-end
- **UI:** React + Material UI PWA
- **Private access:** Local + Tailscale
- **Out of scope (v1):** `<explicitly list what not to build yet>`

---

## 4) Data Ingestion Modes (pick all that apply)

- [ ] Manual input (CLI/PWA forms)
- [ ] File import (CSV/JSON)
- [ ] External connector sync (API/webhooks)
- [ ] Internal event ingestion (from other local apps)

### Ingestion rules

- All writes are validated.
- Timestamps normalized to ISO8601.
- Units normalized (currency, distance, calories, etc.).
- Idempotency strategy defined for imports/connectors.

---

## 5) Data Model (Source of Truth)

### Core entities

- `<entity_1>`
- `<entity_2>`
- `<entity_3>`

### Table layers

- `raw_*` (optional): source-level records
- `normalized_*`: canonical records
- `derived_*` / `daily_*` / `weekly_*`: precomputed insights

### Entity lifecycle

For each entity:
- created by: `user|import|connector|system`
- mutable fields: `<...>`
- derived fields: `<...>`
- archive/delete policy: `<...>`

---

## 6) Assistant-Friendly Contract

Expose data in four categories:

1. **state** — what exists now
2. **events** — what happened over time
3. **insights** — what it means
4. **actions** — what can be done next

### Response envelope (required)

```json
{
  "ok": true,
  "data": {},
  "paging": { "limit": 20, "offset": 0, "returned": 0 },
  "meta": { "generated_at": "<ISO>" }
}
```

### Error envelope (required)

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "..."
  }
}
```

### Provenance fields (recommended)

Include where relevant:
- `source`
- `source_id`
- `generated_at`
- `confidence`

---

## 7) CLI Contract (JSON-first)

Define neutral verbs (avoid sync-only assumptions):

- `<app> create ... --json`
- `<app> update ... --json`
- `<app> list ... --json`
- `<app> analyze ... --json`
- `<app> process ... --json`
- `<app> doctor --json`

Optional connector command:
- `<app> sync --json`

Exit code policy:
- `0` success
- `1` internal error
- `2` validation/usage
- `3` not found
- `4` conflict

---

## 8) API Contract

Minimum:
- `GET /api/health`
- `GET /api/<resource>`
- `POST /api/<resource>`
- `PATCH /api/<resource>/:id`

Optional:
- `POST /api/<resource>/process`
- `GET /api/insights/<period>`

Rules:
- deterministic field names
- stable sort order for list endpoints
- pagination fields always present on list responses

---

## 9) Architecture & File Structure

```text
apps/
  cli/src/cli.ts
  web/
    src/
    public/
packages/
  core/
    src/db/schema.ts
    src/features/
  web-server/
    src/features/
    src/app/
drizzle/
docs/
```

Flow:
`ingest -> normalize -> derive -> expose (CLI/API/PWA)`

---

## 10) Security & Access

- Per-app sandbox DB (no shared write access by default)
- Least-privilege API tokens/scopes
- Secrets only via env vars
- Tailscale/private network by default
- Explicit opt-in for any public exposure

---

## 11) PWA Baseline

- Mobile-first layout
- Add-to-home-screen icon + manifest
- Service worker shell caching
- Friendly offline/API-unreachable states
- Touch targets >= 44x44

---

## 12) Delivery Workflow (v1)

1. Fill this spec (intent, archetype, entities, contracts)
2. Build one vertical slice end-to-end
3. Run smoke checks
4. Expand features in thin slices
5. Keep docs + contracts in sync

---

## 13) Smoke Checks

```bash
pnpm install
pnpm run build
pnpm --dir apps/web build
```

CLI smoke:
- create/list/analyze/process JSON outputs

API smoke:
- `/api/health`
- primary list/create route

PWA smoke:
- mobile load via Tailscale
- action works end-to-end

---

## 14) Definition of Done (per feature)

- schema + core service implemented
- CLI + API contract fulfilled
- UI wired (if applicable)
- deterministic JSON responses
- tests/smoke pass
- docs updated:
  - `AGENTS.md`
  - `README.md`
  - `docs/CLI_REFERENCE.md`

---

## 15) Codex/Agent Scaffold Prompt Block

Use this block to avoid re-explaining architecture every time:

```text
Use APP_SPEC.md as the source of truth.
Scaffold in this order:
1) packages/core schema + services
2) apps/api routes/handlers
3) apps/cli commands (JSON-first)
4) apps/web PWA screens
5) smoke tests + docs

Respect contracts exactly:
- deterministic JSON envelopes
- stable list sorting
- explicit error codes
- local-first SQLite sandbox

Implement one thin vertical slice first before broadening scope.
```
