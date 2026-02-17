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

- Save URLs with automatic content extraction
- Organize with tags
- Mark items as read/unread
- Generate TTS audio from extracted article content
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
stash tts 1 --json
stash tts 1 --audio-dir ~/Downloads/audio
stash tts 1 --out ~/Downloads/article-1.mp3
```

## TTS Export

- Command: `stash tts <id> [--voice <name>] [--format mp3|wav] [--out <file>] [--audio-dir <dir>] [--json]`
- Provider in v1: Edge TTS
- Default output directory: `~/.stash/audio`
- Directory override precedence:
  1. `--out <file>` (exact output file path)
  2. `--audio-dir <dir>`
  3. `STASH_AUDIO_DIR`
  4. `~/.stash/audio`
- Auto-generated filenames are human-readable and unique to avoid overwriting.

## Agent-friendly behavior

- JSON mode via `--json`
- Deterministic list order: `created_at DESC, id DESC`
- Pagination via `--limit` and `--offset`
- Tag filtering via repeated `--tag` and `--tag-mode any|all`

## Stack

- TypeScript
- Commander (CLI)
- SQLite (`better-sqlite3`)
- dotenv (local dev script env loading)
- Drizzle ORM + Drizzle Kit
- Mozilla Readability + linkedom (content extraction)

## Roadmap

### Current Features
- ✅ Save URLs with titles and tags
- ✅ List items with filters (status, tags)
- ✅ Tag management (add, remove, list)
- ✅ Mark items as read/unread
- ✅ JSON output mode for automation
- ✅ Basic content extraction
- ✅ TTS export (Edge-first) with friendly unique filenames

### Coming Soon
- 🔍 **Full-text search** - Search across article content
- 📄 **PDF export** - Save articles for offline reading
- 🗄️ Archive & delete commands
- 📂 Import/export functionality
- 🔗 Open command for quick access
- 📊 Enhanced metadata extraction

## Notes

- Migrations are SQL files in `drizzle/`.
- Schema source is `src/db/schema.ts`.
- The initial migration creates `items`, `tags`, `item_tags`, and `notes`.
