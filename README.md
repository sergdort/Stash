# stash

Local-first Pocket-like CLI built with TypeScript and SQLite.

## Documentation

- CLI reference: `docs/CLI_REFERENCE.md`

## Setup

```bash
pnpm install
cp .env.example .env
pnpm run setup
```

## Web App (One Command)

Run the local PWA frontend + API with a single command:

```bash
pnpm run web
```

This script builds the TypeScript backend and React frontend, then starts:
- API: `http://127.0.0.1:4173`
- PWA: `http://127.0.0.1:5173`

You can configure these via `.env`:

```bash
STASH_WEB_HOST=127.0.0.1
STASH_API_PORT=4173
STASH_PWA_PORT=5173
```

Or override at runtime:

```bash
stash web --host 127.0.0.1 --api-port 4173 --pwa-port 5173
```

If you see a `better-sqlite3` binding error on first run:

```bash
pnpm approve-builds
pnpm rebuild better-sqlite3
pnpm run setup
```

## Code Quality

```bash
pnpm run lint
pnpm run format:check
pnpm run check
```

To apply formatting and safe lint fixes:

```bash
pnpm run format
pnpm run lint:fix
```

### VS Code

- Install the `Biome` extension (`biomejs.biome`).
- This workspace is configured for auto-fix on save (format + fix-all + organize imports).
- Use CLI checks to verify parity:
  - `pnpm run lint`
  - `pnpm run format:check`

## Global Install

For local development (before publishing):

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

After publishing to npm:

```bash
npm install -g stash
stash --version
```

## Database

Default database path is `~/.stash/stash.db`. Override with `--db-path`.

For local development scripts (`pnpm run dev`, `pnpm run setup`, `pnpm run db:migrate`, `pnpm run db:doctor`, `pnpm run start`), `.env` is auto-loaded. The template sets:

```bash
STASH_DB_PATH=.db/stash.db
```

Path precedence is unchanged:
1. `--db-path <path>`
2. `STASH_DB_PATH`
3. `~/.stash/stash.db` fallback

Most CLI commands auto-run pending migrations, so manual migration is usually not needed.

```bash
pnpm run db:migrate
pnpm run db:doctor
```

```bash
stash db migrate --json
stash db doctor --json
```

## Features

- Save URLs with automatic content + thumbnail extraction
- Extract or re-extract content for existing items
- Organize with tags
- Mark items as read/unread
- Generate TTS audio from extracted article content
- Play previously generated TTS audio in the web UI
- Machine-friendly JSON output
- Local SQLite storage

## Commands

```bash
stash save https://example.com --tag typescript --tag cli
stash save https://example.com --no-extract  # skip content extraction
stash list --status unread --tag typescript --tag-mode all
stash list --json
stash tags list --json
stash tag add 1 productivity
stash tag rm 1 productivity
stash mark read 1
stash mark unread 1
stash extract 1  # extract content + thumbnail metadata for an existing item
stash extract 1 --force  # re-extract even if content exists
stash tts 1 --json
stash tts 1 --wait --json
stash tts status 12 --json
stash tts doctor --json
stash jobs worker --once --json
```

## TTS Export

- Command: `stash tts <id> [--voice <name>] [--format mp3|wav] [--wait] [--json]`
- Status command: `stash tts status <jobId> [--json]`
- Health check command: `stash tts doctor [--json]`
- Worker command: `stash jobs worker [--poll-ms <n>] [--once] [--json]`
- Provider: Coqui TTS (local, high quality)
- Default voice: `tts_models/en/vctk/vits|p241`
- Setup: Python 3.11 env + `pip install TTS` + `brew install espeak-ng`
- CLI discovery: auto-detects binaries from `PATH` with optional env overrides (`STASH_COQUI_TTS_CLI`, `STASH_ESPEAK_CLI`, `STASH_FFMPEG_CLI`, etc.)
- See `docs/COQUI_SETUP.md` for full setup instructions
- See `docs/TTS_MACOS.md` for all TTS options
- Default queue polling interval: `1500ms`
- Async queue model:
  - `stash tts <id>` enqueues job and returns `job_id` immediately.
  - `stash tts <id> --wait` waits for terminal status and prints generated output metadata.
  - `stash tts doctor` checks required local binaries and Coqui CLI flag compatibility (`--text_file`, `--progress_bar`).
  - `stash jobs worker` processes queued jobs (`--once` is test/dev friendly).
- Worker audio output directory precedence:
  1. `STASH_AUDIO_DIR`
  2. `~/.stash/audio`
- Web/API persistence model for playback is latest-only per item (`item_audio` table, no backfill for old files).
- Web/API `POST /api/items/:id/tts` response includes:
  - `job` payload (`queued|running|succeeded|failed`)
  - `poll_url: /api/tts-jobs/<job_id>`
  - `poll_interval_ms`
- Web/API job endpoints:
  - `GET /api/tts-jobs/:id`
  - `GET /api/items/:id/tts-jobs?limit=<n>&offset=<n>`
- `GET /api/audio/:fileName` is inline-playable by default and attachment when `?download=1` is set.

## Agent-friendly behavior

- JSON mode via `--json`
- Deterministic list order: `created_at DESC, id DESC`
- Pagination via `--limit` and `--offset`
- Tag filtering via repeated `--tag` and `--tag-mode any|all`
- Web/API item payloads include:
  - `thumbnail_url` (`string | null`)
  - `has_extracted_content` (`boolean`)
  - `tts_audio` (`null | { file_name, format, provider, voice, bytes, generated_at }`)

## Stack

- TypeScript
- Commander (CLI)
- SQLite (`better-sqlite3`)
- dotenv (local dev script env loading)
- Drizzle ORM + Drizzle Kit
- Mozilla Readability + linkedom (content extraction)
- React + Vite (web frontend)
- Material UI (web UI component system)

## Roadmap

### Current Features
- ✅ Save URLs with titles and tags
- ✅ List items with filters (status, tags)
- ✅ Tag management (add, remove, list)
- ✅ Mark items as read/unread
- ✅ JSON output mode for automation
- ✅ Basic content extraction
- ✅ Async TTS job queue (Coqui-first) with worker command
- ✅ Web playback for latest generated item audio

### Coming Soon
- 🔍 **Full-text search** - Search across article content
- 📄 **PDF export** - Save articles for offline reading
- 🗄️ Archive & delete commands
- 📂 Import/export functionality
- 🔗 Open command for quick access
- 📊 Enhanced metadata extraction

## Notes

- Migrations are SQL files in `drizzle/`.
- Schema source is `packages/core/src/db/schema.ts`.
- Current schema includes `items`, `tags`, `item_tags`, `notes`, `item_audio`, and `tts_jobs`.
