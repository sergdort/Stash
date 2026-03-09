[2] In this sandbox, dependency installs can fail for two environment reasons: `pnpm install` may require `CI=true` in non-TTY mode (and sometimes `--no-frozen-lockfile` when package.json changed), and external registry resolution (`registry.npmjs.org`) may be unavailable, which blocks lockfile/dependency updates.

[3] In this sandbox, integration tests or dev servers that bind a local HTTP listener (e.g., `startWebServer`/Vite on `127.0.0.1`) can fail with `listen EPERM`; validate those flows in a less restricted environment.

[0] If `pnpm add` fails with `ERR_PNPM_UNEXPECTED_STORE`, rerun with `--store-dir` pointing to the store path used by current `node_modules` (for this repo: `/Users/sergiishulga/Library/pnpm/store/v10`).

[1] Repo-wide `pnpm run lint` and `pnpm run format:check` can fail due pre-existing diagnostics unrelated to current scoped changes; report scoped verification separately when needed.

[0] For integration suites with optional system prerequisites (e.g., Coqui/espeak for TTS), add capability probes and skip only the dependent test group so `pnpm test` remains reliable across developer machines and restricted sandboxes.

[0] When adding features or changing CLI behavior, always update three files: `AGENTS.md`, `README.md`, and `docs/CLI_REFERENCE.md`. This keeps all documentation in sync and helps future developers (including AI agents) understand the current state.

[1] X/Twitter `status/<id>` pages often require JavaScript-rendered DOM extraction. A headless Playwright path can work without X API credits, but keep strict no-fallback behavior for X URLs and avoid over-aggressive title cleanup (e.g. stripping a meaningful `on X` phrase from article titles).

[0] In Commander async actions, wrapping logic in a synchronous try/catch helper is not enough; promise rejections bypass that catch unless the helper also handles Promise returns (`result instanceof Promise ? result.catch(...) : result`).

[0] Keep the main `test` script generic (`vitest run`) so new tests are auto-discovered; reserve file-specific script arguments for targeted runs like `test:integration`.

[0] When loading data for a single CLI action, prefer one joined DB query over sequential queries when it keeps semantics clear (e.g., item + note content for `tts`).

[0] To auto-load `.env` in npm scripts consistently, use a small wrapper script that calls `dotenv.config({ path: '.env', override: false })` and then spawns the target command.

[0] Edge TTS provider uses an unofficial Microsoft API endpoint that can break or change without notice. When getting 404 errors, the Edge endpoint is likely down/blocked. Need to implement alternative TTS providers (OpenAI, ElevenLabs, local) for reliability.

[0] `@types/react-dom` version `^19.2.2` is invalid on npm; use an available range such as `^19.1.9` when setting up React 19 TypeScript support.

[0] If `pnpm install` fails after `Recreating .../node_modules`, local commands like `tsc`/`vite` may disappear until dependencies are successfully restored.

[0] For deterministic CLI/web TTS tests, set `STASH_TTS_MOCK_BASE64` in Vitest setup (not per-test) so child `spawnSync` CLI calls inherit the same mock audio payload.

[0] If `pyenv virtualenv` errors with `no such command 'virtualenv'`, install the `pyenv-virtualenv` plugin and add `eval "$(pyenv virtualenv-init -)"` to shell init before creating Coqui environments.

[0] `biome lint` does not enforce Assist actions like `assist/source/organizeImports`; use `biome check` (or dedicated scripts like `lint:strict`) to match VS Code organize-import diagnostics.
[0] On macOS, Coqui model tests like `tts_models/en/ljspeech/vits` can fail with "No espeak backend found" until `espeak-ng` is installed and `PHONEMIZER_ESPEAK_LIBRARY` points to `$(brew --prefix espeak-ng)/lib/libespeak-ng.dylib`.
[0] In Coqui CLI examples, avoid `--text -`: many setups treat it as literal `"-"` instead of stdin, which can trigger Tacotron2 kernel-size runtime errors on too-short input. Use `--text "..."` or pipe via `xargs`.
[0] When adding a new DB migration, update CLI integration assertions that hard-code `db doctor` migration counts (e.g., expected `applied_count`) to prevent false negatives.
[0] In sandboxed tests, default `~/.stash/audio` can be unwritable; set `STASH_AUDIO_DIR` to a temp path for worker-based TTS tests/commands.
[0] Coqui CLI variants differ: some support `--text_file`, others only `--text`. Keep provider invocation backward compatible by retrying with inline `--text` when `--text_file`/`--progress_bar` is rejected.
[0] CLI integration tests execute `apps/cli/dist/cli.js`; always run `pnpm run build` after source edits and before targeted integration runs, otherwise tests can fail against stale command behavior.
[0] With VS Code `node-terminal` launch running `pnpm run dev -- web`, the debugger UI can show wrapper-process disconnect messages (`Debugger attached` / `Waiting for the debugger to disconnect...`) even while the actual `stash web` child process is still running; verify via `/api/health` and use an attach config for breakpoints in the real process.
[0] `scripts/with-env.mjs` should forward `SIGINT`/`SIGTERM`/`SIGHUP` to its spawned child; otherwise VS Code stop/terminate can kill the wrapper and orphan long-running child processes (e.g., `stash web`) on their ports.
[0] For X/Twitter pages, `page.content()` can include the `<noscript>` "JavaScript is not available" fallback even when Playwright successfully rendered the app DOM. Treat that message as non-authoritative and key extraction off rendered `data-testid` content instead.
[0] `pnpm run dev -- web` launches the CLI web stack (API + built static PWA) and does not provide Vite HMR. For frontend hot reload, run Vite (`pnpm run dev:web`) with API separately (now `pnpm run dev:stack` does both).
[0] Current web UI architecture is intentionally mobile-first single-column across all viewport sizes; desktop split-pane branches were removed from `app-shell`, `inbox-filters`, and `inbox-list`.
[0] In Fastify/Ajv query validation, `oneOf` with numeric query params can produce false validation failures (e.g. `querystring/limit must match exactly one schema in oneOf`) due to coercion behavior; use a single string schema pattern for query params and parse downstream.
[1] Drizzle SQLite table-rebuild migrations can generate invalid copy SQL when adding new columns (`INSERT ... SELECT` referencing columns that do not exist on the old table). After `drizzle-kit generate`, always verify the data-copy statement and map new columns to constants/nulls for backward-compatible migration.
[0] In TypeScript tests, shell script snippets inside template literals must escape `${...}` as `\${...}`; otherwise the TS parser treats them as JS interpolation and breaks compilation.
[0] With `exactOptionalPropertyTypes: true`, do not pass explicit `undefined` for optional object fields; build payload objects with conditional spreads so omitted fields stay omitted.
[0] Homebrew Python can enforce PEP 668 (`externally-managed-environment`) and block global `pip install`; document and prefer a small project-local virtualenv flow for optional Python helpers like auto-tags.
[0] In SQLite table-rebuild migrations (`__new_*` + rename), `CHECK` constraints must reference unqualified column names; qualifiers like `__new_table.column` can break after rename.
[0] Drizzle SQLite migrator runs migrations in a transaction; `PRAGMA foreign_keys=OFF` inside migration SQL may not disable FK checks. Table-copy migrations should filter/clean orphan rows explicitly (e.g., `INNER JOIN` parents) instead of relying on that pragma.
[0] CI `validate` workflow currently runs `format:check`, `lint`, `test`, and `apps/web` build. Before pushing, run all four locally to avoid fast-follow CI fix commits.
[0] `stash db doctor` does not create parent directories for a missing DB path; if `STASH_DB_PATH` points to a non-existent directory, command can fail with `unable to open database file`.
[0] Prefer explicit named types over `ReturnType<typeof ...>` in production code/tests for readability and easier review comments.
[0] `tithe web` parity means flag-based daemon controls (`--daemon`, `--status`, `--stop`), not `start`/`stop` subcommands; mirror that CLI shape when porting its web supervisor flow into `stash`.
[0] In Commander, a root/global option like `--db-path` is not reliable as a duplicate command-local option on hidden subcommands. For internal commands, pass the global flag before the subcommand (`stash --db-path ... web-supervisor`) and read it from `program.opts()` inside the action.
