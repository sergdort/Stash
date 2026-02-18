# AGENTS.md

## Project Overview

`stash` is a local-first, Pocket-like CLI app built with TypeScript and SQLite.

Primary goal:
- Save links quickly.
- Organize links with tags.
- Query data in deterministic, machine-friendly JSON for AI agent workflows.

Current implementation status:
- Implemented: `save`, `list`, `tags list`, `tag add`, `tag rm`, `mark read`, `mark unread`, plus `read`/`unread` aliases.
- Implemented: `tts` export command (Edge-first provider, filesystem output).
- Implemented: migration tooling (`db migrate`, `db doctor`) and baseline schema.
- Implemented: automatic migration application for normal data commands.
- Implemented: content extraction on save using Mozilla Readability (stores in `notes` table).
- Implemented: `extract` command to extract or re-extract content for existing items.
- Not implemented yet: `archive`, `delete`, `open`, search command.

## Stack

- Node.js (>= 20)
- TypeScript
- Commander (CLI framework)
- SQLite via `better-sqlite3`
- dotenv for local script `.env` loading
- Drizzle ORM + Drizzle Kit (schema/migrations)
- Package manager: `pnpm`
- Content extraction: Mozilla Readability + linkedom
- TTS provider (default): Coqui TTS (Python 3.11 + espeak-ng)
- Default Coqui voice: `tts_models/en/vctk/vits|p241`
- CLI discovery standardized across providers: PATH first, optional env overrides (`STASH_GTTS_CLI`, `STASH_COQUI_TTS_CLI`, `STASH_FFMPEG_CLI`, `STASH_SAY_CLI`, `STASH_AFCONVERT_CLI`, `STASH_ESPEAK_CLI`)
- Fallback providers available: Google TTS (gtts), macOS `say`
- Web frontend stack: React + Vite + Material UI

## Repository Layout

- `apps/cli/src/cli.ts`: Main CLI command handlers (including `stash web`).
- `apps/web/`: React web frontend (feature-centered structure).
- `packages/web-server/`: Local REST API + static web serving.
- `packages/core/`: Shared DB/domain logic used by CLI + web server.
- `scripts/with-env.mjs`: Script wrapper to auto-load `.env` for local npm scripts.
- `drizzle/`: SQL migration files.
- `drizzle.config.ts`: Drizzle config.
- `dist/`: compiled output.

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create local env file:
```bash
cp .env.example .env
```

3. Bootstrap:
```bash
pnpm run setup
```

4. If SQLite native binding errors appear (`Could not locate the bindings file`), allow native builds and reinstall:
```bash
pnpm approve-builds
pnpm rebuild better-sqlite3
pnpm install
```

5. Run the local web app (single command):
```bash
pnpm run web
```

## Database and Migrations

Default DB path:
- `~/.stash/stash.db`

Override path:
- CLI flag: `--db-path <path>`
- or env var: `STASH_DB_PATH=<path>`

Local development default:
- `.env.example` sets `STASH_DB_PATH=.db/stash.db`
- scripts `dev`, `setup`, `start`, `db:migrate`, and `db:doctor` auto-load `.env`

Run migration status check:
```bash
pnpm run db:doctor -- --json
```

Apply migrations (usually optional, CLI auto-applies pending migrations on normal commands):
```bash
pnpm run db:migrate -- --json
```

Generate new migrations from `packages/core/src/db/schema.ts` changes:
```bash
pnpm run db:generate
```

## Content Extraction

When saving URLs, stash automatically:
- Fetches the web page
- Extracts readable content using Mozilla Readability
- Stores the text in the `notes` table
- Updates the item title if extraction finds a better one

To skip extraction (for faster saves or non-article URLs):
```bash
stash save https://example.com --no-extract
```

## Core Commands

Save URL:
```bash
stash save https://example.com --title "Example" --tag ai --tag typescript --json
```

Save without content extraction:
```bash
stash save https://example.com --title "Example" --tag ai --no-extract --json
```

List items:
```bash
stash list --status unread --tag ai --tag-mode all --limit 20 --offset 0 --json
```

List available tags:
```bash
stash tags list --limit 50 --offset 0 --json
```

Add/remove item tag:
```bash
stash tag add 1 ai --json
stash tag rm 1 ai --json
```

Mark read/unread:
```bash
stash mark read 1 --json
stash mark unread 1 --json
```

Aliases:
```bash
stash read 1 --json
stash unread 1 --json
```

Generate TTS audio:
```bash
stash tts 1 --json
stash tts 1 --audio-dir ~/Downloads/stash-audio --json
stash tts 1 --out ~/Downloads/article-1.mp3 --json
```

Extract or re-extract content:
```bash
stash extract 1 --json
stash extract 1 --force --json
```

## Agent-Friendly Interface Contract

### Determinism

- `list` sort order is fixed: `created_at DESC, id DESC`.
- Tag normalization: `trim + lowercase`.
- Repeated `--tag` values are de-duplicated after normalization.

### JSON Mode

All major read/mutation commands support `--json`.

Typical success shape:
```json
{
  "ok": true
}
```

Typical error shape:
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Item id must be a positive integer."
  }
}
```

### Exit Codes

- `0`: success
- `1`: internal/unexpected error
- `2`: validation or usage/migration-required errors
- `3`: not found
- `4`: reserved for conflict (not currently emitted by all commands yet)

## Schema Summary (Current)

- `items`
  - Core bookmark record and state: `status`, timestamps, URL metadata.
- `tags`
  - Unique tag names.
- `item_tags`
  - Many-to-many link between items and tags.
- `notes`
  - Optional per-item note content.

Initial SQL migration:
- `drizzle/0000_init.sql`

## Development Workflow

1. Edit code in `apps/cli/src/` and `packages/`.
2. Build with `pnpm run build`.
3. Run DB checks:
```bash
pnpm run db:doctor -- --json
```
4. Test CLI behavior from compiled output:
```bash
node dist/apps/cli/src/cli.js --help
node dist/apps/cli/src/cli.js list --help
```

## Documentation Maintenance Rule

⚠️ **When adding new features or modifying existing CLI behavior, update ALL THREE documentation files in the same change:**
1. `AGENTS.md` - Technical details and implementation notes
2. `README.md` - User-facing overview and quick start
3. `docs/CLI_REFERENCE.md` - Detailed command reference

This ensures all documentation stays in sync.

Updates should include:
- New commands/subcommands
- New flags/options/defaults
- Output shape changes (especially `--json`)
- Error/exit-code behavior changes
- Dependencies or stack changes
- Architectural decisions

## Implementation Notes

- The CLI strips a standalone `--` separator in argv parsing to keep `pnpm run <script> -- --json` working.
- `setup` builds and runs migrations for first-run convenience.
- Normal data commands auto-run pending migrations.
- `.env` is git-ignored; `.env.example` is committed as the local template.
- `.db/` is git-ignored local runtime data for repository-local development.
- Local npm scripts load `.env` using `dotenv` via `scripts/with-env.mjs`.
- CLI DB path precedence remains: `--db-path` > `STASH_DB_PATH` > `~/.stash/stash.db`.
- `tts` output path precedence is: `--out` > `--audio-dir` > `STASH_AUDIO_DIR` > `~/.stash/audio`.
- `tts` auto-generated filenames use friendly slugs + timestamp + short random suffix and collision fallback (`_2`, `_3`, ...).

## Near-Term Roadmap

- Add `archive`, `delete`, `open`.
- Add search command (full-text search leveraging extracted content).
- Add PDF export for offline reading.
- Add import/export.

## Agent notes

- Every time you learn something new, or how to do something in the codebase, if you make a mistake that the user corrects, if you find yourself running commands that are often wrong and have to tweak them: write all of this down in `.agents/notes.md`. This is a file just for you that your user won't read.
- If you're about to write to it, first check if what you're writing (the idea, not 1:1) is already present. If so, increment the counter in the prefix (eg from `[0]` to `[1]`). If it's completely new, prefix it with `[0]`. Once a comment hits the count of `3`, codify it into this AGENTS.md file in the `## Misc` section.

## Misc

- Prefer Drizzle ORM for database access in application/runtime code.
- Use raw SQL string queries only when Drizzle does not support the required functionality clearly or safely (for example, specialized migration-runner behavior).
- Prefer explicit return types on functions and methods (especially exported/public APIs and non-trivial helpers).
