# stash

Local-first Pocket-like CLI built with TypeScript and SQLite.

## Documentation

- CLI reference: `docs/CLI_REFERENCE.md`

## Setup

```bash
pnpm install
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
```

## Agent-friendly behavior

- JSON mode via `--json`
- Deterministic list order: `created_at DESC, id DESC`
- Pagination via `--limit` and `--offset`
- Tag filtering via repeated `--tag` and `--tag-mode any|all`

## Stack

- TypeScript
- Commander (CLI)
- SQLite (`better-sqlite3`)
- Drizzle ORM + Drizzle Kit
- Mozilla Readability + linkedom (content extraction)

## Notes

- Migrations are SQL files in `drizzle/`.
- Schema source is `src/db/schema.ts`.
- The initial migration creates `items`, `tags`, `item_tags`, and `notes`.
