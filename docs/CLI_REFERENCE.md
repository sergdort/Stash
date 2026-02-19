# stash CLI Documentation

This document is the user-facing reference for the current `stash` feature set.

`stash` is a local-first CLI for saving and organizing links with SQLite storage and tag-based retrieval.

## Current Feature Set

- Save links with automatic content + thumbnail extraction
- List links with status and tag filters
- List available tags with counts
- Add/remove tags on an item
- Mark items read/unread
- Queue and process async TTS jobs from extracted note content
- Run/inspect DB migrations
- Machine-friendly JSON output for agent workflows

## Install and Run

Requirements:
- Node.js >= 20
- `pnpm`

Install:

```bash
pnpm install
cp .env.example .env
pnpm run setup
```

If native SQLite bindings are missing:

```bash
pnpm approve-builds
pnpm rebuild better-sqlite3
pnpm run setup
```

Run compiled CLI:

```bash
node dist/apps/cli/src/cli.js --help
```

Command help:

```bash
stash --help
stash save --help
stash list --help
stash tts --help
stash db --help
```

## Global Installation

Local development global link (before npm publish):

```bash
pnpm install
pnpm run setup
pnpm link --global
stash --version
```

Remove global dev link:

```bash
pnpm unlink --global stash
```

Global install after publish:

```bash
npm install -g stash
stash --version
```

## Database Path

Default DB:
- `~/.stash/stash.db`

Override with:
- `--db-path <path>` on any command, or
- `STASH_DB_PATH=<path>` environment variable

Example:

```bash
STASH_DB_PATH=./.local/stash.db node dist/apps/cli/src/cli.js list --json
```

## Local Dev Environment

The following npm scripts auto-load variables from `.env`:
- `pnpm run dev`
- `pnpm run setup`
- `pnpm run start`
- `pnpm run web`
- `pnpm run db:migrate`
- `pnpm run db:doctor`

Implementation note:
- `.env` loading for these scripts is handled by `scripts/with-env.mjs` using `dotenv`.

Recommended setup:

```bash
cp .env.example .env
```

Default in `.env.example`:

```bash
STASH_DB_PATH=.db/stash.db
```

Path precedence remains:
1. `--db-path <path>`
2. `STASH_DB_PATH`
3. `~/.stash/stash.db`

## Command Reference

## Global

```bash
stash --db-path <path> <command>
```

## Database Commands

Most commands auto-run pending migrations, so you usually do not need to run migration commands manually.

Run pending migrations:

```bash
stash db migrate [--json] [--migrations-dir <path>]
```

Inspect migration status:

```bash
stash db doctor [--json] [--migrations-dir <path>] [--limit <n>]
```

## Web App

Run the local web frontend + REST API with one command:

```bash
pnpm run web
```

Equivalent CLI form:

```bash
stash web [--host <host>] [--port <n>]
```

Web UI stack:
- React + Vite
- Material UI (MUI)

Web API item payloads (`GET /api/items`, `GET /api/items/:id`, `POST /api/items`) include:
- `thumbnail_url: string | null`
- `has_extracted_content: boolean`
- `tts_audio: null | { file_name, format, provider, voice, bytes, generated_at }`

## Save

Save a URL:

```bash
stash save <url> [--title <text>] [--tag <name> ...] [--no-extract] [--json]
```

Behavior:
- URL is unique
- Re-saving same URL is idempotent (`created: false`)
- Tags are normalized (`trim + lowercase`)
- Content is automatically extracted using Mozilla Readability (unless `--no-extract`)
- Thumbnail metadata is extracted and persisted to `items.thumbnail_url` (`og:image`/`twitter:image` first, article-image fallback)
- Extracted title updates the item if no `--title` provided
- Extracted text is stored in the `notes` table for future search/TTS features

## List

List items:

```bash
stash list [--status unread|read|archived] [--tag <name> ...] [--tag-mode any|all] [--limit <n>] [--offset <n>] [--json]
```

Defaults:
- `--tag-mode any`
- `--limit 20`
- `--offset 0`
- Sort order: `created_at DESC, id DESC`

## Tags

List all tags:

```bash
stash tags list [--limit <n>] [--offset <n>] [--json]
```

Attach tag to item:

```bash
stash tag add <id> <tag> [--json]
```

Remove tag from item:

```bash
stash tag rm <id> <tag> [--json]
```

Idempotency:
- `tag add` on existing relation returns success with `added: false`
- `tag rm` on missing relation returns success with `removed: false`

## Read State

Mark read:

```bash
stash mark read <id> [--json]
```

Mark unread:

```bash
stash mark unread <id> [--json]
```

Aliases:

```bash
stash read <id> [--json]
stash unread <id> [--json]
```

## Extract Content

Extract or re-extract content for an item:

```bash
stash extract <id> [--force] [--json]
```

Behavior:
- Fetches the URL and extracts readable content using Mozilla Readability
- Stores extracted text in the `notes` table
- Persists extracted thumbnail metadata to `items.thumbnail_url`
- Updates item title if extraction finds one and item has no title
- Use `--force` to re-extract even if content already exists
- Useful for:
  - Backfilling items missing extracted text/thumbnail metadata (`stash extract <id> --force`)
  - Retrying failed extractions
  - Updating content when articles change
  - Testing extraction improvements

Error codes:
- `NOT_FOUND` (3): Item ID doesn't exist
- `CONTENT_EXISTS` (4): Content already extracted (use `--force`)
- `EXTRACTION_FAILED` (1): Unable to extract readable content

## TTS Export

Queue audio generation jobs from extracted content stored in `notes`:

```bash
stash tts <id> [--voice <name>] [--format mp3|wav] [--wait] [--json]
stash tts status <jobId> [--json]
stash jobs worker [--poll-ms <n>] [--once] [--json]
```

Defaults:
- Provider: Coqui TTS
- `--voice tts_models/en/vctk/vits|p241` (selected male voice)

Environment:
- `STASH_GTTS_CLI` (optional): absolute path to `gtts-cli` if not on PATH
- `STASH_COQUI_TTS_CLI` (optional): absolute path to Coqui `tts` CLI
- `STASH_FFMPEG_CLI` (optional): absolute path to `ffmpeg` for mp3/wav conversions
- `STASH_SAY_CLI` (optional): absolute path to macOS `say`
- `STASH_AFCONVERT_CLI` (optional): absolute path to macOS `afconvert`
- `STASH_ESPEAK_CLI` (optional): absolute path to `espeak-ng`/`espeak` for Coqui phonemizer
- `--format mp3`
- Worker poll interval: `1500ms` default
- Worker output directory:
  1. `STASH_AUDIO_DIR`
  2. `~/.stash/audio`

Behavior:
- `stash tts <id>` enqueues and returns immediately with `job_id` and polling hints.
- `stash tts <id> --wait` enqueues then waits for terminal job status.
- `stash tts status <jobId>` returns current job details.
- `stash jobs worker` processes queued jobs (`--once` processes at most one).
- One active (`queued|running`) TTS job per item is allowed; enqueue deduplicates active jobs.
- `tts` requires extracted note content; enqueue returns `NO_CONTENT` when missing.
- Job statuses: `queued`, `running`, `succeeded`, `failed`.
- Terminal job records are pruned after 30 days by worker maintenance.
- Web API (`POST /api/items/:id/tts`) returns:
  - `job` payload
  - `poll_url: /api/tts-jobs/<job_id>`
  - `poll_interval_ms`
- Web job status/history APIs:
  - `GET /api/tts-jobs/:id`
  - `GET /api/items/:id/tts-jobs?limit=<n>&offset=<n>`
- Web audio serving behavior:
  - `GET /api/audio/:fileName` returns inline-playable audio by default.
  - `GET /api/audio/:fileName?download=1` forces attachment download.
- Latest-audio persistence model:
  - Web/API stores only the latest generated TTS metadata per item (`item_audio` table).
  - No automatic backfill for previously generated audio files.

Typical JSON response:

```json
{
  "ok": true,
  "created": true,
  "job_id": 14,
  "status": "queued",
  "poll_interval_ms": 1500
}
```

## JSON Output Contract

Most commands support `--json`.

Example success:

```json
{
  "ok": true
}
```

Example error:

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Item 999 not found."
  }
}
```

Typical list response:

```json
{
  "ok": true,
  "items": [
    {
      "id": 1,
      "url": "https://example.com/article",
      "title": "Example article",
      "domain": "example.com",
      "status": "unread",
      "is_starred": false,
      "has_extracted_content": true,
      "tts_audio": null,
      "tags": ["ai", "cli"],
      "created_at": "2026-02-14T20:00:00.000Z",
      "updated_at": "2026-02-14T20:00:00.000Z",
      "read_at": null,
      "archived_at": null
    }
  ],
  "paging": {
    "limit": 20,
    "offset": 0,
    "returned": 1
  }
}
```

## Exit Codes

- `0` success
- `1` internal/unexpected error
- `2` validation, migration-required, or TTS content/provider setup errors (for example `NO_CONTENT`, `TTS_PROVIDER_UNAVAILABLE`)
- `3` not found
- `4` reserved for conflict

## Examples

Initialize DB manually (optional):

```bash
stash db migrate --json
```

Save two links:

```bash
stash save https://example.com/a --title "A" --tag ai --tag reading
stash save https://example.com/b --title "B" --tag cli
```

Save without content extraction (faster, for non-article URLs):

```bash
stash save https://github.com/some/repo --tag code --no-extract
```

List unread links tagged `ai`:

```bash
stash list --status unread --tag ai --json
```

Mark an item read:

```bash
stash mark read 1 --json
```

List tags:

```bash
stash tags list --json
```

Extract content for an item (useful for old items):

```bash
stash extract 1 --json
```

Re-extract content even if it already exists:

```bash
stash extract 1 --force --json
```

Queue TTS job:

```bash
stash tts 1 --json
```

Queue and wait for terminal result:

```bash
stash tts 1 --wait --json
```

Check job status:

```bash
stash tts status 14 --json
```

Run one worker pass:

```bash
stash jobs worker --once --json
```

## Roadmap (Not Implemented Yet)

- `archive`, `delete`, `open`
- Search command (leveraging extracted content)
- Import/export

## Publishing Docs to GitHub Pages Later

This repo is now markdown-first. You can convert these docs to a static docs site later with minimal changes.

Recommended path:
1. Keep authoring docs in `docs/*.md`
2. Add a static docs generator later (for example Docusaurus, MkDocs, or VitePress)
3. Configure GitHub Pages deployment from the generated `build`/`site` directory

Because the content is already structured and command-focused, migration to static HTML should be straightforward.
