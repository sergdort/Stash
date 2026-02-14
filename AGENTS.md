# AGENTS.md

## Project Overview

`stash` is a local-first, Pocket-like CLI app built with TypeScript and SQLite.

Primary goal:
- Save links quickly.
- Organize links with tags.
- Query data in deterministic, machine-friendly JSON for AI agent workflows.

Current implementation status:
- Implemented: `save`, `list`, `tags list`, `tag add`, `tag rm`, `mark read`, `mark unread`, plus `read`/`unread` aliases.
- Implemented: migration tooling (`db migrate`, `db doctor`) and baseline schema.
- Not implemented yet: `archive`, `delete`, `open`, full-text content extraction, search command.

## Stack

- Node.js (>= 20)
- TypeScript
- Commander (CLI framework)
- SQLite via `better-sqlite3`
- Drizzle ORM + Drizzle Kit (schema/migrations)
- Package manager: `pnpm`

## Repository Layout

- `src/cli.ts`: CLI entrypoint and command handlers.
- `src/db/schema.ts`: Drizzle schema definition.
- `src/db/migrate.ts`: SQL migration runner + migration tracking table.
- `src/db/client.ts`: SQLite connection setup and PRAGMA config.
- `drizzle/`: SQL migration files.
- `drizzle.config.ts`: Drizzle config.
- `dist/`: compiled output.

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Build:
```bash
pnpm run build
```

3. If SQLite native binding errors appear (`Could not locate the bindings file`), allow native builds and reinstall:
```bash
pnpm approve-builds
pnpm rebuild better-sqlite3
pnpm install
```

## Database and Migrations

Default DB path:
- `~/.stash/stash.db`

Override path:
- CLI flag: `--db-path <path>`
- or env var: `STASH_DB_PATH=<path>`

Run migration status check:
```bash
pnpm run db:doctor -- --json
```

Apply migrations:
```bash
pnpm run db:migrate -- --json
```

Generate new migrations from `src/db/schema.ts` changes:
```bash
pnpm run db:generate
```

## Core Commands

Save URL:
```bash
stash save https://example.com --title "Example" --tag ai --tag typescript --json
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

1. Edit code in `src/`.
2. Build with `pnpm run build`.
3. Run DB checks:
```bash
pnpm run db:doctor -- --json
```
4. Test CLI behavior from compiled output:
```bash
node dist/cli.js --help
node dist/cli.js list --help
```

## Documentation Maintenance Rule

When adding a new feature or modifying existing CLI behavior, update `docs/CLI_REFERENCE.md` in the same change.

This includes:
- New commands/subcommands
- New flags/options/defaults
- Output shape changes (especially `--json`)
- Error/exit-code behavior changes

## Implementation Notes

- The CLI strips a standalone `--` separator in argv parsing to keep `pnpm run <script> -- --json` working.
- `db:doctor` and `db:migrate` scripts compile before execution via `pre*` hooks.
- If DB tables are missing for data commands, CLI returns `MIGRATION_REQUIRED` and instructs to run `stash db migrate`.

## Near-Term Roadmap

- Add `archive`, `delete`, `open`.
- Add search command.
- Add optional metadata enrichment on save.
- Add import/export.

## Agent notes

- Every time you learn something new, or how to do something in the codebase, if you make a mistake that the user corrects, if you find yourself running commands that are often wrong and have to tweak them: write all of this down in `.agents/notes.md`. This is a file just for you that your user won't read.
- If you're about to write to it, first check if what you're writing (the idea, not 1:1) is already present. If so, increment the counter in the prefix (eg from `[0]` to `[1]`). If it's completely new, prefix it with `[0]`. Once a comment hits the count of `3`, codify it into this AGENTS.md file in the `## Misc` section.
