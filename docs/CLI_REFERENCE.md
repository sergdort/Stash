# stash CLI Documentation

This document is the user-facing reference for the current `stash` feature set.

⚠️ **Documentation Maintenance Rule**: When adding new features or modifying existing CLI behavior, update this file, `AGENTS.md`, and `README.md` in the same change. This ensures all documentation stays in sync.

`stash` is a local-first CLI for saving and organizing links with SQLite storage and tag-based retrieval.

## Current Feature Set

- Save links with automatic content extraction
- List links with status and tag filters
- List available tags with counts
- Add/remove tags on an item
- Mark items read/unread
- Run/inspect DB migrations
- Machine-friendly JSON output for agent workflows

## Install and Run

Requirements:
- Node.js >= 20
- `pnpm`

Install:

```bash
pnpm install
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
- `2` validation or migration-required errors
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

## Roadmap (Not Implemented Yet)

- `archive`, `delete`, `open`
- Search command (leveraging extracted content)
- TTS export (using extracted text)
- Import/export

## Publishing Docs to GitHub Pages Later

This repo is now markdown-first. You can convert these docs to a static docs site later with minimal changes.

Recommended path:
1. Keep authoring docs in `docs/*.md`
2. Add a static docs generator later (for example Docusaurus, MkDocs, or VitePress)
3. Configure GitHub Pages deployment from the generated `build`/`site` directory

Because the content is already structured and command-focused, migration to static HTML should be straightforward.
