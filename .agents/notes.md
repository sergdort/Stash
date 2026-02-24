[1] In this sandbox, dependency installs can fail for two environment reasons: `pnpm install` may require `CI=true` in non-TTY mode, and external registry resolution (`registry.npmjs.org`) may be unavailable, which blocks lockfile/dependency updates.

[2] In this sandbox, integration tests that bind a local HTTP listener (e.g., `startWebServer` on `127.0.0.1`) can fail with `listen EPERM`; validate those tests in a less restricted environment.

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
[0] CLI integration tests execute `dist/apps/cli/src/cli.js`; always run `pnpm run build` after source edits and before targeted integration runs, otherwise tests can fail against stale command behavior.
[0] With VS Code `node-terminal` launch running `pnpm run dev -- web`, the debugger UI can show wrapper-process disconnect messages (`Debugger attached` / `Waiting for the debugger to disconnect...`) even while the actual `stash web` child process is still running; verify via `/api/health` and use an attach config for breakpoints in the real process.
[0] `scripts/with-env.mjs` should forward `SIGINT`/`SIGTERM`/`SIGHUP` to its spawned child; otherwise VS Code stop/terminate can kill the wrapper and orphan long-running child processes (e.g., `stash web`) on their ports.
[0] For X/Twitter pages, `page.content()` can include the `<noscript>` "JavaScript is not available" fallback even when Playwright successfully rendered the app DOM. Treat that message as non-authoritative and key extraction off rendered `data-testid` content instead.
