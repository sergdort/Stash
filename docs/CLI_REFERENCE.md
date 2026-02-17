# stash CLI Documentation

This document is the user-facing reference for the current `stash` feature set.

`stash` is a local-first CLI for saving and organizing links with SQLite storage and tag-based retrieval.

## Current Feature Set

- Save links with automatic content extraction
- List links with status and tag filters
- List available tags with counts
- Add/remove tags on an item
- Mark items read/unread
- Generate TTS audio files from extracted note content
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
node dist/cli.js --help
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
STASH_DB_PATH=./.local/stash.db node dist/cli.js list --json
```

## Local Dev Environment

The following npm scripts auto-load variables from `.env`:
- `pnpm run dev`
- `pnpm run setup`
- `pnpm run start`
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
- Updates item title if extraction finds one and item has no title
- Use `--force` to re-extract even if content already exists
- Useful for:
  - Backfilling items saved before extraction was implemented
  - Retrying failed extractions
  - Updating content when articles change
  - Testing extraction improvements

Error codes:
- `NOT_FOUND` (3): Item ID doesn't exist
- `CONTENT_EXISTS` (4): Content already extracted (use `--force`)
- `EXTRACTION_FAILED` (1): Unable to extract readable content

## TTS Export

Generate audio from extracted content stored in `notes`:

```bash
stash tts <id> [--voice <name>] [--format mp3|wav] [--out <file>] [--audio-dir <dir>] [--json]
```

Defaults:
- Provider: Edge TTS
- `--voice en-US-AriaNeural`
- `--format mp3`
- Default output directory: `~/.stash/audio`

Output path precedence:
1. `--out <file>` (exact file path)
2. `--audio-dir <dir>`
3. `STASH_AUDIO_DIR`
4. `~/.stash/audio`

Behavior:
- `tts` requires extracted note content for the item; if not present, returns `NO_CONTENT`.
- Auto-generated filenames are friendly and collision-safe.
- JSON success payload includes:
  - `item_id`, `provider`, `voice`, `format`, `output_path`, `file_name`, `bytes`

Typical JSON response:

```json
{
  "ok": true,
  "item_id": 1,
  "provider": "edge",
  "voice": "en-US-AriaNeural",
  "format": "mp3",
  "output_path": "/Users/alex/.stash/audio/2026-02-17_example-article_id-1_en-us-arianeural_153045_k9x3vd.mp3",
  "file_name": "2026-02-17_example-article_id-1_en-us-arianeural_153045_k9x3vd.mp3",
  "bytes": 48291
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

Generate TTS in default audio directory:

```bash
stash tts 1 --json
```

Generate TTS in custom directory:

```bash
stash tts 1 --audio-dir ~/Downloads/stash-audio --json
```

Generate TTS to exact file path:

```bash
stash tts 1 --out ~/Downloads/article-1.mp3 --json
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
